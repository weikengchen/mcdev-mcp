import { isVersionIndexed } from './utils/paths.js';

export class VersionManager {
  private activeVersion: string | null = null;

  setVersion(version: string): void {
    this.activeVersion = version;
  }

  getVersion(): string | null {
    return this.activeVersion;
  }

  requireVersion(): string {
    if (!this.activeVersion) {
      throw new Error('No Minecraft version is currently set.');
    }
    return this.activeVersion;
  }

  isVersionSet(): boolean {
    return this.activeVersion !== null;
  }

  clearVersion(): void {
    this.activeVersion = null;
  }

  isActiveVersionIndexed(): boolean {
    if (!this.activeVersion) return false;
    return isVersionIndexed(this.activeVersion);
  }
}

export const versionManager = new VersionManager();
