# Vineflower Migration

Replace DecompilerMC with Vineflower. Eliminate Python/git dependencies.

**Vineflower:** 1.11.2 — https://github.com/Vineflower/vineflower/releases/download/1.11.2/vineflower-1.11.2.jar

**Settings:**
```
-j=8
--decompile-generics=1
--bytecode-source-mapping=1
--remove-synthetic=1
```

---

## New API

### `src/decompiler/tools.ts`

```typescript
ensureVineflower(progressCb?: ProgressCallback): Promise<string>
```
Downloads vineflower.jar to `~/.mcdev-mcp/tools/` if missing. Returns path.

### `src/decompiler/download.ts`

```typescript
// Check if version has hardcoded unobfuscated JAR URL
hasUnobfuscatedJar(version: string): boolean

// Fetch version manifest from Mojang
fetchVersionManifest(): Promise<VersionManifest>

// Fetch version info (downloads, etc.)
fetchVersionInfo(version: string): Promise<VersionInfo>

// Download file with progress
downloadFile(url: string, dest: string, progressCb?: ProgressCallback, stage?: string): Promise<void>

// Download client JAR (uses hardcoded URL if available, else from manifest)
downloadClientJar(version: string, dest: string, progressCb?: ProgressCallback): Promise<void>
```

**Hardcoded unobfuscated JARs:**
- `1.21.11`: `https://piston-data.mojang.com/v1/objects/4509ee9b65f226be61142d37bf05f8d28b03417b/client.jar`

### `src/decompiler/vineflower.ts`

```typescript
decompile(vineflowerJar: string, inputJar: string, outputDir: string, progressCb?: ProgressCallback): Promise<void>
```
Runs Vineflower with 8 threads. Output goes directly to `outputDir`.

### `src/decompiler/index.ts`

```typescript
ensureDecompiled(version: string, progressCb?: ProgressCallback): Promise<{
  minecraftDir: string;
  fabricDir: string | null;
  fabricVersion: string | null;
}>
```
Simplified flow:
1. Check if already decompiled (`isDecompiled()`)
2. Ensure Vineflower downloaded
3. Download client JAR (unobfuscated if hardcoded)
4. Decompile directly to cache dir with Vineflower

---

## Remaining Steps

### Step 9: Test

- [ ] Test release version (1.21.11) - has hardcoded unobfuscated JAR
- [ ] Test dev snapshot (26.x) - downloads obfuscated JAR from manifest
- [ ] Test re-init when already decompiled (should skip)
- [ ] Test `clean --all` removes tmp directory
- [ ] Test `clean -v <version>` removes version cache
- [ ] Verify MCP tools work (search, get_class, get_method, find_refs)

### Step 10: Update docs

- [ ] Update README.md to remove Python from requirements

---

## Directory Structure

```
~/.mcdev-mcp/
├── cache/<version>/client/    # Final decompiled sources
├── index/<version>/           # Search indices
├── tools/
│   └── vineflower.jar         # Downloaded once
└── tmp/                       # Cleaned by 'clean --all'
```
