import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useSettingsStore } from '../../stores/settingsStore';
import { springs } from '../../lib/motion';

type ChipVariant = 'filled' | 'outlined' | 'elevated';

interface ChipProps {
  children: React.ReactNode;
  variant?: ChipVariant;
  selected?: boolean;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onPress?: () => void;
  onRemove?: () => void;
  className?: string;
}

const baseStyles = `
  inline-flex items-center gap-1.5
  h-10 px-4
  text-label-lg font-medium
  rounded-xl
  transition-colors duration-150
  touch-target
`;

const variantStyles: Record<ChipVariant, { default: string; selected: string }> = {
  filled: {
    default: 'bg-surface2 dark:bg-surfaceDark2 text-crust-700 dark:text-crumb-200',
    selected: 'bg-crust-600 dark:bg-honey-600 text-white',
  },
  outlined: {
    default: 'bg-transparent border border-crust-400 dark:border-crumb-600 text-crust-700 dark:text-crumb-200',
    selected: 'bg-crust-50 dark:bg-surfaceDark2 border-2 border-crust-600 dark:border-honey-500 text-crust-700 dark:text-crumb-100',
  },
  elevated: {
    default: 'bg-surface1 dark:bg-surfaceDark1 text-crust-700 dark:text-crumb-200 shadow-sm',
    selected: 'bg-surface3 dark:bg-surfaceDark3 text-crust-800 dark:text-crumb-100 shadow-md',
  },
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  (
    {
      children,
      variant = 'filled',
      selected = false,
      disabled = false,
      leadingIcon,
      trailingIcon,
      onPress,
      onRemove,
      className = '',
    },
    ref
  ) => {
    const hapticEnabled = useSettingsStore((s) => s.settings.hapticFeedbackEnabled);

    const handlePress = async () => {
      if (disabled) return;

      if (hapticEnabled) {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
          // Haptics not available
        }
      }

      onPress?.();
    };

    const handleRemove = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;

      if (hapticEnabled) {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
          // Haptics not available
        }
      }

      onRemove?.();
    };

    const styles = variantStyles[variant];
    const isInteractive = !!onPress || !!onRemove;

    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={handlePress}
        disabled={disabled}
        className={`
          ${baseStyles}
          ${selected ? styles.selected : styles.default}
          ${isInteractive && !disabled ? 'cursor-pointer hover:opacity-90 active:opacity-80' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        whileTap={isInteractive && !disabled ? { scale: 0.96 } : undefined}
        transition={springs.snappy}
        aria-pressed={selected}
      >
        {leadingIcon && <span className="flex-shrink-0 -ml-0.5">{leadingIcon}</span>}
        <span className="truncate">{children}</span>
        {onRemove ? (
          <button
            type="button"
            onClick={handleRemove}
            className="flex-shrink-0 -mr-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Remove"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          trailingIcon && <span className="flex-shrink-0 -mr-0.5">{trailingIcon}</span>
        )}
      </motion.button>
    );
  }
);

Chip.displayName = 'Chip';

// Chip group for managing multiple selections
interface ChipGroupProps<T extends string> {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T[];
  onChange: (value: T[]) => void;
  variant?: ChipVariant;
  multiple?: boolean;
  className?: string;
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  variant = 'filled',
  multiple = false,
  className = '',
}: ChipGroupProps<T>) {
  const handleSelect = (optionValue: T) => {
    if (multiple) {
      if (value.includes(optionValue)) {
        onChange(value.filter((v) => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    } else {
      onChange(value.includes(optionValue) ? [] : [optionValue]);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="group">
      {options.map((option) => (
        <Chip
          key={option.value}
          variant={variant}
          selected={value.includes(option.value)}
          leadingIcon={option.icon}
          onPress={() => handleSelect(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
