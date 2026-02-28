export interface MojangVersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MojangVersion[];
}

export interface MojangVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
}

export interface MojangVersionDetail {
  id: string;
  type: string;
  downloads: {
    client?: MojangDownload;
    server?: MojangDownload;
    client_mappings?: MojangDownload;
    server_mappings?: MojangDownload;
  };
}

export interface MojangDownload {
  sha1: string;
  size: number;
  url: string;
}

export interface FabricMavenMetadata {
  versions: string[];
}

export interface IndexManifest {
  minecraftVersion: string;
  fabricApiVersion: string | null;
  generated: string;
  packages: {
    minecraft: string[];
    fabric: string[];
  };
}

export interface PackageIndex {
  package: string;
  classes: Record<string, ClassInfo>;
}

export type ClassKind = 'class' | 'interface' | 'enum';

export interface ClassInfo {
  kind: ClassKind;
  super: string | null;
  interfaces: string[];
  fields: FieldInfo[];
  methods: MethodInfo[];
  sourcePath: string;
}

export interface FieldInfo {
  name: string;
  type: string;
  modifiers: string[];
}

export interface MethodInfo {
  name: string;
  returnType: string;
  params: { name: string; type: string }[];
  modifiers: string[];
  lineStart: number;
  lineEnd: number;
}

export interface SearchResult {
  type: 'class' | 'method' | 'field';
  className: string;
  name: string;
  signature?: string;
  sourcePath: string;
  lineStart?: number;
}
