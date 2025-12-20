import { useState, useEffect } from 'react';
import { Folder, RotateCcw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { selectClassName, selectStyle, settingsButtonClassName } from '../styles';

/**
 * Appearance tab content - theme, colors, font size
 */
export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('fontSize');
    return saved !== null ? parseInt(saved) : 14;
  });
  const [showFontSizeTooltip, setShowFontSizeTooltip] = useState(false);

  // Apply global font size
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  // Ctrl+Wheel to zoom font
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        setFontSize(prev => {
          const newSize = Math.min(20, Math.max(12, prev + delta));
          localStorage.setItem('fontSize', newSize.toString());
          return newSize;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value);
    setFontSize(newSize);
    localStorage.setItem('fontSize', newSize.toString());
  };

  const resetFontSize = () => {
    setFontSize(14);
    localStorage.setItem('fontSize', '14');
  };

  return (
    <div className="max-w-3xl">
      <div className="space-y-0">
        {/* Base Color / Theme Mode */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Base Color
              </div>
            </div>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
              className={selectClassName}
              style={selectStyle}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        {/* Theme */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Theme
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {/* TODO: Open theme folder */}}
                className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                <Folder className="size-4" />
              </button>
              <select className={selectClassName} style={selectStyle}>
                <option value="default">Default</option>
              </select>
              <button
                onClick={() => {/* TODO: Manage themes */}}
                className={settingsButtonClassName}
              >
                Manage
              </button>
            </div>
          </div>
        </div>

        {/* Font Size */}
        <div className="py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Font Size
              </div>
            </div>
            <div className="flex items-center gap-2">
              {fontSize !== 14 && (
                <button
                  onClick={resetFontSize}
                  className="p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                  title="Reset to default"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
              <div className="relative">
                <input
                  type="range"
                  min="12"
                  max="20"
                  value={fontSize}
                  onChange={handleFontSizeChange}
                  onMouseEnter={() => setShowFontSizeTooltip(true)}
                  onMouseLeave={() => setShowFontSizeTooltip(false)}
                  onMouseDown={() => setShowFontSizeTooltip(true)}
                  onMouseUp={() => setShowFontSizeTooltip(false)}
                  className="w-32 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-400"
                />
                {showFontSizeTooltip && (
                  <div 
                    className="absolute -top-7 flex flex-col items-center pointer-events-none"
                    style={{
                      left: `calc(8px + ${((fontSize - 12) / (20 - 12)) * 112}px)`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="bg-zinc-800 dark:bg-zinc-700 text-white text-xs px-2 py-1 rounded">
                      {fontSize}
                    </div>
                    <div 
                      className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-zinc-800 dark:border-t-zinc-700"
                      style={{ marginTop: '-1px' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
