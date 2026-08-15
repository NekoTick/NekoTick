const MEBIBYTE = 1024 * 1024;

export const MAX_EXPORT_MARKDOWN_CHARS = 2 * MEBIBYTE;
export const MAX_NOTE_EXPORT_OUTPUT_BYTES = 64 * MEBIBYTE;

// Reserve room for Markdown and the rendered HTML shell after base64 expansion.
export const MAX_EXPORT_EMBEDDED_IMAGE_BYTES = Math.floor(
  (MAX_NOTE_EXPORT_OUTPUT_BYTES - MAX_EXPORT_MARKDOWN_CHARS - 8 * MEBIBYTE) * 3 / 4,
);
