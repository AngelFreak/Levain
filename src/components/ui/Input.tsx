import { forwardRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { springs } from '../../lib/motion';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  floatingLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, floatingLabel = false, className = '', id, value, defaultValue, onFocus, onBlur, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).slice(2)}`;
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined ? Boolean(value) : Boolean(defaultValue);
    const isFloating = floatingLabel && (isFocused || hasValue);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    // Non-floating label (original behavior)
    if (!floatingLabel) {
      return (
        <div className="w-full">
          {label && (
            <label
              htmlFor={inputId}
              className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5"
            >
              {label}
            </label>
          )}
          <div className="relative">
            {leftIcon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-crust-500 dark:text-crumb-500">
                {leftIcon}
              </div>
            )}
            <input
              ref={ref}
              id={inputId}
              value={value}
              defaultValue={defaultValue}
              className={`
                w-full min-h-[44px] px-4 py-2.5
                ${leftIcon ? 'pl-10' : ''}
                ${rightIcon ? 'pr-10' : ''}
                bg-surface1 dark:bg-surfaceDark1
                border rounded-xl
                ${error
                  ? 'border-error-500 focus:ring-error-500/20'
                  : 'border-crumb-300 dark:border-crust-700 focus:border-crust-500 focus:ring-crust-500/20'
                }
                text-crust-900 dark:text-crumb-100
                placeholder:text-crumb-500 dark:placeholder:text-crust-500
                focus:outline-none focus:ring-2
                transition-colors
                ${className}
              `}
              {...props}
            />
            {rightIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crust-500 dark:text-crumb-500">
                {rightIcon}
              </div>
            )}
          </div>
          {(error || hint) && (
            <p
              className={`mt-1.5 text-sm ${
                error ? 'text-error-500' : 'text-crust-500 dark:text-crumb-500'
              }`}
            >
              {error || hint}
            </p>
          )}
        </div>
      );
    }

    // Floating label variant
    return (
      <div className="w-full">
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-crust-500 dark:text-crumb-500 z-10">
              {leftIcon}
            </div>
          )}

          {/* Floating label */}
          {label && (
            <motion.label
              htmlFor={inputId}
              className={`
                absolute left-4 pointer-events-none
                ${leftIcon ? 'left-10' : ''}
                ${isFloating
                  ? 'text-label-sm'
                  : 'text-body-md'
                }
                ${isFocused
                  ? 'text-crust-600 dark:text-honey-500'
                  : error
                    ? 'text-error-500'
                    : 'text-crust-500 dark:text-crumb-500'
                }
              `}
              initial={false}
              animate={{
                y: isFloating ? -24 : 0,
                scale: isFloating ? 0.85 : 1,
              }}
              transition={springs.snappy}
              style={{
                top: '50%',
                translateY: '-50%',
                originX: 0,
              }}
            >
              {label}
            </motion.label>
          )}

          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`
              w-full min-h-[56px] px-4 pt-5 pb-2
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              bg-surface1 dark:bg-surfaceDark1
              border-2 rounded-xl
              ${isFocused
                ? 'border-crust-600 dark:border-honey-500'
                : error
                  ? 'border-error-500'
                  : 'border-crumb-300 dark:border-crust-700'
              }
              text-crust-900 dark:text-crumb-100
              focus:outline-none
              transition-colors duration-150
              ${className}
            `}
            placeholder=""
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-crust-500 dark:text-crumb-500">
              {rightIcon}
            </div>
          )}

          {/* Focus indicator line */}
          <motion.div
            className="absolute bottom-0 left-4 right-4 h-0.5 bg-crust-600 dark:bg-honey-500 rounded-full"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: isFocused ? 1 : 0 }}
            transition={springs.snappy}
            style={{ originX: 0.5 }}
          />
        </div>

        {(error || hint) && (
          <p
            className={`mt-1.5 text-sm ${
              error ? 'text-error-500' : 'text-crust-500 dark:text-crumb-500'
            }`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Number input with increment/decrement
interface NumberInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, min, max, step = 1, unit, className = '', ...props }, ref) => {
    const handleChange = (newValue: number) => {
      if (min !== undefined && newValue < min) return;
      if (max !== undefined && newValue > max) return;
      onChange(newValue);
    };

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleChange(value - step)}
          className="w-11 h-11 rounded-full bg-crumb-200 dark:bg-crust-800 text-crust-700 dark:text-crumb-300 flex items-center justify-center touch-target hover:bg-crumb-300 dark:hover:bg-crust-700 transition-colors text-lg font-medium"
          disabled={min !== undefined && value <= min}
        >
          −
        </button>
        <div className="flex-1 relative">
          <input
            ref={ref}
            type="number"
            value={value}
            onChange={(e) => handleChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            className={`
              w-full min-h-[44px] px-4 py-2.5 text-center font-mono
              bg-white dark:bg-crust-900
              border border-crumb-300 dark:border-crust-700 rounded-xl
              text-crust-900 dark:text-crumb-100
              focus:outline-none focus:ring-2 focus:ring-crust-500/20 focus:border-crust-500
              [appearance:textfield]
              [&::-webkit-outer-spin-button]:appearance-none
              [&::-webkit-inner-spin-button]:appearance-none
              ${className}
            `}
            {...props}
          />
          {unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-crust-500 dark:text-crumb-500">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleChange(value + step)}
          className="w-11 h-11 rounded-full bg-crumb-200 dark:bg-crust-800 text-crust-700 dark:text-crumb-300 flex items-center justify-center touch-target hover:bg-crumb-300 dark:hover:bg-crust-700 transition-colors text-lg font-medium"
          disabled={max !== undefined && value >= max}
        >
          +
        </button>
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';

// Textarea
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  floatingLabel?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, floatingLabel = false, className = '', id, value, defaultValue, onFocus, onBlur, ...props }, ref) => {
    const inputId = id || `textarea-${Math.random().toString(36).slice(2)}`;
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined ? Boolean(value) : Boolean(defaultValue);
    const isFloating = floatingLabel && (isFocused || hasValue);

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    // Non-floating label (original behavior)
    if (!floatingLabel) {
      return (
        <div className="w-full">
          {label && (
            <label
              htmlFor={inputId}
              className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-1.5"
            >
              {label}
            </label>
          )}
          <textarea
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            className={`
              w-full min-h-[100px] px-4 py-3
              bg-surface1 dark:bg-surfaceDark1
              border rounded-xl resize-y
              ${error
                ? 'border-error-500 focus:ring-error-500/20'
                : 'border-crumb-300 dark:border-crust-700 focus:border-crust-500 focus:ring-crust-500/20'
              }
              text-crust-900 dark:text-crumb-100
              placeholder:text-crumb-500 dark:placeholder:text-crust-500
              focus:outline-none focus:ring-2
              transition-colors
              ${className}
            `}
            {...props}
          />
          {(error || hint) && (
            <p
              className={`mt-1.5 text-sm ${
                error ? 'text-error-500' : 'text-crust-500 dark:text-crumb-500'
              }`}
            >
              {error || hint}
            </p>
          )}
        </div>
      );
    }

    // Floating label variant
    return (
      <div className="w-full">
        <div className="relative">
          {/* Floating label */}
          {label && (
            <motion.label
              htmlFor={inputId}
              className={`
                absolute left-4 top-3 pointer-events-none
                ${isFloating
                  ? 'text-label-sm'
                  : 'text-body-md'
                }
                ${isFocused
                  ? 'text-crust-600 dark:text-honey-500'
                  : error
                    ? 'text-error-500'
                    : 'text-crust-500 dark:text-crumb-500'
                }
              `}
              initial={false}
              animate={{
                y: isFloating ? -8 : 0,
                scale: isFloating ? 0.85 : 1,
              }}
              transition={springs.snappy}
              style={{ originX: 0 }}
            >
              {label}
            </motion.label>
          )}

          <textarea
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={`
              w-full min-h-[120px] px-4 pt-6 pb-3
              bg-surface1 dark:bg-surfaceDark1
              border-2 rounded-xl resize-y
              ${isFocused
                ? 'border-crust-600 dark:border-honey-500'
                : error
                  ? 'border-error-500'
                  : 'border-crumb-300 dark:border-crust-700'
              }
              text-crust-900 dark:text-crumb-100
              focus:outline-none
              transition-colors duration-150
              ${className}
            `}
            placeholder=""
            {...props}
          />

          {/* Focus indicator line */}
          <motion.div
            className="absolute bottom-0 left-4 right-4 h-0.5 bg-crust-600 dark:bg-honey-500 rounded-full"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: isFocused ? 1 : 0 }}
            transition={springs.snappy}
            style={{ originX: 0.5 }}
          />
        </div>

        {(error || hint) && (
          <p
            className={`mt-1.5 text-sm ${
              error ? 'text-error-500' : 'text-crust-500 dark:text-crumb-500'
            }`}
          >
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
