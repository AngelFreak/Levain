import { forwardRef, type InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  showValue?: boolean;
  marks?: { value: number; label: string }[];
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      label,
      value,
      onChange,
      min,
      max,
      step = 1,
      unit = '',
      showValue = true,
      marks,
      className = '',
      ...props
    },
    ref
  ) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className={`w-full ${className}`}>
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-2">
            {label && (
              <span className="text-sm font-medium text-crust-700 dark:text-crumb-200">
                {label}
              </span>
            )}
            {showValue && (
              <span className="text-sm font-mono text-crust-600 dark:text-crumb-400">
                {value}
                {unit}
              </span>
            )}
          </div>
        )}

        <div className="relative">
          <input
            ref={ref}
            type="range"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            className="
              w-full h-2 rounded-full appearance-none cursor-pointer
              bg-crumb-200 dark:bg-crust-800
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-6
              [&::-webkit-slider-thumb]:h-6
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-crust-600
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-thumb]:active:scale-95
              [&::-moz-range-thumb]:w-6
              [&::-moz-range-thumb]:h-6
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-crust-600
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:shadow-md
              [&::-moz-range-thumb]:cursor-pointer
            "
            style={{
              background: `linear-gradient(to right, #8b4513 0%, #8b4513 ${percentage}%, #e0ccb3 ${percentage}%, #e0ccb3 100%)`,
            }}
            {...props}
          />
        </div>

        {marks && (
          <div className="relative mt-1 flex justify-between text-xs text-crust-500 dark:text-crumb-500">
            {marks.map((mark) => (
              <span
                key={mark.value}
                className="absolute -translate-x-1/2"
                style={{ left: `${((mark.value - min) / (max - min)) * 100}%` }}
              >
                {mark.label}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
);

Slider.displayName = 'Slider';
