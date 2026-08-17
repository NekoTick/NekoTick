import type { FileTreeNode } from '@/stores/notes/types';

export type NoteExportFormat = 'docx' | 'html' | 'pdf' | 'png';

export interface NoteExportRequest {
  format: NoteExportFormat;
  markdown: string;
  notePath: string;
  notesPath: string;
  rootNodes?: readonly FileTreeNode[];
  title: string;
}

export interface NoteExportResult {
  canceled: boolean;
  filePath?: string;
}
