import { useState, useRef } from 'react';

interface IconButtonProps {
  onClick: () => void;
  active?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

/**
 * Icon button with delayed tooltip
 */
export function IconButton({ onClick, active, tooltip, children }: IconButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = () => {
    if (active) return;
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 2000);
  };
  
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };
  
  const handleClick = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
    onClick();
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`p-1.5 rounded-md transition-colors ${
          active 
            ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
            : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
        }`}
      >
        {children}
      </button>
      {showTooltip && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 text-white text-xs rounded-md whitespace-nowrap" 
          style={{ zIndex: 99999, backgroundColor: '#18181B' }}
        >
          {tooltip}
          <div 
            className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent" 
            style={{ borderBottomColor: '#18181B' }} 
          />
        </div>
      )}
    </div>
  );
}
