import { useEffect, useRef, useState } from 'react';
import { useUIStore, type ImageStorageMode } from '@/stores/uiSlice';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { settingsPillDropdownItemSelectedClassName } from '../styles';
import { MAX_IMAGE_SUBFOLDER_NAME_CHARS } from '@/stores/uiPreferences';
import {
    getStorageDirectoryPreview,
    imageDropdownContentClassName,
    imageDropdownItemClassName,
    sidebarDropdownTriggerClassName,
    storageDropdownTriggerClassName,
    storageOptions,
} from './imagesTabOptions';

export function StorageFolderNameEditor({
    mode,
    noteSubfolderName,
    notesRootSubfolderName,
}: {
    mode: ImageStorageMode;
    noteSubfolderName: string;
    notesRootSubfolderName: string;
}) {
    const { t } = useI18n();
    const setImageSubfolderName = useUIStore((s) => s.setImageSubfolderName);
    const setImageNotesRootSubfolderName = useUIStore((s) => s.setImageNotesRootSubfolderName);
    const preserveFocusSelectionRef = useRef(false);
    const isComposingRef = useRef(false);
    const isNotesRootSubfolder = mode === 'notesRootSubfolder';
    const folderName = isNotesRootSubfolder ? notesRootSubfolderName : noteSubfolderName;
    const setFolderName = isNotesRootSubfolder ? setImageNotesRootSubfolderName : setImageSubfolderName;
    const [draftFolderName, setDraftFolderName] = useState(folderName);

    useEffect(() => {
        if (!isComposingRef.current) {
            setDraftFolderName(folderName);
        }
    }, [folderName]);

    if (mode !== 'subfolder' && mode !== 'notesRootSubfolder') {
        return null;
    }

    const inputWidth = `${Math.max((draftFolderName || 'assets').length, 6)}ch`;

    return (
        <div className="inline-flex max-w-full min-w-0 items-center rounded-xl bg-[var(--vlaina-bg-tertiary)] px-2 py-1 font-mono text-[var(--vlaina-font-11)] leading-5 text-[var(--vlaina-sidebar-notes-text-soft)]">
            <input
                type="text"
                data-settings-control={isNotesRootSubfolder ? 'image-notes-root-subfolder-name' : 'image-subfolder-name'}
                value={draftFolderName}
                maxLength={MAX_IMAGE_SUBFOLDER_NAME_CHARS}
                onChange={(event) => {
                    const nextValue = event.target.value.slice(0, MAX_IMAGE_SUBFOLDER_NAME_CHARS);
                    setDraftFolderName(nextValue);
                    if (!isComposingRef.current) {
                        setFolderName(nextValue);
                    }
                }}
                onCompositionStart={() => {
                    isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                    isComposingRef.current = false;
                    const nextValue = event.currentTarget.value.slice(0, MAX_IMAGE_SUBFOLDER_NAME_CHARS);
                    setDraftFolderName(nextValue);
                    setFolderName(nextValue);
                }}
                onMouseDown={(event) => {
                    preserveFocusSelectionRef.current = document.activeElement !== event.currentTarget;
                }}
                onFocus={(event) => {
                    event.currentTarget.select();
                }}
                onMouseUp={(event) => {
                    if (!preserveFocusSelectionRef.current) return;
                    preserveFocusSelectionRef.current = false;
                    event.preventDefault();
                }}
                onBlur={(event) => {
                    preserveFocusSelectionRef.current = false;
                    if (isComposingRef.current) {
                        return;
                    }
                    if (event.currentTarget.value.trim().length === 0) {
                        setDraftFolderName('assets');
                        setFolderName('assets');
                    }
                }}
                placeholder="assets"
                spellCheck={false}
                aria-label={t(isNotesRootSubfolder ? 'settings.images.folderName' : 'settings.images.subfolderName')}
                className="h-5 min-w-12 max-w-24 cursor-text rounded-md border-0 bg-transparent px-1 py-0 font-mono text-[var(--vlaina-font-11)] leading-4 text-[var(--vlaina-sidebar-notes-text)] outline-none transition-colors placeholder:text-[var(--vlaina-sidebar-notes-text-soft)] hover:bg-[var(--vlaina-sidebar-notes-row-hover)] focus:bg-[var(--vlaina-color-setting-field)] focus:ring-1 focus:ring-[var(--vlaina-color-sidebar-focus-ring)]"
                style={{ width: inputWidth }}
            />
        </div>
    );
}

function StoragePathInline({
    mode,
    noteSubfolderName,
    notesRootSubfolderName,
}: {
    mode: ImageStorageMode;
    noteSubfolderName: string;
    notesRootSubfolderName: string;
}) {
    const { t } = useI18n();

    return (
        <span className="block min-w-0 truncate font-mono text-[var(--vlaina-font-11)] leading-5">
            {getStorageDirectoryPreview(mode, noteSubfolderName, notesRootSubfolderName, t)}
        </span>
    );
}

export function StorageLocationDropdown({
    noteSubfolderName,
    notesRootSubfolderName,
}: {
    noteSubfolderName: string;
    notesRootSubfolderName: string;
}) {
    const { t } = useI18n();
    const imageStorageMode = useUIStore((s) => s.imageStorageMode);
    const setImageStorageMode = useUIStore((s) => s.setImageStorageMode);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    data-settings-control="image-storage-location"
                    aria-label={t('settings.images.storageLocation')}
                    className={cn(sidebarDropdownTriggerClassName, storageDropdownTriggerClassName)}
                >
                    <span className="flex min-w-0 items-center gap-2 text-[var(--vlaina-sidebar-notes-text-soft)]">
                        <StoragePathInline
                            mode={imageStorageMode}
                            noteSubfolderName={noteSubfolderName}
                            notesRootSubfolderName={notesRootSubfolderName}
                        />
                    </span>
                    <Icon
                        name="nav.chevronDown"
                        size="sm"
                        className="shrink-0 text-[var(--vlaina-sidebar-notes-text-soft)] transition-colors group-hover/sidebar-row:text-[var(--vlaina-sidebar-notes-text)]"
                    />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className={imageDropdownContentClassName}
            >
                {storageOptions.map((option) => {
                    const isSelected = imageStorageMode === option.id;

                    return (
                        <DropdownMenuItem
                            key={option.id}
                            data-settings-image-storage-mode={option.id}
                            data-selected={isSelected ? 'true' : undefined}
                            onSelect={() => setImageStorageMode(option.id)}
                            className={cn(
                                imageDropdownItemClassName,
                                isSelected && settingsPillDropdownItemSelectedClassName
                            )}
                        >
                            <span className="flex min-w-0 flex-1 items-center text-left">
                                <StoragePathInline
                                    mode={option.id}
                                    noteSubfolderName={noteSubfolderName}
                                    notesRootSubfolderName={notesRootSubfolderName}
                                />
                            </span>
                            {isSelected && (
                                <Icon name="common.check" size="sm" className="shrink-0 text-[var(--vlaina-sidebar-row-selected-text)]" />
                            )}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
