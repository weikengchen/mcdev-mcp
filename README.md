# mcdev-mcp

[![CI](https://github.com/anomalyco/mcdev-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/anomalyco/mcdev-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An **MCP (Model Context Protocol) server** that empowers AI coding agents to work effectively with Minecraft mod development. Provides accurate, up-to-date access to decompiled Minecraft source code using official Mojang mappings.

## Features

- **Decompiled Source Access** — Auto-downloads and decompiles Minecraft client using official Mojang mappings
- **Symbol Search** — Search for classes, methods, and fields by name
- **Source Retrieval** — Get full class source or individual methods with context
- **Call Graph Analysis** — Find method callers and callees across the entire codebase
- **Zero Configuration** — Works out of the box with any MCP-compatible AI tool

## Quick Start

```bash
# Clone and install
git clone https://github.com/anomalyco/mcdev-mcp.git
cd mcdev-mcp
npm install
npm run build

# Initialize (downloads & decompiles ~50MB)
node dist/cli.js init

# Generate callgraph for find_refs (optional, ~3 minutes)
node dist/cli.js callgraph
```

### Add to Your AI Tool

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

**Cursor / Other MCP clients**:
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

## MCP Tools

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

> **Note:** Requires running `node dist/cli.js callgraph` first.

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Download, decompile, and index Minecraft sources |
| `callgraph` | Generate call graph for `mc_find_refs` |
| `status` | Show initialization status |
| `rebuild` | Rebuild the symbol index |

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| Python | 3.7+ | DecompilerMC dependency |
| Java | 8+ | Decompilation & callgraph |
| Git | any | Clone dependencies |
| ~2GB | disk | Decompiled sources + cache |

## Architecture

```
mcdev-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI commands
│   ├── tools/                # MCP tool implementations
│   ├── decompiler/           # DecompilerMC integration
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
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐    │
│  │ search  │  │get_class │  │get_method│  │ find_refs │    │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘    │
│       └────────────┴────────────┴───────────────┘          │
│                           │                                  │
│       ┌───────────────────┴───────────────────┐             │
│       ▼                                       ▼             │
│  ┌──────────┐                          ┌─────────────┐      │
│  │  Index   │                          │  Callgraph  │      │
│  │ (JSON)   │                          │  (SQLite)   │      │
│  └────┬─────┘                          └──────┬──────┘      │
└───────┼────────────────────────────────────────┼────────────┘
        ▼                                        ▼
┌───────────────────┐                  ┌─────────────────────┐
│ Decompiled Src    │                  │ java-callgraph2     │
│ (DecompilerMC)    │                  │ (static analysis)   │
└───────────────────┘                  └─────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed design documentation.

## Directory Structure

```
~/.mcdev-mcp/
├── DecompilerMC/              # DecompilerMC repository
├── java-callgraph2/           # Call graph tool
├── cache/
│   └── 1.21.11/
│       ├── client/            # Decompiled Minecraft sources
│       └── callgraph/
│           ├── callgraph.db   # SQLite call graph database
│           └── client-remapped.jar
└── index/
    ├── manifest.json          # Index metadata
    └── minecraft/             # Per-package symbol indices
```

## Development

```bash
npm run build    # Compile TypeScript
npm test         # Run tests
npm run lint     # Lint code
```

## Limitations

- **Static Analysis Only**: `mc_find_refs` cannot trace calls through reflection, JNI callbacks, or lambda/method references created dynamically
- **Single Version**: Currently supports Minecraft 1.21.11 only
- **Client Only**: Server-side classes are not included

## Credits

- [DecompilerMC](https://github.com/hube12/DecompilerMC) — Minecraft decompilation with official mappings
- [java-callgraph2](https://github.com/Adrninistrator/java-callgraph2) — Static call graph generation
- [Mojang](https://www.minecraft.net/) — Official ProGuard mappings

## License

[MIT](LICENSE)
