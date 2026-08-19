import type { Ctx } from '@milkdown/kit/ctx';

export type ActiveMilkdownEditor = {
  ctx: {
    get: (slice: unknown) => unknown;
  };
  action?: <T>(action: (ctx: Ctx) => T) => T;
  onStatusChange?: (onChange: (status: string) => void) => unknown;
  status?: string;
};

export type ProseMirrorJSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
  text?: string;
  content?: ProseMirrorJSONNode[];
};

export type MilkdownDefaultValue =
  | string
  | {
      type: 'json';
      value: ProseMirrorJSONNode;
    };
