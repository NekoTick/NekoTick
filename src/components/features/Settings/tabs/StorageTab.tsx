import { useState, useEffect } from 'react';
import { Folder, FolderOpen, HardDrive, ExternalLink } from 'lucide-react';
import { getBasePath } from '@/lib/storage/paths';
import { openPath } from '@tauri-apps/plugin-opener';

/**
 * Storage tab content - data location settings
 * 
 * Currently shows the storage path. 
 * Future: Allow users to customize storage location.
 */
export function StorageTab() {
  const [storagePath, setStoragePath] = useState<string>('Loading...');

  useEffect(() => {
    getBasePath().then(path => {
      setStoragePath(path);
    }).catch(() => {
      setStoragePath('Unable to get path');
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Data Storage
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage your data storage location
        </p>
      </div>

      {/* Current Storage Location */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Current Storage Location
        </label>
        
        <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <HardDrive className="size-5 text-zinc-500 dark:text-zinc-400 flex-shrink-0" />
          <code className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono flex-1">
            {storagePath}
          </code>
          <button
            onClick={async () => {
              try {
                await openPath(storagePath);
              } catch (e) {
                console.error('Failed to open path:', e);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 transition-colors text-xs flex-shrink-0"
            title="Open in file manager"
          >
            <ExternalLink className="size-3.5" />
            <span>Open</span>
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          All data (progress, tasks, archives, etc.) is stored at this location
        </p>
      </div>

      {/* Custom Location (Future Feature) */}
      <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Custom Storage Location
        </label>
        
        <button
          disabled
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed text-sm"
        >
          <FolderOpen className="size-4" />
          <span>Choose Folder</span>
          <span className="ml-auto text-xs bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded">
            Coming Soon
          </span>
        </button>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          In the future, you can migrate data to any location, such as Documents folder or cloud sync directory
        </p>
      </div>

      {/* Data Structure Info */}
      <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Data Structure
        </label>
        
        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 font-mono text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <Folder className="size-3.5" />
            <span>Nekotick/</span>
          </div>
          <div className="ml-5 space-y-0.5 mt-1">
            <div className="text-zinc-400 dark:text-zinc-500">├── .nekotick/ <span className="text-zinc-400">(app metadata)</span></div>
            <div>├── progress/ <span className="text-zinc-400">(progress records)</span></div>
            <div>├── tasks/ <span className="text-zinc-400">(task lists)</span></div>
            <div>├── archive/ <span className="text-zinc-400">(archive records)</span></div>
            <div>└── time-tracker/ <span className="text-zinc-400">(time tracking)</span></div>
          </div>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You can view and edit these files with any text editor
        </p>
      </div>
    </div>
  );
}
