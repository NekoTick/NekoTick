import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icons';
import { DeleteIcon } from '@/components/common/DeleteIcon';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/useToastStore';
import { PremiumSlider } from '@/components/ui/premium-slider';
import { useI18n } from '@/lib/i18n';
import { SidebarContextMenu } from '@/components/layout/sidebar/SidebarContextMenu';
import {
    SidebarContextMenuContent,
    type SidebarMenuEntry,
} from '@/components/layout/sidebar/context-menu/SidebarContextMenuContent';
import type { SidebarMenuPosition } from '@/components/layout/sidebar/context-menu/shared';
import { readUploadPreviewDataUrl } from './uploadPreviewDataUrl';
import { UploadTabLibrary } from './UploadTabLibrary';
import { UploadFormatBadge } from './UploadFormatBadge';
import { UploadSaveSpinner } from './UploadSaveSpinner';
import { createUploadIconFile } from './uploadIconFile';
import { extractImageFilesFromClipboardData } from '@/lib/assets/imageClipboardFiles';

export interface CustomIcon {
    id: string;
    url: string;
    name: string;
}

interface UploadTabProps {
    onSelect: (value: string) => void;
    onPreview?: (url: string | null) => void;
    onClose: () => void;
    customIcons?: CustomIcon[];
    onUploadFile?: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
    onDeleteCustomIcon?: (id: string) => void | Promise<void>;
    imageLoader?: (src: string) => Promise<string>;
    allowLegacyImageScheme?: boolean;
}

