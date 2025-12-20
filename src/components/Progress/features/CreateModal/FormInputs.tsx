interface CapsuleInputProps {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string; // Corrected to string to match usage, or specific 'text' | 'number'
  width?: string;
}

export function CapsuleInput({ label, value, onChange, type, width = "w-28" }: CapsuleInputProps) {
  return (
    <div className={`
        relative flex flex-col items-center justify-center
        ${width} h-16 rounded-2xl
        bg-white/40 dark:bg-zinc-800/40 backdrop-blur-sm
        border border-white/20 dark:border-white/5
        shadow-sm hover:shadow-md hover:bg-white/60 dark:hover:bg-zinc-800/60
        transition-all duration-300 group
        cursor-text
    `}>
        <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
            {label}
        </span>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-center font-medium text-lg text-zinc-800 dark:text-zinc-200 outline-none p-0"
        />
    </div>
  );
}

interface CapsuleSelectorOption {
    label: string;
    value: string;
}

interface CapsuleSelectorProps {
    label: string;
    value: string;
    options: CapsuleSelectorOption[];
    onChange: (value: any) => void;
    width?: string;
}

export function CapsuleSelector({ label, value, options, onChange, width = "w-28" }: CapsuleSelectorProps) {
    const selectedOption = options.find(o => o.value === value) || options[0];

    const handleClick = () => {
        const currentIndex = options.findIndex(o => o.value === value);
        const nextIndex = (currentIndex + 1) % options.length;
        onChange(options[nextIndex].value);
    };

    return (
        <div 
            className={`
                relative flex flex-col items-center justify-center
                ${width} h-16 rounded-2xl
                bg-white/40 dark:bg-zinc-800/40 backdrop-blur-sm
                border border-white/20 dark:border-white/5
                shadow-sm hover:shadow-md hover:bg-white/60 dark:hover:bg-zinc-800/60
                transition-all duration-300 group
                cursor-pointer select-none
            `}
            onClick={handleClick}
        >
            <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
                {label}
            </span>
            <span className="w-full bg-transparent text-center font-medium text-lg text-zinc-800 dark:text-zinc-200 outline-none p-0">
                {selectedOption.label}
            </span>
        </div>
    );
}

// Re-export specific input groups if needed, or just the components
