import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface SelectOption {
  value: string;
  label: string;
}

interface BottomSheetSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  title?: string;
  className?: string;
}

/**
 * A select component that opens a bottom sheet for selection.
 * This follows the Android Material Design pattern for selection in forms.
 */
export function BottomSheetSelect({
  value,
  onChange,
  options,
  placeholder,
  title,
  className = '',
}: BottomSheetSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`
          flex items-center justify-between gap-2 px-4 py-3 min-w-[120px] min-h-[44px]
          rounded-xl bg-crumb-100 dark:bg-crust-800
          text-crust-800 dark:text-crumb-200 text-sm font-medium
          border border-crumb-200 dark:border-crust-700
          focus:outline-none focus:ring-2 focus:ring-honey-500/30
          transition-colors touch-target
          ${className}
        `}
      >
        <span className={selectedOption ? '' : 'text-crumb-400 dark:text-crust-500'}>
          {selectedOption?.label || placeholder || 'Select...'}
        </span>
        <ChevronDown className="w-4 h-4 text-crumb-500 dark:text-crust-400" />
      </button>

      {/* Bottom Sheet with options */}
      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title || placeholder || 'Select'}
      >
        <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`
                w-full flex items-center justify-between px-4 py-3.5 text-left
                ${index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''}
                ${option.value === value
                  ? 'bg-honey-50 dark:bg-honey-900/20'
                  : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
                }
              `}
            >
              <span
                className={`font-medium ${
                  option.value === value
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}
              >
                {option.label}
              </span>
              {option.value === value && (
                <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