export function UploadTab({ 
    onSelect, 
    onPreview, 
    onClose,
    customIcons = [],
    onUploadFile,
    onDeleteCustomIcon,
    imageLoader,
    allowLegacyImageScheme = false,
}: UploadTabProps) {
    const { t } = useI18n();
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        icon: CustomIcon;
        position: SidebarMenuPosition;
    } | null>(null);

    const handleImageFile = useCallback((file: File | undefined) => {
        if (!file) return;

        void readUploadPreviewDataUrl(file)
            .then((dataUrl) => {
                setOriginalFile(dataUrl ? file : null);
                setImageSrc(dataUrl);
            })
            .catch(() => {
                setOriginalFile(null);
                setImageSrc(null);
            });
    }, []);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        handleImageFile(acceptedFiles[0]);
    }, [handleImageFile]);

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            if (event.defaultPrevented) return;

            const file = extractImageFilesFromClipboardData(event.clipboardData)[0];
            if (!file) return;

            event.preventDefault();
            event.stopPropagation();
            handleImageFile(file);
        };

        document.addEventListener('paste', handlePaste, true);
        return () => document.removeEventListener('paste', handlePaste, true);
    }, [handleImageFile]);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        maxFiles: 1,
        noClick: true
    });

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const isGif = originalFile?.type === 'image/gif';
    const isWebP = originalFile?.type === 'image/webp';
    const shouldPreserve = isGif || isWebP;

    const handleSave = async () => {
        if (!imageSrc || (!croppedAreaPixels && !shouldPreserve)) return;
        if (!onUploadFile) {
            useToastStore.getState().addToast(t('icon.uploadUnsupported'), 'error');
            return;
        }

        try {
            setIsUploading(true);

            const fileToUpload = await createUploadIconFile({
                imageSrc,
                croppedAreaPixels,
                originalFile,
                isGif,
                isWebP,
            });
            const result = await onUploadFile(fileToUpload);
            
            if (!result.success || !result.url) {
                throw new Error(result.error || 'Upload failed');
            }

            onSelect(result.url);
            onClose();

        } catch (e) {
            useToastStore.getState().addToast(t('icon.failedSave'), 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleLibraryItemClick = (url: string) => {
        onSelect(url);
        onClose();
    };

    const handleLibraryItemContextMenu = (event: React.MouseEvent, icon: CustomIcon) => {
        if (!onDeleteCustomIcon) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            icon,
            position: {
                top: event.clientY,
                left: event.clientX,
            },
        });
    };

    const contextMenuEntries = useMemo<SidebarMenuEntry[]>(() => {
        if (!contextMenu || !onDeleteCustomIcon) {
            return [];
        }

        return [
            {
                key: 'delete',
                icon: <DeleteIcon />,
                label: t('sidebar.delete'),
                danger: true,
                onClick: async () => {
                    onPreview?.(null);
                    await onDeleteCustomIcon(contextMenu.icon.id);
                    setContextMenu(null);
                },
            },
        ];
    }, [contextMenu, onDeleteCustomIcon, onPreview, t]);

    return (
        <div className="h-[var(--vlaina-size-320px)] flex flex-col relative">
            <input {...getInputProps()} />
            {imageSrc ? (
                <div className="flex flex-col flex-1 px-5 pt-3 pb-6">
                    <div
                        {...getRootProps({ onClick: (e) => e.stopPropagation() })}
                        className="relative flex-1 bg-[var(--vlaina-color-inverse-surface)] rounded-lg overflow-hidden mb-6 group/cropper flex items-center justify-center h-[var(--vlaina-size-180px)]"
                    >
                        {shouldPreserve ? (
                            <>
                                <img
                                    src={imageSrc}
                                    className="max-w-full max-h-full object-contain"
                                    alt={t('cover.previewAlt')}
                                />
                                <UploadFormatBadge
                                    isGif={isGif}
                                    label={isGif ? t('icon.animationPreserved') : t('icon.originalFormat')}
                                />
                            </>
                        ) : (
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                                showGrid={false}
                                zoomWithScroll={true}
                                zoomSpeed={0.5}
                                minZoom={1}
                                maxZoom={3}
                            />
                        )}

                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                open();
                            }}
                            className={cn(
                                "absolute top-3 right-3 z-[var(--vlaina-z-10)] p-2",
                                "text-[var(--vlaina-color-text-soft)] hover:text-[var(--vlaina-color-inverse-text)] transition-all",
                                "opacity-[var(--vlaina-opacity-0)] group-hover/cropper:opacity-[var(--vlaina-opacity-100)]",
                                "active:scale-[var(--vlaina-scale-95)]"
                            )}
                        >
                            <Icon name="common.upload" size="md" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-6">
                        {!isGif && (
                            <div className="flex items-center gap-4">
                                <span className="text-[var(--vlaina-font-11)] font-medium uppercase tracking-wider text-[var(--vlaina-text-tertiary)] w-10">{t('icon.zoom')}</span>
                                <PremiumSlider
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    value={zoom}
                                    onChange={(val: number) => setZoom(val)}
                                />
                            </div>
                        )}

                        <div className="flex justify-between items-center mt-2">
                            <button
                                type="button"
                                onClick={() => setImageSrc(null)}
                                className="text-sm font-medium text-[var(--vlaina-text-secondary)] hover:text-[var(--vlaina-text-primary)] transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={isUploading}
                                className="bg-[var(--vlaina-accent)] hover:bg-[var(--vlaina-accent-hover)] text-[var(--vlaina-color-white)] px-8 h-9 rounded-full font-medium shadow-[var(--vlaina-shadow-sm)] transition-all active:scale-[var(--vlaina-scale-95)] inline-flex items-center justify-center min-w-[var(--vlaina-size-80px)]"
                            >
                                {isUploading ? <UploadSaveSpinner /> : t('app.unsavedDraftsCancel')}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="px-3 pt-3 pb-2 flex-shrink-0">
                        <div
                            {...getRootProps()}
                            onClick={open}
                            className={cn(
                                "relative group border border-dashed rounded-lg px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-all duration-[var(--vlaina-duration-300)]",
                                "hover:border-[var(--vlaina-color-accent-border-hover)]",
                                isDragActive ? "border-[var(--vlaina-accent)] bg-[var(--vlaina-accent-light)] scale-[var(--vlaina-scale-99)]" : "border-[var(--vlaina-border)]"
                            )}
                        >
                            <div className="p-1.5 bg-[var(--vlaina-bg-tertiary)] rounded-md transition-colors group-hover:bg-[var(--vlaina-accent-light)] group-hover:text-[var(--vlaina-accent)] text-[var(--vlaina-text-tertiary)] shrink-0">
                                <Icon size="sm" name="common.upload" />
                            </div>

                            <span className="text-[var(--vlaina-font-10)] text-[var(--vlaina-text-tertiary)] leading-none">
                                {t('icon.supports')} <span className="font-medium text-[var(--vlaina-text-secondary)]">PNG</span>, <span className="font-medium text-[var(--vlaina-accent)]">GIF</span> & <span className="font-medium text-[var(--vlaina-accent)]">WebP</span>
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 bg-[var(--vlaina-bg-primary)] px-3">
                        <UploadTabLibrary
                            customIcons={customIcons}
                            imageLoader={imageLoader}
                            allowLegacyImageScheme={allowLegacyImageScheme}
                            onSelect={handleLibraryItemClick}
                            onPreview={onPreview}
                            onContextMenu={handleLibraryItemContextMenu}
                        />
                    </div>
                </div>
            )}
            {contextMenu && (
                <SidebarContextMenu
                    isOpen
                    onClose={() => setContextMenu(null)}
                    position={contextMenu.position}
                >
                    <SidebarContextMenuContent entries={contextMenuEntries} />
                </SidebarContextMenu>
            )}
        </div>
    );
}
