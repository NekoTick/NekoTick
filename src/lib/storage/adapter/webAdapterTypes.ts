export interface StoredFile {
  path: string;
  content: string | Uint8Array | Blob;
  isBinary: boolean;
  size: number;
  modifiedAt: number;
  createdAt: number;
}

export interface StoredDir {
  path: string;
  createdAt: number;
}

export interface PrefixScanResult<T> {
  entries: T[];
  truncated: boolean;
}

export interface PrefixScanOptions {
  prioritizeForListing?: boolean;
}
