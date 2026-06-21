import { motion } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useSettingsStore } from '../../stores/settingsStore';
import { springs } from '../../lib/motion';

interface SegmentedButtonOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedButtonProps<T extends string> {
  options: SegmentedButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
}: SegmentedButtonProps<T>) {
  const hapticEnabled = useSettingsStore((s) => s.settings.hapticFeedbackEnabled);

  const handleSelect = async (optionValue: T) => {
    if (optionValue === value) return;

    if (hapticEnabled) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {
        // Haptics not available
      }
    }

    onChange(optionValue);
  };

  const sizeStyles = {
    sm: 'h-9 text-label-md',
    md: 'h-11 text-label-lg',
  };

  return (
    <div
      className={`
        inline-flex items-center
        bg-surface2 dark:bg-surfaceDark2
        rounded-full p-1
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      role="group"
      aria-label="Segmented button group"
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isFirst = index === 0;

        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            className={`
              relative flex-1 flex items-center justify-center gap-2
              ${sizeStyles[size]}
              px-4 font-medium
              rounded-full
              transition-colors duration-150
              ${isSelected
                ? 'text-crust-800 dark:text-crumb-100'
                : 'text-crust-600 dark:text-crumb-400 hover:text-crust-700 dark:hover:text-crumb-300'
              }
              ${!isFirst && !isSelected ? 'border-l border-crumb-300/50 dark:border-crust-600/50' : ''}
            `}
            aria-pressed={isSelected}
          >
            {/* Selected indicator pill */}
            {isSelected && (
              <motion.div
                layoutId="segmentedIndicator"
                className="absolute inset-0 bg-surface0 dark:bg-surfaceDark0 rounded-full shadow-sm"
                transition={springs.snappy}
              />
            )}

            <span className="relative z-10 flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
