import { useCallback, useMemo } from 'react';
import { useNotesStore } from '@/stores/useNotesStore';
import { TitleInput } from './TitleInput';
import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import { getParentPath } from '@/lib/storage/adapter';
import { HeroIconHeader } from '@/components/common/HeroIconHeader';
import { CoverAddOverlay } from '../Cover';
import { resolveCoverAssetUrl } from '../Cover/utils/resolveCoverAssetUrl';
import { NotePathBreadcrumb } from './components/NotePathBreadcrumb';
import { focusEditorAtTop } from './utils/focusEditor';
import { focusNoteInitialPosition } from './utils/focusNoteInitialPosition';
import { getNoteMetadataEntry } from '@/stores/notes/noteMetadataState';
import { readNoteMetadataFromMarkdown } from '@/stores/notes/frontmatter';
import { getStableDisplayIconSnapshot } from '@/hooks/useTitleSync';
import { getRandomHeaderEmoji } from '@/components/common/UniversalIconPicker/randomEmoji';
import { isDraftNotePath } from '@/stores/notes/draftNote';
import { resolveEffectiveNotesRootPath } from '@/stores/notes/effectiveNotesRootPath';
import type { CustomIcon } from '@/lib/storage/unifiedStorage';
import { useToastStore } from '@/stores/useToastStore';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

interface NoteHeaderProps {
    coverUrl: string | null;
    coverLayoutActive?: boolean;
    onAddCover: () => void;
    compactTitle?: boolean;
}

