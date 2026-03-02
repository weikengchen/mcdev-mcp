# Multi-Version Minecraft Support Implementation Plan

## Overview

This document outlines the implementation plan for supporting multiple Minecraft versions in mcdev-mcp. The system will allow users to work with different Minecraft versions by explicitly setting a version before using other API tools.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Uninitialized version handling | Return error, tell AI to STOP and ask USER | Prevents unexpected long operations; gives user control |
| Version persistence | No persistence, require per session | Simpler mental model; no stale state across sessions |
| Per-call version override | Optional `version` parameter on all tools | Flexibility for advanced use cases without breaking flow |

## Architecture Changes

### Current State

```
~/.mcdev-mcp/
├── cache/
│   └── 1.21.11/           # VERSIONED ✅
│       └── client/        # Decompiled sources
└── index/
    ├── manifest.json      # GLOBAL ❌ (single version only)
    ├── minecraft/         # GLOBAL ❌
    │   └── net.minecraft.client.json
    └── fabric/            # GLOBAL ❌
        └── ...
```

### Target State

```
~/.mcdev-mcp/
├── cache/
│   ├── 1.21.1/
│   │   └── client/
│   ├── 1.20.4/
│   │   └── client/
│   └── 1.19.4/
│       └── client/
└── index/
    ├── 1.21.1/                    # VERSIONED ✅
    │   ├── manifest.json
    │   ├── minecraft/
    │   │   └── net.minecraft.client.json
    │   └── fabric/
    ├── 1.20.4/                    # VERSIONED ✅
    │   ├── manifest.json
    │   ├── minecraft/
    │   └── fabric/
    └── 1.19.4/                    # VERSIONED ✅
        ├── manifest.json
        ├── minecraft/
        └── fabric/
```

---

## Implementation TODOs

### Phase 1: Version-Aware Paths ✅ COMPLETE

**File: `src/utils/paths.ts`**

- [x] Add `getVersionedIndexDir(version: string): string`
- [x] Add `getVersionedIndexManifestPath(version: string): string`
- [x] Add `getVersionedMinecraftIndexPath(version: string): string`
- [x] Add `getVersionedFabricIndexPath(version: string): string`
- [x] Add `getVersionedPackageIndexPath(namespace, packageName, version): string`
- [x] Add `isVersionIndexed(version: string): boolean` - check if version has index manifest
- [x] Keep existing functions for backward compatibility during migration
- [x] Add `getIndexedVersions(): string[]` - list all indexed versions
- [x] Add `ensureVersionedIndexDirs(version: string): void` - create versioned index directories

### Phase 2: Version Manager ✅ COMPLETE

**File: `src/version-manager.ts` (NEW)**

- [x] Create `VersionManager` class with:
  - [x] `private activeVersion: string | null = null`
  - [x] `setVersion(version: string): void`
  - [x] `getVersion(): string | null`
  - [x] `requireVersion(): string` - throws if not set
  - [x] `isVersionSet(): boolean`
  - [x] `clearVersion(): void`
- [x] Export singleton `versionManager`
- [x] Add `isActiveVersionIndexed(): boolean` helper

### Phase 3: Update SourceStore ✅ COMPLETE

**File: `src/storage/source-store.ts`**

- [x] Add `private version: string | null = null`
- [x] Add `setVersion(version: string): void` - sets version and clears manifest cache
- [x] Add `getVersion(): string | null`
- [x] Update `isReady()` to check both version set AND index exists
- [x] Update `getManifest()` to use versioned path based on `this.version`
- [x] Update `getPackage()` to use versioned path (reads directly from path, not via indexer)
- [x] Update `resolveSourcePath()` to use `this.version` instead of manifest version
- [x] Keep singleton export for now (Phase 7 will update tools to call setVersion)

### Phase 4: Update Indexer ✅ COMPLETE

**File: `src/indexer/index.ts`**

- [x] Update `buildIndex()` to write to versioned paths using `minecraftVersion`
- [x] Update `loadIndexManifest(version?: string)` to accept optional version parameter
- [x] Update `loadPackageIndex(namespace, packageName, version?: string)` to accept version
- [x] Use versioned path functions instead of global paths
- [x] Updated `writePackageIndices()` to accept version parameter

