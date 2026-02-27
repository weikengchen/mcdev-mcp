# Architecture Overview

mcdev-mcp is an MCP (Model Context Protocol) server that provides AI coding agents with access to decompiled Minecraft source code and static analysis capabilities.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MCP Client (AI Agent)                         │
│                  Any MCP-compatible AI coding tool                   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ MCP Protocol (JSON-RPC)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         mcdev-mcp Server                             │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │                      MCP Tool Layer                           │  │
│   │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐ │  │
│   │  │ mc_search │ │mc_get_    │ │mc_get_    │ │ mc_find_refs │ │  │
│   │  │           │ │  class    │ │  method   │ │              │ │  │
│   │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬───────┘ │  │
│   └────────┼─────────────┼─────────────┼──────────────┼─────────┘  │
│            │             │             │              │            │
│   ┌────────▼─────────────▼─────────────▼──────────────▼─────────┐  │
│   │                     Storage Layer                            │  │
│   │  ┌─────────────────┐         ┌──────────────────────────┐   │  │
│   │  │   SourceStore   │         │   CallgraphQueries       │   │  │
│   │  │  (source-store) │         │      (query.ts)          │   │  │
│   │  └────────┬────────┘         └────────────┬─────────────┘   │  │
│   └───────────┼───────────────────────────────┼─────────────────┘  │
│               │                               │                    │
│   ┌───────────▼───────────────────────────────▼─────────────────┐  │
│   │                     Data Layer                               │  │
│   │  ┌─────────────────┐         ┌──────────────────────────┐   │  │
│   │  │  Symbol Index   │         │   Callgraph Database     │   │  │
│   │  │    (JSON)       │         │      (SQLite)            │   │  │
│   │  └─────────────────┘         └──────────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External Tools                                  │
│                                                                      │
│   ┌─────────────────────┐        ┌─────────────────────────────┐   │
│   │    DecompilerMC     │        │     java-callgraph2         │   │
│   │  ┌───────────────┐  │        │  ┌───────────────────────┐  │   │
│   │  │ Download jar  │  │        │  │  Parse bytecode       │  │   │
│   │  │ Get mappings  │──┼────────┼──│  Build call graph     │  │   │
│   │  │ Remap & decomp│  │        │  │  Output to TXT        │  │   │
│   │  └───────────────┘  │        │  └───────────────────────┘  │   │
│   └─────────────────────┘        └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. MCP Server (`src/index.ts`)

Entry point that implements the MCP protocol. Handles:
- Tool registration and discovery
- Request routing to appropriate handlers
- Auto-initialization on first tool call

### 2. Tool Layer (`src/tools/index.ts`)

Implements the four MCP tools:

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `mc_search` | Fuzzy search for symbols | Symbol Index (JSON) |
| `mc_get_class` | Retrieve full class source | Source Files |
| `mc_get_method` | Retrieve method with context | Source Files |
| `mc_find_refs` | Find callers/callees | Callgraph DB (SQLite) |

### 3. Decompiler Integration (`src/decompiler/index.ts`)

Manages DecompilerMC:
- Clones repository on first run
- Executes decompilation pipeline
- Caches results in `~/.mcdev-mcp/cache/`

**Pipeline:**
1. Download official Minecraft JAR
2. Download Mojang ProGuard mappings
3. Remap JAR with proper names
4. Decompile with CFR/Fernflower

### 4. Symbol Indexer (`src/indexer/index.ts`)

Parses decompiled Java sources and builds a searchable index:
- Extracts class, method, field declarations
- Records line numbers for source lookup
- Stores per-package for efficient loading

**Index Structure:**
```
~/.mcdev-mcp/index/
├── manifest.json              # Metadata
└── minecraft/
    ├── net.minecraft.client.json
    ├── net.minecraft.world.json
    └── ... (423 packages)
```

### 5. Callgraph System (`src/callgraph/`)

#### Generator (`index.ts`)
- Clones and builds java-callgraph2
- Creates remapped JAR with SpecialSource
- Runs static analysis
- Parses output into SQLite database

