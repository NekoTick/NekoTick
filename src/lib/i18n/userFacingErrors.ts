import { translate } from './runtime';
import type { MessageKey, MessageValues } from './messages';

function primitiveToString(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return '';
  }
}

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message.trim();
  }
  return primitiveToString(error).trim();
}

type ErrorMessageKeyPattern = readonly [RegExp, MessageKey];

const ASSET_AND_EXPORT_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^upload failed\.?$/i, 'asset.uploadFailed'],
  [/^failed to load asset library\.?$/i, 'asset.loadFailed'],
  [/^failed to export note\.?$/i, 'notes.exportFailed'],
  [/^failed to open theme folder\.?$/i, 'settings.appearance.openThemeFolderFailed'],
];

const FILE_NAME_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^selected file path contains unsupported characters\.?$/i, 'notes.fileNameError.unsupportedCharacters'],
  [/^file name cannot be empty\.?$/i, 'notes.fileNameError.empty'],
  [/^file name contains unsupported characters\.?$/i, 'notes.fileNameError.unsupportedCharacters'],
  [/^file name cannot contain only dots\.?$/i, 'notes.fileNameError.onlyDots'],
  [/^file name cannot start or end with a dot\.?$/i, 'notes.fileNameError.dotBoundary'],
];

const NOTES_ROOT_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^invalid path for web platform\.?$/i, 'notesRoot.openFolderFailed'],
  [/^folder does not exist or cannot be accessed\.?$/i, 'notesRoot.openFolderFailed'],
  [/^failed to initialize opened folders\.?$/i, 'notesRoot.openFailed'],
  [/^failed to (?:open|create|rename) folder\.?$/i, 'notesRoot.openFailed'],
  [/^failed to open (?:the selected )?notesRoot\.?$/i, 'notesRoot.openFailed'],
  [/^failed to open (?:the selected )?folder\.?$/i, 'notesRoot.openFolderFailed'],
];

const NOTE_OPEN_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^only markdown files can be opened as notes\.?$/i, 'notes.selectMarkdownFile'],
  [/^failed to open (?:the selected )?markdown file\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^failed to open note\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^failed to open the dropped file\.?$/i, 'notes.openDroppedFileFailed'],
  [/^failed to open the dropped folder\.?$/i, 'notes.openDroppedFolderFailed'],
  [/^failed to read the dropped file path\.?$/i, 'notes.droppedPathReadFailed'],
];

const NOTE_SAVE_AND_MUTATION_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^failed to save (?:note|dirty tab before closing|pending draft changes|pending note changes)\.?$/i, 'storage.saveFailed'],
  [/^failed to save changes securely\.? please try again\.?$/i, 'storage.saveFailed'],
  [/^save the note before closing it\.?$/i, 'storage.saveFailed'],
  [/^save or discard draft notes before opening another folder\.?$/i, 'notes.saveOrDiscardDraftsBeforeOpeningAnotherFolder'],
  [/^failed to (?:sync note from disk|load notes|create note|duplicate note|create folder|delete note|delete folder|rename note|rename folder|move item|restore deleted item)\.?$/i, 'notes.openFailed'],
  [/^failed to move deleted item to system trash\.?$/i, 'notes.openFailed'],
  [/^failed to update note metadata\.?$/i, 'notes.openFailed'],
  [/^deleted item is already moving to system trash\.?$/i, 'notes.openFailed'],
];

const NOTE_PATH_GUARD_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^note file is too (?:large|complex) to update metadata\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^note file is too large to open\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^current note is too large to reload from disk\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^(?:target folder|restore target) must stay inside the opened folder\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^path must stay inside the opened folder\.?$/i, 'notes.openMarkdownFileFailed'],
  [/^path must not be inside an internal notes folder\.?$/i, 'notes.openMarkdownFileFailed'],
];

const PATH_ACTION_ERROR_KEYS: ErrorMessageKeyPattern[] = [
  [/^failed to copy path\.?$/i, 'notes.copyPathFailed'],
  [/^failed to open file location\.?$/i, 'notes.openFileLocationFailed'],
  [/^failed to open folder location\.?$/i, 'notes.openFolderLocationFailed'],
  [/^open file location is only available in the desktop app\.?$/i, 'notes.openFileLocationFailed'],
  [/^open folder is only available in the desktop app\.?$/i, 'notes.openFolderLocationFailed'],
  [/^failed to open in new window\.?$/i, 'notes.openInNewWindowFailed'],
];

const USER_FACING_ERROR_MESSAGE_KEYS: ErrorMessageKeyPattern[] = [
  ...ASSET_AND_EXPORT_ERROR_KEYS,
  ...FILE_NAME_ERROR_KEYS,
  ...NOTES_ROOT_ERROR_KEYS,
  ...NOTE_OPEN_ERROR_KEYS,
  ...NOTE_SAVE_AND_MUTATION_ERROR_KEYS,
  ...NOTE_PATH_GUARD_ERROR_KEYS,
  ...PATH_ACTION_ERROR_KEYS,
];

export function normalizeUserFacingErrorMessage(
  error: unknown,
  fallbackKey?: MessageKey,
  fallbackValues?: MessageValues,
): string {
  const message = getRawErrorMessage(error);

  if (message) {
    for (const [pattern, key] of USER_FACING_ERROR_MESSAGE_KEYS) {
      if (pattern.test(message)) {
        return translate(key);
      }
    }
  }

  if (!message && fallbackKey) {
    return translate(fallbackKey, fallbackValues);
  }

  return message;
}
