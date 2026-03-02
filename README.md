# mcdev-mcp

[![CI](https://github.com/weikengchen/mcdev-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/weikengchen/mcdev-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An **MCP (Model Context Protocol) server** that empowers AI coding agents to work effectively with Minecraft mod development. Provides accurate, up-to-date access to decompiled Minecraft source code using official Mojang mappings.

## Features

- **Decompiled Source Access** — Auto-downloads and decompiles Minecraft client using [Vineflower](https://github.com/Vineflower/vineflower)
- **Dev Snapshot Support** — Works with development snapshots (e.g., `26.1-snapshot-10`) that lack ProGuard mappings
- **Symbol Search** — Search for classes, methods, and fields by name
- **Source Retrieval** — Get full class source or individual methods with context
- **Package Exploration** — List all classes under a package path or discover available packages
- **Class Hierarchy** — Find subclasses and interface implementors
- **Call Graph Analysis** — Find method callers and callees across the entire codebase
- **Zero Configuration** — Auto-initializes on first use if sources are cached

## Quick Start

### Installation

```bash
# Clone and install
git clone https://github.com/weikengchen/mcdev-mcp.git
cd mcdev-mcp
npm install
npm run build
```

> **Upgrading from an older version?** If you have a previous installation using DecompilerMC, run `node dist/cli.js clean --all` first to remove old cached data.

### Initialize

```bash
# Download, decompile, and index Minecraft sources (~2-5 minutes)
node dist/cli.js init -v 1.21.11
```

This command:
1. Downloads the Minecraft client JAR
2. Decompiles using Vineflower (pure Java, 8 threads)
3. Builds the symbol index (classes, methods, fields, inheritance)
4. Generates call graph for `mc_find_refs`

### Supported Versions

| Version Type | Example | Notes |
|--------------|---------|-------|
| Dev snapshots | `26.1-snapshot-10` | Already unobfuscated, no mappings needed |
| Release (>= 1.21.11) | `1.21.11` | Uses pre-unobfuscated JAR when available |
| Old versions | `< 1.21.11` | Not supported |

> **Note:** Minecraft is now using a new versioning scheme (26.x). Versions before 1.21.11 are not supported.

### (Optional) Skip Call Graph

```bash
# Skip callgraph generation if you don't need mc_find_refs
node dist/cli.js init -v 1.21.11 --skip-callgraph

# Generate callgraph later
node dist/cli.js callgraph -v 1.21.11
```

### Add to Your MCP Client

```json
{
  "mcpServers": {
    "mcdev": {
      "command": "node",
      "args": ["/path/to/mcdev-mcp/dist/index.js"]
    }
  }
}
```

### Verify Installation

```bash
node dist/cli.js status
```

> **Note:** The `mc_set_version` tool must be called before using any other MCP tools. If the version isn't initialized, the AI will be instructed to ask you to run `init`.

## MCP Tools

### Version Management

Before using any other tools, set the active Minecraft version:

### `mc_set_version`
Set the active Minecraft version for this session. Must be called before other tools.

```json
{
  "version": "1.21.11"
}
```

### `mc_list_versions`
List all Minecraft versions that have been initialized.

```json
{}
```

### Tool Requirements

| Tool | Requires `init` | Requires `callgraph` |
|------|-----------------|---------------------|
| `mc_set_version` | - | - |
| `mc_list_versions` | - | - |
| `mc_search` | ✓ | - |
| `mc_get_class` | ✓ | - |
| `mc_get_method` | ✓ | - |
| `mc_list_classes` | ✓ | - |
| `mc_list_packages` | ✓ | - |
| `mc_find_hierarchy` | ✓ | - |
| `mc_find_refs` | ✓ | ✓ |

### `mc_search`
Search for Minecraft classes, methods, or fields by name pattern.

```json
{
  "query": "Minecraft",
  "type": "class"
}
```

### `mc_get_class`
Get the full decompiled source code for a class.

```json
{
  "className": "net.minecraft.client.Minecraft"
}
```

### `mc_get_method`
Get source code for a specific method with context.

```json
{
  "className": "net.minecraft.client.Minecraft",
  "methodName": "tick"
}
```

### `mc_find_refs`
Find who calls a method (callers) or what it calls (callees).

```json
{
  "className": "net.minecraft.client.MouseHandler",
  "methodName": "setup",
  "direction": "callers"
}
```

| Direction | Description |
|-----------|-------------|
| `callers` | Find methods that call this method |
| `callees` | Find methods this method calls |

> **Note:** Requires callgraph to be generated (included in `init` by default).

### `mc_list_classes`
List all classes under a specific package path (includes subpackages).

```json
{
  "packagePath": "net.minecraft.client.gui.screens"
}
```

### `mc_list_packages`
List all available packages. Optionally filter by namespace.

```json
{
  "namespace": "minecraft"
}
```

| Namespace | Description |
|-----------|-------------|
| `minecraft` | Minecraft client classes |
| `fabric` | Fabric API classes (if indexed) |

### `mc_find_hierarchy`
Find classes that extend or implement a given class or interface.

```json
{
  "className": "net.minecraft.world.entity.Entity",
  "direction": "subclasses"
}
```

| Direction | Description |
|-----------|-------------|
| `subclasses` | Classes that extend this class |
| `implementors` | Classes that implement this interface |

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Java | 8+ | Decompilation (Vineflower) & callgraph |
| ~2GB | disk | Decompiled sources + cache |

> **Note:** Java 17+ is recommended for the `callgraph` command due to Gradle compatibility.

## CLI Commands

| Command | Description |
|---------|-------------|
| `init -v <version>` | Download, decompile, index Minecraft sources, and generate callgraph |
| `callgraph -v <version>` | Generate call graph for `mc_find_refs` |
| `status` | Show all initialized versions |
| `rebuild -v <version>` | Rebuild the symbol index from cached sources |
| `clean --all` | Clean all cached data |

### Re-indexing

To re-index a version:

```bash
# Clean existing data for a version
node dist/cli.js clean -v 1.21.11 --all

# Re-initialize
node dist/cli.js init -v 1.21.11
```

## Architecture

```
mcdev-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI commands
│   ├── tools/                # MCP tool implementations
│   ├── decompiler/           # Vineflower integration (pure TypeScript/Java)
│   ├── indexer/              # Symbol index builder
│   ├── callgraph/            # Call graph generation & queries
│   └── storage/              # Source & index storage
└── dist/                     # Compiled output
```

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client (AI Agent)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      mcdev-mcp Server                        │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐       │
│  │ search  │ │get_class │ │get_method│ │ find_refs │       │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘       │
│  ┌─────────────┐ ┌───────────────┐ ┌─────────────────┐     │
│  │list_classes │ │list_packages  │ │ find_hierarchy  │     │
│  └──────┬──────┘ └───────┬───────┘ └────────┬────────┘     │
│         └────────────────┼──────────────────┘              │
│                          │                                  │
│       ┌──────────────────┴───────────────────┐             │
│       ▼                                       ▼             │
│  ┌──────────┐                          ┌─────────────┐      │
│  │  Index   │                          │  Callgraph  │      │
│  │ (JSON)   │                          │  (SQLite)   │      │
│  └────┬─────┘                          └──────┬──────┘      │
└───────┼────────────────────────────────────────┼────────────┘
        ▼                                        ▼
┌───────────────────┐                  ┌─────────────────────┐
│ Decompiled Src    │                  │ java-callgraph2     │
│ (Vineflower)      │                  │ (static analysis)   │
└───────────────────┘                  └─────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed design documentation.

## Directory Structure

```
~/.mcdev-mcp/
├── tools/
│   └── vineflower.jar         # Downloaded once
├── java-callgraph2/           # Call graph tool
├── cache/
│   └── {version}/
│       ├── jars/               # Downloaded JARs
│       └── client/             # Decompiled Minecraft sources
├── index/
│   └── {version}/
│       ├── manifest.json       # Index metadata
│       └── minecraft/          # Per-package symbol indices
└── tmp/                        # Temporary files (cleaned by --all)
```

## Development

```bash
npm run build    # Compile TypeScript
npm test         # Run tests
npm run lint     # Lint code
```

## Limitations

- **Static Analysis Only**: `mc_find_refs` cannot trace calls through reflection, JNI callbacks, or lambda/method references created dynamically
- **Client Only**: Server-side classes are not included

## Legal Notice

This tool decompiles Minecraft source code for development reference purposes. Please respect Mojang's intellectual property:

**You MAY:**
- Decompile and study the code for understanding and learning
- Use the knowledge to develop mods that don't contain substantial Mojang code
- Reference class/method names for mod development

**You may NOT:**
- Distribute decompiled source code
- Distribute modified versions of Minecraft
- Use decompiled code commercially without permission

Per the [Minecraft EULA](https://www.minecraft.net/eula): *"You may not distribute any Modded Versions of our game or software"* and *"Mods are okay to distribute; hacked versions or Modded Versions of the game client or server software are not okay to distribute."*

This tool is for **reference only** — do not copy decompiled code directly into your projects.

## Third-Party Components

This project includes or uses third-party software under the following licenses:

- **[DecompilerMC](https://github.com/hube12/DecompilerMC)** (MIT) — Decompiler logic adapted and translated from Python to TypeScript in `src/decompiler/`
- **[Vineflower](https://github.com/Vineflower/vineflower)** (Apache-2.0) — Java decompiler used for source generation
- **[java-callgraph2](https://github.com/Adrninistrator/java-callgraph2)** — Cloned at runtime for static call graph generation

Additional runtime dependencies (downloaded/used):
- **[Mojang](https://www.minecraft.net/)** — Official ProGuard mappings and Minecraft client JAR

See [LICENSE](LICENSE) for full license text and third-party attributions.

## License

[MIT](LICENSE) — Copyright (c) 2025 mcdev-mcp contributors
