import { forwardRef, type InputHTMLAttributes } from 'react';

interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  /** ISO date string (yyyy-mm-dd) or empty */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Native date picker styled to match the app's Input. Uses <input type="date">
 * so it gets the platform's native calendar UI (important on iOS/Android via
 * Capacitor) while keeping the honey/crust/crumb visual language.
 *
 * Value is a yyyy-mm-dd string. Use toDateInputValue() / fromDateInputValue()
 * to convert to/from Date objects.
 */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(
  ({ label, error, hint, value, onChange, className = '', id, ...props }, ref) => {
    const inputId = id || `date-${Math.random().toString(36).slice(2)}`;

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
        <input
          ref={ref}
          id={inputId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`
            w-full min-h-[44px] px-4 py-2.5
            bg-surface1 dark:bg-surfaceDark1
            border rounded-xl
            ${error
              ? 'border-error-500 focus:ring-error-500/20'
              : 'border-crumb-300 dark:border-crust-700 focus:border-crust-500 focus:ring-crust-500/20'
            }
            text-crust-900 dark:text-crumb-100
            focus:outline-none focus:ring-2
            transition-colors
            [color-scheme:light] dark:[color-scheme:dark]
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
);

DateField.displayName = 'DateField';

/** Convert a Date to the yyyy-mm-dd string an <input type="date"> expects (local time). */
export function toDateInputValue(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a yyyy-mm-dd string into a Date at local noon (avoids TZ day-shift). */
export function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
