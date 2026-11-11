import { pointerAction } from '../pointerAction.ts';

export interface VirtualKeyboardProps {
  readonly value: string;
  readonly onChange: (nextValue: string) => void;
  readonly disabled?: boolean;
}

const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

/**
 * On-screen touch virtual keyboard for KDS dialogs (TASK-36, ADR-0012).
 * All keys enforce a minimum touch target of 64x64 pixels.
 */
export function VirtualKeyboard({
  value,
  onChange,
  disabled = false,
}: Readonly<VirtualKeyboardProps>) {
  const handleKeyPress = (char: string) => {
    onChange(`${value}${char}`);
  };

  const handleSpace = () => {
    onChange(`${value} `);
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  return (
    <div
      data-testid="virtual-keyboard"
      aria-label="Teclado virtual en pantalla"
      className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-border select-none overflow-x-auto w-full"
    >
      <div className="flex flex-col gap-2 min-w-max mx-auto">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div
            key={`kb-row-${rowIndex}`}
            className="flex flex-nowrap justify-center gap-1.5 sm:gap-2 w-full"
          >
            {row.map((letter) => (
              <button
                key={letter}
                type="button"
                disabled={disabled}
                data-testid={`virtual-key-${letter}`}
                aria-label={`Tecla ${letter}`}
                {...pointerAction(() => handleKeyPress(letter))}
                style={{ minHeight: 64, minWidth: 64 }}
                className="min-h-[64px] min-w-[64px] px-3 py-2 rounded-control bg-surface hover:bg-gray-100 active:bg-gray-200 text-ink font-bold text-lg border border-border focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center justify-center select-none"
              >
                {letter}
              </button>
            ))}
          </div>
        ))}

        <div className="flex flex-nowrap justify-center gap-2 mt-1 w-full">
          <button
            type="button"
            disabled={disabled}
            data-testid="virtual-key-space"
            aria-label="Espacio"
            {...pointerAction(handleSpace)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] flex-1 max-w-sm px-6 py-2 rounded-control bg-surface hover:bg-gray-100 active:bg-gray-200 text-ink font-bold text-lg border border-border focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Espacio
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid="virtual-key-backspace"
            aria-label="Borrar"
            {...pointerAction(handleBackspace)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-2 rounded-control bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 font-bold text-lg border border-red-300 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default VirtualKeyboard;

