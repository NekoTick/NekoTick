import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import {
    extractImageFilesFromClipboardData,
} from './imageFileExtraction';
import { handleEditorImageFiles } from './handleEditorImageFiles';
import { canInsertImageNodeAtSelection } from './imageNodeInsertion';

export const imageUploadPluginKey = new PluginKey('editor-image-upload');

export const imageUploadPlugin = $prose(() => {
    return new Plugin({
        key: imageUploadPluginKey,
        props: {
            handleDOMEvents: {
                paste(view, event) {
                    const imageFiles = extractImageFilesFromClipboardData(event.clipboardData);
                    if (imageFiles.length === 0) return false;
                    if (!canInsertImageNodeAtSelection(view)) return false;

                    event.preventDefault();
                    void handleEditorImageFiles(imageFiles, view).catch(() => undefined);
                    return true;
                },

                drop(view, event) {
                    const imageFiles = extractImageFilesFromClipboardData(event.dataTransfer);
                    if (imageFiles.length === 0) return false;
                    if (!canInsertImageNodeAtSelection(view)) return false;

                    event.preventDefault();
                    void handleEditorImageFiles(imageFiles, view).catch(() => undefined);
                    return true;
                }
            }
        }
    });
});
