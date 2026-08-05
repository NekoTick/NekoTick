import { useUIStore } from '@/stores/uiSlice';
import { Icon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { dialogCloseIconButtonClassName } from '@/components/common/DialogCloseIconButton';
import { StorageFolderNameEditor, StorageLocationDropdown } from './ImageStorageControls';
import { FilenameFormatDropdown } from './ImageFilenameFormatDropdown';

export function ImagesTab() {
    const { t } = useI18n();
    const imageStorageMode = useUIStore((s) => s.imageStorageMode);
    const imageSubfolderName = useUIStore((s) => s.imageSubfolderName);
    const imageNotesRootSubfolderName = useUIStore((s) => s.imageNotesRootSubfolderName);
    const setImageStorageMode = useUIStore((s) => s.setImageStorageMode);
    const setImageSubfolderName = useUIStore((s) => s.setImageSubfolderName);
    const setImageNotesRootSubfolderName = useUIStore((s) => s.setImageNotesRootSubfolderName);
    const setImageFilenameFormat = useUIStore((s) => s.setImageFilenameFormat);
    const resetImageStorageLocation = () => {
        setImageStorageMode('subfolder');
        setImageSubfolderName('assets');
        setImageNotesRootSubfolderName('assets');
        setImageFilenameFormat('original');
    };

    return (
        <div className="w-full" data-settings-section="images">
            <div className="mt-10 mb-4 px-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="text-[var(--vlaina-font-sm)] font-bold text-[var(--vlaina-sidebar-notes-text-soft)] tracking-tight opacity-[var(--vlaina-opacity-80)]">
                            {t('settings.images.images')}
                        </h3>
                        <button
                            type="button"
                            onClick={resetImageStorageLocation}
                            aria-label={t('common.reset')}
                            data-settings-action="reset-image-storage"
                            className={dialogCloseIconButtonClassName}
                        >
                            <Icon name="common.refresh" size="md" />
                        </button>
                    </div>
                </div>
            </div>

            <div
                className={cn(
                    "mb-3 flex min-w-0 flex-col items-stretch gap-3 rounded-[var(--vlaina-ui-radius-group)] px-6 py-4 max-[640px]:px-4",
                    raisedPillSurfaceClass
                )}
            >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="min-w-0 text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
                        {t('settings.images.storageLocation')}
                    </div>
                    <StorageFolderNameEditor
                        mode={imageStorageMode}
                        noteSubfolderName={imageSubfolderName}
                        notesRootSubfolderName={imageNotesRootSubfolderName}
                    />
                </div>
                <div className="min-w-0">
                    <StorageLocationDropdown
                        noteSubfolderName={imageSubfolderName}
                        notesRootSubfolderName={imageNotesRootSubfolderName}
                    />
                </div>
            </div>

            <div
                className={cn(
                    "mb-3 flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-[var(--vlaina-ui-radius-group)] px-6 py-4 max-[640px]:px-4",
                    raisedPillSurfaceClass
                )}
            >
                <div className="min-w-0 text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]">
                    {t('settings.images.filenameFormat')}
                </div>
                <div className="min-w-0 flex-shrink-0 max-[420px]:w-full">
                    <FilenameFormatDropdown />
                </div>
            </div>
        </div>
    );
}
