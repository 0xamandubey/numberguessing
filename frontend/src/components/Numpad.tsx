import React from 'react';
import { Delete } from 'lucide-react';

interface NumpadProps {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  disabled?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
}

export const Numpad: React.FC<NumpadProps> = ({
  value,
  onChange,
  maxLength = 4,
  disabled = false,
  onSubmit,
  submitLabel = 'Submit Guess'
}) => {
  const handleKeyPress = (key: string) => {
    if (disabled) return;

    // Trigger haptic feedback if available on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }

    if (key === 'C') {
      onChange('');
    } else if (key === 'backspace') {
      onChange(value.slice(0, -1));
    } else {
      if (value.length < maxLength) {
        onChange(value + key);
      }
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'backspace'];

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="grid grid-cols-3 gap-3">
        {keys.map((key) => {
          const isBackspace = key === 'backspace';
          const isClear = key === 'C';
          
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => handleKeyPress(key)}
              className={`
                h-14 md:h-16 font-mono text-2xl font-bold flex items-center justify-center transition-colors select-none rounded-2xl shadow-sm border
                ${disabled 
                  ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' 
                  : isClear 
                    ? 'bg-rose-50 border-rose-100 text-rose-500 hover:bg-rose-100 active:bg-rose-200'
                    : isBackspace
                      ? 'bg-pink-100 border-pink-200 text-pink-600 hover:bg-pink-200 active:bg-pink-300'
                      : 'bg-white border-pink-50 text-gray-700 hover:bg-pink-50 active:bg-pink-100'
                }
              `}
            >
              {isBackspace ? <Delete className="w-6 h-6" /> : key}
            </button>
          );
        })}
      </div>

      {onSubmit && (
        <button
          type="button"
          disabled={disabled || value.length < maxLength}
          onClick={onSubmit}
          className={`
            w-full mt-5 py-3.5 font-bold font-sans tracking-wide transition-all select-none text-center rounded-2xl shadow-sm
            ${disabled || value.length < maxLength
              ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-pink-500 text-white hover:bg-pink-600 active:bg-pink-700 active:scale-[0.98]'
            }
          `}
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
};
