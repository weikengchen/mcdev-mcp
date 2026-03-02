# DecompilerMC Fork Plan

## Overview

We maintain a modified version of DecompilerMC's `main.py` in `lib/DecompilerMC-main.py` that supports:
1. **Dev snapshots** — Versions without Proguard mappings (e.g., `26.1-snapshot-10`)
2. **Version-aware paths** — Output to versioned directories

We still use the original DecompilerMC repo for:
- `lib/cfr-0.152.jar` — CFR decompiler
- `lib/fernflower.jar` — FernFlower decompiler  
- `lib/SpecialSource-1.11.4.jar` — Jar remapper

## Target Flow

```
src/decompiler/index.ts
  └── cloneDecompilerMC()     → clones repo (libs only, skip if exists)
  └── runDecompilerMC()       → python3 <our-main.py> --mcversion <version> --side client -q
                                └── our main.py lives in mcdev-mcp/lib/DecompilerMC-main.py
                                └── uses --lib-dir to find jars in ~/.mcdev-mcp/DecompilerMC/lib/
                                └── outputs to ~/.mcdev-mcp/DecompilerMC/src/<version>/client/
```

## ✅ Phase 1: Modify lib/DecompilerMC-main.py (DONE)

Changes made:
- Added `--lib-dir` argument for specifying jar library location
- Added `--no-remap` flag to explicitly skip remapping
- Modified `get_mappings()` to return `bool` instead of raising error
- Modified `remap()`, `decompile_cfr()`, `decompile_fern_flower()` to accept `lib_dir` parameter
- Updated auto-mode flow to handle both mapped and unmapped versions

## ✅ Phase 2: Modify src/decompiler/index.ts (DONE)

Changes made:
- Added `getProjectRoot()` helper using `fileURLToPath(import.meta.url)`
- Updated `runDecompilerMC()` to use `lib/DecompilerMC-main.py` with `--lib-dir` argument

## ✅ Phase 3: Update cloneDecompilerMC() (DONE)

Changed `checkDecompilerMC()` to `hasDecompilerMCLibs()` that checks for required jar files:
- `cfr-0.152.jar`
- `fernflower.jar`
- `SpecialSource-1.11.4.jar`

This avoids re-cloning the repo if libs already exist.

## Phase 4: Testing

### 4.1 Test with regular version (has mappings)

```bash
node dist/cli.js init -v 1.21.1
```

Expected:
- Downloads mappings
- Remaps jar
- Decompiles

### 4.2 Test with dev snapshot (no mappings)

```bash
node dist/cli.js init -v 26.1-snapshot-10
```

Expected:
- Skips mappings (detects none available)
- Skips remapping
- Decompiles unobfuscated jar directly

## Files to Modify

| File | Status |
|------|--------|
| `lib/DecompilerMC-main.py` | ✅ Done |
| `src/decompiler/index.ts` | ✅ Done |
| `src/utils/paths.ts` | ✅ N/A (used `getProjectRoot()` in index.ts instead) |
