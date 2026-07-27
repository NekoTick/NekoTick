export {
    hasClipboardImageFilePayload,
    hasClipboardImageOnlyHtmlPayload,
    hasClipboardImagePayload,
    normalizeImageOnlyClipboardHtml,
    preventImageClipboardTextPaste,
} from '@/lib/clipboardImagePayload';

export function hasClipboardPayload(event: ClipboardEvent): boolean {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return false;
    return (clipboardData.types?.length ?? 0) > 0;
}

export function getClipboardTextPayload(clipboardData: DataTransfer | null | undefined): string {
    if (!clipboardData) return '';

    for (const type of ['text/plain', 'text', 'Text']) {
        try {
            const value = clipboardData.getData(type);
            if (value) return value;
        } catch {
        }
    }

    return '';
}