#### Query Engine (`query.ts`)
- Optimized SQLite queries with indexes
- Caller/callee lookups in <10ms
- Method search across call graph

**Database Schema:**
```sql
CREATE TABLE calls (
  id INTEGER PRIMARY KEY,
  caller_class TEXT,
  caller_method TEXT,
  caller_desc TEXT,
  callee_class TEXT,
  callee_method TEXT,
  callee_desc TEXT,
  line_number INTEGER
);

CREATE INDEX idx_callee ON calls(callee_class, callee_method);
CREATE INDEX idx_caller ON calls(caller_class, caller_method);
```

### 6. Storage Layer (`src/storage/source-store.ts`)

Provides unified access to:
- Decompiled source files
- Symbol index
- Class/method lookup

## Data Flow

### Initialization Flow

```
init command
    │
    ├─► ensureDecompiled()
    │       ├─► Clone DecompilerMC (if needed)
    │       ├─► Run decompilation
    │       └─► Return source directory
    │
    └─► buildIndex()
            ├─► Scan all .java files
            ├─► Parse declarations
            └─► Write per-package JSON
```

### Callgraph Generation Flow

```
callgraph command
    │
    ├─► ensureJavaCG()
    │       ├─► Clone java-callgraph2
    │       ├─► Patch build.gradle for Gradle 9.x
    │       └─► Build with ./gradlew gen_run_jar
    │
    ├─► ensureRemappedJar()
    │       ├─► Get client.jar + mappings
    │       └─► Run SpecialSource
    │
    ├─► generateCallgraph()
    │       ├─► Create config files
    │       ├─► Run java-callgraph2
    │       └─► Output method_call.txt
    │
    └─► parseCallgraphAndCreateDb()
            ├─► Parse TAB-delimited output
            ├─► Batch insert into SQLite
            └─► Create indexes
```

### Query Flow

```
mc_find_refs(className, methodName, direction)
    │
    ├─► Check if DB exists
    │
    └─► Query SQLite
            ├─► callers: WHERE callee_class=? AND callee_method=?
            └─► callees: WHERE caller_class=? AND caller_method=?
```

## Key Design Decisions

### 1. Per-Package Index Storage

**Problem:** Single JSON file for 50k+ symbols is slow to load.

**Solution:** Split index by package. Only load packages needed for query.

### 2. SQLite for Callgraph

**Problem:** 400k+ call relationships in memory is expensive.

**Solution:** SQLite with indexes. Queries complete in <10ms.

### 3. Lazy Initialization

**Problem:** Decompilation takes minutes; don't want to block server startup.

**Solution:** Auto-initialize on first tool call. Cache results for subsequent runs.

### 4. Gradle 9.x Compatibility

**Problem:** Java 25 doesn't work with older Gradle versions.

**Solution:** Patch java-callgraph2's build.gradle at runtime to use Gradle 9.3.1 and remove deprecated properties.

### 5. SpecialSource for Remapping

**Problem:** DecompilerMC deletes remapped JAR after decompilation.

**Solution:** Run SpecialSource directly to create persistent remapped JAR for callgraph analysis.

## Limitations

### Static Analysis Constraints

`mc_find_refs` uses static bytecode analysis which cannot trace:

1. **Reflection** — `Class.forName()`, `Method.invoke()`
2. **JNI Callbacks** — GLFW callbacks, LWJGL native calls
3. **Dynamic Proxies** — Generated at runtime
4. **Lambda Captures** — Method references passed as arguments

### Example

```java
// This WILL be found:
minecraft.mouseHandler.setup();

// This will NOT be found:
GLFW.glfwSetCursorPosCallback(window, (win, x, y) -> {
    mouseHandler.onMove(win, x, y);  // Called via JNI callback
});
```

## Future Improvements

1. **Multiple Minecraft Versions** — Support version selection
2. **Server-Side Classes** — Include dedicated server classes
3. **Fabric API Integration** — Index Fabric API alongside vanilla
4. **Incremental Updates** — Only re-index changed classes
5. **Web Interface** — Local web UI for browsing sources