export function NoteHeader({ coverUrl, coverLayoutActive = Boolean(coverUrl), onAddCover, compactTitle = false }: NoteHeaderProps) {
    const currentNotePath = useNotesStore(s => s.currentNote?.path);
    const setNoteIcon = useNotesStore(s => s.setNoteIcon);
    const setNoteIconSize = useNotesStore(s => s.setNoteIconSize);
    const isNewlyCreated = useNotesStore(s => s.isNewlyCreated);
    const draftTitle = useNotesStore(
        useCallback((state) => {
            if (!currentNotePath) return undefined;
            return state.draftNotes[currentNotePath]?.name;
        }, [currentNotePath])
    );

    const stableIcon = useNotesStore(
        useCallback(state => getStableDisplayIconSnapshot(currentNotePath, state), [currentNotePath])
    );

    const metadataIconSize = useNotesStore(
        useCallback(state => {
            return getNoteMetadataEntry(state.noteMetadata, currentNotePath)?.iconSize;
        }, [currentNotePath])
    );
    const defaultIconSize = useNotesStore(s => s.noteIconSize);
    const hasMetadataEntry = useNotesStore(
        useCallback((state) => {
            if (!currentNotePath) return false;
            const notes = state.noteMetadata?.notes;
            return Boolean(notes && Object.prototype.hasOwnProperty.call(notes, currentNotePath));
        }, [currentNotePath])
    );
    const currentNoteContent = useNotesStore(
        useCallback((state) => {
            if (hasMetadataEntry || !currentNotePath || state.currentNote?.path !== currentNotePath) {
                return null;
            }
            return state.currentNote.content;
        }, [currentNotePath, hasMetadataEntry])
    );
    const currentNoteMetadata = useMemo(
        () => currentNoteContent ? readNoteMetadataFromMarkdown(currentNoteContent) : undefined,
        [currentNoteContent]
    );
    const fallbackMetadata = hasMetadataEntry ? undefined : currentNoteMetadata;
    const noteIcon = stableIcon ?? null;
    const iconSize = metadataIconSize ?? fallbackMetadata?.iconSize ?? defaultIconSize;

    const notesPath = useNotesStore(s => s.notesPath);
    const notesRootPath = resolveEffectiveNotesRootPath({ notesPath, currentNotePath });
    const assetList = useNotesStore(s => s.assetList);
    const isLoadingAssets = useNotesStore(s => s.isLoadingAssets);
    const loadAssets = useNotesStore(s => s.loadAssets);
    const uploadAsset = useNotesStore(s => s.uploadAsset);
    const addToast = useToastStore(s => s.addToast);

    const customIcons = useMemo<CustomIcon[]>(() => assetList.map((asset) => {
        const uploadedAt = Date.parse(asset.uploadedAt);
        return {
            id: asset.filename,
            url: asset.filename,
            name: asset.filename.split(/[\\/]/).pop() || asset.filename,
            createdAt: Number.isFinite(uploadedAt) ? uploadedAt : Date.now(),
        };
    }), [assetList]);

    const handleIconPickerOpen = useCallback(async () => {
        if (!notesRootPath) return undefined;
        try {
            await loadAssets(notesRootPath);
        } catch (error) {
            addToast(
                normalizeUserFacingErrorMessage(error, 'asset.loadFailed'),
                'error',
                themeUiFeedbackTokens.errorToastDurationMs,
            );
        }
    }, [addToast, loadAssets, notesRootPath]);

    const uploadNoteIcon = useCallback(async (file: File) => {
        const result = await uploadAsset(file, currentNotePath);
        if (!result.success || !result.path) {
            return { success: false, error: result.error || 'Upload failed' };
        }
        return { success: true, url: result.path };
    }, [currentNotePath, uploadAsset]);

    const imageLoader = useCallback(async (src: string) => {
        return resolveCoverAssetUrl({
            assetPath: src,
            notesRootPath,
            currentNotePath,
            replayAnimated: true,
            animatedPlaybackKey: currentNotePath,
        });
    }, [currentNotePath, notesRootPath]);


    const noteName = useNotesStore(
        useCallback((state) => {
            if (!currentNotePath) return '';
            return state.getDisplayName(currentNotePath);
        }, [currentNotePath])
    );

    const handleIconChange = (newIcon: string | null) => {
        if (currentNotePath) {
            setNoteIcon(currentNotePath, newIcon);
        }
    };

    const handleSizeConfirm = (size: number) => {
        if (currentNotePath) {
            setNoteIconSize(currentNotePath, size);
        }
    };

    const getScopedUsedIcons = useCallback(() => {
        const usedIcons = new Set<string>();
        const noteMetadata = useNotesStore.getState().noteMetadata;
        if (!noteMetadata) {
            return usedIcons;
        }

        const parentPath = currentNotePath ? getParentPath(currentNotePath) : null;
        const folderPrefix = parentPath ? `${parentPath.replace(/\/+$/, '')}/` : '';

        for (const [path, entry] of Object.entries(noteMetadata.notes)) {
            if (path === currentNotePath) {
                continue;
            }

            if (folderPrefix && !path.startsWith(folderPrefix)) {
                continue;
            }

            if (entry.icon) {
                usedIcons.add(entry.icon);
            }
        }

        return usedIcons;
    }, [currentNotePath]);

    const handleRequestRandomIcon = useCallback(() => {
        return getRandomHeaderEmoji(getScopedUsedIcons());
    }, [getScopedUsedIcons]);

    const isDraftNote = isDraftNotePath(currentNotePath);
    const titleInitialValue = isNewlyCreated
        ? ''
        : isDraftNote && draftTitle !== undefined ? draftTitle : noteName;
    const shouldAutoFocusTitle = Boolean(isNewlyCreated);

    return (
        <HeroIconHeader
            id={currentNotePath || 'note-header'}
            className={EDITOR_LAYOUT_CLASS}
            
            icon={noteIcon || null}
            onIconChange={handleIconChange}
            
            iconSize={iconSize}
            onSizeConfirm={handleSizeConfirm}
            
            coverUrl={coverUrl}
            coverLayoutActive={coverLayoutActive}

            customIcons={customIcons}
            customIconsLoading={isLoadingAssets}
            onUploadFile={uploadNoteIcon}
            onIconPickerOpen={handleIconPickerOpen}
            onIconPickerClose={focusNoteInitialPosition}
            imageLoader={imageLoader}
            onRequestRandomIcon={handleRequestRandomIcon}

            renderTitle={() => currentNotePath && (
                <div className="group/note-title">
                    {!compactTitle ? <NotePathBreadcrumb notePath={currentNotePath} /> : null}
                    <TitleInput
                        notePath={currentNotePath}
                        initialTitle={titleInitialValue}
                        onEnter={focusEditorAtTop}
                        autoFocus={shouldAutoFocusTitle}
                        compact={compactTitle}
                    />
                </div>
            )}
        >
            <CoverAddOverlay visible={!coverLayoutActive} onAddCover={onAddCover} />
        </HeroIconHeader>
    );
}
