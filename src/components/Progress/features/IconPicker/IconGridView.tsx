import { memo } from 'react';
import { CaretLeft, Prohibit } from '@phosphor-icons/react';
import { ICON_CATEGORIES } from './data';

interface IconGridViewProps {
  value?: string;
  onChange: (icon: string | undefined) => void;
  onCancel?: () => void;
}

export const IconGridView = memo(function IconGridView({ value, onChange, onCancel }: IconGridViewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 1. Minimal Header */}
      <div className="flex justify-start items-center mb-4 px-2 shrink-0 h-10">
        {onCancel && (
            <button
              onClick={onCancel}
              className="p-2 -ml-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Back"
            >
              <CaretLeft weight="bold" className="size-5" />
            </button>
        )}
      </div>

      {/* 2. Pure Icon Grid */}
      <div className="
        flex-1 overflow-y-auto pb-8 -mx-4 px-4
        [&::-webkit-scrollbar]:w-1.5
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-zinc-100
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:hover:bg-zinc-300
        dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800
        dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700
      ">
        {ICON_CATEGORIES.map((category) => (
            <div key={category.name} className="mb-6">
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest px-2 mb-3 sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md py-2 z-20">
                    {category.name}
                </div>
                <div className="grid grid-cols-5 gap-4 px-1">
                    {/* Only show "None" in the first category (Activity) for UX */}
                    {category.name === 'Activity' && (
                        <button
                            onClick={() => onChange(undefined)}
                            className={`
                            group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                            ${!value 
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl scale-110 z-10' 
                                : 'bg-transparent text-zinc-300 dark:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-110'
                            }
                            `}
                            title="No Icon"
                        >
                            <Prohibit 
                            className={`transition-transform duration-300 ${!value ? 'size-6 opacity-100' : 'size-6 opacity-40 group-hover:opacity-100'}`}
                            weight={!value ? "bold" : "regular"}
                            />
                        </button>
                    )}

                    {category.icons.map(({ name, icon: Icon }) => {
                        const isSelected = value === name;
                        return (
                        <button
                            key={name}
                            onClick={() => onChange(name)}
                            className={`
                            group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                            ${isSelected
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl scale-110 z-10' 
                                : 'bg-transparent text-zinc-400 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-110'
                            }
                            `}
                            title={name}
                        >
                            <Icon 
                            className="size-7 transition-transform duration-300" 
                            weight={isSelected ? "duotone" : "light"}
                            />
                        </button>
                        );
                    })}
                </div>
            </div>
        ))}
      </div>
    </div>
  );
});
