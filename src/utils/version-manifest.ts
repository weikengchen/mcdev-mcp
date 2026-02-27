import axios from 'axios';
import { MOJANG_VERSION_MANIFEST_URL, FABRIC_MAVEN_URL } from './config.js';
import { MojangVersionManifest, MojangVersionDetail, MojangDownload } from './types.js';

export type { MojangDownload };

export async function fetchVersionManifest(): Promise<MojangVersionManifest> {
  const response = await axios.get(MOJANG_VERSION_MANIFEST_URL);
  return response.data;
}

export async function fetchVersionDetail(versionId: string): Promise<MojangVersionDetail> {
  const manifest = await fetchVersionManifest();
  const version = manifest.versions.find(v => v.id === versionId);
  
  if (!version) {
    throw new Error(`Version ${versionId} not found in manifest`);
  }
  
  const response = await axios.get(version.url);
  return response.data;
}

export async function getUnobfuscatedJarDownload(versionId: string): Promise<MojangDownload | null> {
  const detail = await fetchVersionDetail(versionId);
  
  const unobfVersion = `${versionId}_unobfuscated`;
  const manifest = await fetchVersionManifest();
  const unobf = manifest.versions.find(v => v.id === unobfVersion);
  
  if (unobf) {
    const unobfDetail = await axios.get<MojangVersionDetail>(unobf.url);
    if (unobfDetail.data.downloads?.client) {
      return unobfDetail.data.downloads.client;
    }
  }
  
  return detail.downloads.client || null;
}

export async function getMinecraftJarDownload(versionId: string): Promise<MojangDownload | null> {
  const detail = await fetchVersionDetail(versionId);
  return detail.downloads.client || null;
}

export async function fetchFabricApiVersions(): Promise<string[]> {
  const url = `${FABRIC_MAVEN_URL}/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml`;
  const response = await axios.get(url, { responseType: 'text' });
  
  const versions: string[] = [];
  const versionRegex = /<version>([^<]+)<\/version>/g;
  let match;
  
  while ((match = versionRegex.exec(response.data)) !== null) {
    versions.push(match[1]);
  }
  
  return versions;
}

export function findFabricApiVersion(versions: string[], mcVersion: string): string | null {
  const matching = versions.filter(v => v.includes(`+${mcVersion}`));
  if (matching.length === 0) return null;
  
  matching.sort((a, b) => {
    const aParts = a.split('+')[0].split('.').map(Number);
    const bParts = b.split('+')[0].split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return bVal - aVal;
    }
    return 0;
  });
  
  return matching[0];
}

export function getFabricApiSourcesUrl(version: string): string {
  return `${FABRIC_MAVEN_URL}/net/fabricmc/fabric-api/fabric-api/${version}/fabric-api-${version}-sources.jar`;
}
