import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { selectClassName, selectStyle, settingsButtonClassName } from '../styles';

interface AboutTabProps {
  onShowLogin: () => void;
}

/**
 * About tab content - account, version, updates, language
 */
export function AboutTab({ onShowLogin }: AboutTabProps) {
  const [autoUpdate, setAutoUpdate] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoUpdate');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleAutoUpdate = () => {
    const newValue = !autoUpdate;
    setAutoUpdate(newValue);
    localStorage.setItem('autoUpdate', JSON.stringify(newValue));
  };

  const openGitHub = async () => {
    await openUrl('https://github.com/NekoTick/NekoTick');
  };

  const openSignup = async () => {
    await openUrl('https://nekotick.com/auth#signup');
  };

  return (
    <div className="max-w-3xl">
      {/* Account Section */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Account</h2>
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                Your Account
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Sign in to sync your tasks across devices.
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={onShowLogin} className={settingsButtonClassName}>
                Login
              </button>
              <button onClick={openSignup} className={settingsButtonClassName}>
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* App Section */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">App</h2>
      </div>

      <div className="space-y-0">
        {/* Version */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                Version 0.1.0
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                You're using the latest version!
              </div>
            </div>
            <button
              onClick={() => {/* TODO: Check for updates */}}
              className={settingsButtonClassName}
            >
              Check for Updates
            </button>
          </div>
        </div>

        {/* Auto Update */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                Auto Update
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                When disabled, NekoTick will not update automatically.
              </div>
            </div>
            <button
              onClick={toggleAutoUpdate}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                autoUpdate ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                autoUpdate ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Language */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                Language
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                Change the interface language.
              </div>
            </div>
            <select className={selectClassName} style={selectStyle}>
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </div>
        </div>

        {/* GitHub */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-0.5">
                GitHub Repository
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                View source code, report issues, or contribute.
              </div>
            </div>
            <button
              onClick={openGitHub}
              className={`${settingsButtonClassName} flex items-center gap-1.5`}
            >
              <ExternalLink className="size-3.5" />
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
