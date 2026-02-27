export interface Config {
  minecraftVersion: string;
  fabricApiVersion: string | null;
  cacheDir: string;
  indexDir: string;
  toolsDir: string;
}

export const DEFAULT_CONFIG: Config = {
  minecraftVersion: '1.21.11',
  fabricApiVersion: null,
  cacheDir: '',
  indexDir: '',
  toolsDir: '',
};

export const VINEFLOWER_VERSION = '1.10.1';
export const VINEFLOWER_URL = `https://github.com/Vineflower/vineflower/releases/download/${VINEFLOWER_VERSION}/vineflower-${VINEFLOWER_VERSION}.jar`;

export const MOJANG_VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const FABRIC_MAVEN_URL = 'https://maven.fabricmc.net';
