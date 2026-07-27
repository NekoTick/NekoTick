export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
}

export interface WriteOptions {
  recursive?: boolean;
  append?: boolean;
  byteLength?: number;
  maxBytes?: number | null;
}

export interface ReadOptions {
  binary?: boolean;
}

export interface ListOptions {
  includeHidden?: boolean;
  recursive?: boolean;
  maxEntries?: number;
}

export interface StorageAdapter {
  readonly platform: 'electron' | 'web';
  readFile(path: string, maxBytes?: number | null): Promise<string>;
  readBinaryFile(path: string, maxBytes?: number): Promise<Uint8Array>;
  writeFile(path: string, content: string, options?: WriteOptions): Promise<void>;
  writeFileBlob?(path: string, content: Blob, options?: WriteOptions): Promise<void>;
  writeFileIfUnchanged?(path: string, expectedContent: string | null, content: string): Promise<boolean>;
  writeBinaryFile(path: string, content: Uint8Array, options?: WriteOptions): Promise<void>;
  deleteFile(path: string): Promise<void>;
  deleteDir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  listDir(path: string, options?: ListOptions): Promise<FileInfo[]>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copyFile(src: string, dest: string, maxBytes?: number | null): Promise<void>;
  stat(path: string): Promise<FileInfo | null>;
  getBasePath(): Promise<string>;
}