### Phase 5: CLI Updates - Merge Callgraph into Init ✅ COMPLETE

**File: `src/cli.ts`**

- [x] Update `init` command to include callgraph generation:
  - Added `--skip-callgraph` option for users who don't need it
  - Calls `ensureCallgraph()` after `buildIndex()` completes
  - Updated description to reflect full initialization
  - Made `-v` required (removed default version)
- [x] Keep `callgraph` command for regenerating callgraph only (useful for debugging)
- [x] Update `status` command to show per-version status with callgraph info
- [x] Update `rebuild` command with `--with-callgraph` option
- [x] Remove `DEFAULT_MC_VERSION` constant (require explicit version)
- [x] Update `clean` command with `-v <version>` option for version-specific cleaning

### Phase 6: New MCP Tools ✅ COMPLETE

**File: `src/tools/index.ts`**

- [x] Create `mc_set_version` tool:
  - Checks if version is decompiled and indexed
  - Returns error with CLI instructions if not initialized
  - Sets version in versionManager and sourceStore
  - Returns success with version info

- [x] Create `mc_list_versions` tool:
  - Scans cache directory for versions
  - Checks decompiled, indexed, and callgraph status
  - Returns list with all status info
  - Shows active version if set

### Phase 7: Update Existing Tools ✅ COMPLETE

**File: `src/tools/index.ts`**

For each existing tool, updated handler pattern:

- [x] Update `mc_search` tool:
  - Added optional `version` parameter to inputSchema
  - Uses `getEffectiveVersion()` helper for version resolution
  
- [x] Update `mc_get_class` tool (same pattern)
- [x] Update `mc_get_method` tool (same pattern)
- [x] Update `mc_list_classes` tool (same pattern)
- [x] Update `mc_list_packages` tool (same pattern)
- [x] Update `mc_find_hierarchy` tool (same pattern)
- [x] Update `mc_find_refs` tool (same pattern)

**Helper function added:**

```typescript
function getEffectiveVersion(explicitVersion?: string): { version: string; error?: string }
```

