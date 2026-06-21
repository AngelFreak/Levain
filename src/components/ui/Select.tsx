import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder, className = '' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-2 min-w-[120px] rounded-lg bg-crumb-100 dark:bg-crust-800 text-crust-800 dark:text-crumb-200 text-sm font-medium border border-crumb-200 dark:border-crust-700 focus:outline-none focus:ring-2 focus:ring-honey-500/30 transition-colors"
      >
        <span className={selectedOption ? '' : 'text-crumb-400 dark:text-crust-500'}>
          {selectedOption?.label || placeholder || 'Select...'}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-crumb-500 dark:text-crust-400" />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 min-w-full z-50 bg-white dark:bg-crust-800 rounded-xl shadow-xl border border-crumb-200 dark:border-crust-700 overflow-hidden"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  option.value === value
                    ? 'bg-honey-50 dark:bg-honey-900/20 text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-300 hover:bg-crumb-50 dark:hover:bg-crust-700'
                }`}
              >
                <span className="font-medium">{option.label}</span>
                {option.value === value && (
                  <Check className="w-4 h-4 text-honey-600 dark:text-honey-400" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