- Removed `DEFAULT_MC_VERSION` constant
- Removed old `ensureInitialized()` function
- All tools now require version via `mc_set_version` or explicit `version` parameter
    if (!isVersionDecompiled(explicitVersion)) {
      return { 
        version: '', 
        error: `Version ${explicitVersion} not initialized. STOP and ask the USER to run: node dist/cli.js init -v ${explicitVersion}` 
      };
    }
    if (!isVersionIndexed(explicitVersion)) {
      return { 
        version: '', 
        error: `Version ${explicitVersion} not indexed. STOP and ask the USER to run: node dist/cli.js init -v ${explicitVersion}` 
      };
    }
    return { version: explicitVersion };
  }
  
  const activeVersion = versionManager.getVersion();
  if (!activeVersion) {
    return { 
      version: '', 
      error: 'No version set. Use mc_set_version first, or provide a version parameter. STOP and ask the USER which version they want to use.' 
    };
  }
  
  return { version: activeVersion };
}
```

### Phase 8: Update Initialization Logic ✅ COMPLETE

**File: `src/tools/index.ts`**

- [x] Remove `DEFAULT_MC_VERSION` constant
- [x] Remove old `ensureInitialized()` function entirely
- [x] All version checking now handled by `getEffectiveVersion()` helper

### Phase 9: Update Callgraph Functions ✅ COMPLETE

**File: `src/callgraph/query.ts`**

- [x] `findCallers(version, className, methodName)` - already has version param ✅
- [x] `findCallees(version, className, methodName)` - already has version param ✅
- [x] `mc_find_refs` tool passes version from `getEffectiveVersion()`

**File: `src/callgraph/index.ts`**

- [x] `hasCallgraphDb(version)` - already has version param ✅

### Phase 10: Migration Support (Optional) - NOT STARTED

**File: `src/utils/migration.ts` (NEW)**

- [ ] Add migration function to move old global index to versioned:
  ```typescript
  export function migrateGlobalIndex(): void{
    // 1. Check if global manifest.json exists
    // 2. Read version from manifest
    // 3. Create versioned directory
    // 4. Move minecraft/, fabric/, manifest.json to versioned path
    // 5. Log migration happened
  }
  ```

- [ ] Call migration in `src/index.ts` on server startup (before tools are used)

**Note:** This is optional - users can simply run `init -v <version>` for new versions.

---

## API Reference (Post-Implementation)

### New Tools

#### `mc_set_version`
Set the active Minecraft version for subsequent operations.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| version | string | Yes | Minecraft version (e.g., "1.21.1") |

**Returns:**
- Success: `{ version, indexed: true }`
- Error: Message telling AI to STOP and ask USER to run CLI init

**Example:**
```
User: Set version to 1.21.1
→ mc_set_version({ version: "1.21.1" })
← { version: "1.21.1", indexed: true }
```

#### `mc_list_versions`
List all available Minecraft versions and their status.

**Parameters:** None

**Returns:**
```json
{
  "versions": [
    { "version": "1.21.1", "decompiled": true, "indexed": true, "callgraph": true },
    { "version": "1.20.4", "decompiled": true, "indexed": true, "callgraph": false },
    { "version": "1.19.4", "decompiled": false, "indexed": false, "callgraph": false }
  ]
}
```

### Updated Tools (All Now Support Optional `version` Parameter)

All existing tools now accept an optional `version` parameter:

| Tool | New Parameter |
|------|---------------|
| mc_search | `version?: string` |
| mc_get_class | `version?: string` |
| mc_get_method | `version?: string` |
| mc_list_classes | `version?: string` |
| mc_list_packages | `version?: string` |
| mc_find_hierarchy | `version?: string` |
| mc_find_refs | `version?: string` |

**Behavior:**
- If `version` provided → use that version (must be initialized)
- If `version` not provided → use active version from `mc_set_version`
- If neither available → return error telling AI to STOP

---

## Testing Checklist

After implementation:

- [ ] `mc_list_versions` returns correct list of cached versions with callgraph status
- [ ] `mc_set_version` succeeds for fully initialized version
- [ ] `mc_set_version` fails with helpful error for non-initialized version
- [ ] All tools fail with error when no version set
- [ ] All tools work after `mc_set_version`
- [ ] All tools accept optional `version` parameter to override
- [ ] Switching between versions works correctly
- [ ] Old global index is migrated on first run
- [ ] CLI `init` command includes callgraph generation
- [ ] CLI `init --skip-callgraph` skips callgraph generation
- [ ] CLI `callgraph` command still works for regeneration
- [ ] CLI `status` shows callgraph status per-version
- [ ] CLI `rebuild` optionally rebuilds callgraph

---

## File Change Summary

| File | Action | Changes |
|------|--------|---------|
| `src/utils/paths.ts` | Modify | Add versioned index path functions |
| `src/version-manager.ts` | **Create** | Version state management |
| `src/storage/source-store.ts` | Modify | Make version-aware, remove singleton |
| `src/tools/index.ts` | Modify | Add new tools, update all handlers |
| `src/indexer/index.ts` | Modify | Use versioned paths |
| `src/callgraph/query.ts` | Minor | Ensure version param passed correctly |
| `src/utils/migration.ts` | **Create** | Index migration utility |
| `src/index.ts` | Minor | Call migration on startup |
| `src/storage/index.ts` | Minor | Export SourceStore class, not singleton |
| `src/cli.ts` | Modify | Merge callgraph into init, add --skip-callgraph |

---

## Error Messages

Standard error format for uninitialized versions:

```
Version {version} not initialized. 

STOP and ask the USER to run this command in their terminal:
  node dist/cli.js init -v {version}

This will download, decompile, and index Minecraft {version} sources (including callgraph).
```

Standard error for version without callgraph (when using mc_find_refs):

```
Version {version} does not have callgraph data.

STOP and ask the USER to run this command in their terminal:
  node dist/cli.js callgraph -v {version}

Or for full reinitialization:
  node dist/cli.js init -v {version}
```

Standard error for no version set:

```
No Minecraft version is currently set.

STOP and ask the USER which version they want to use, then call mc_set_version.
Or, provide a 'version' parameter in your tool call.

To see available versions, use mc_list_versions.
```
