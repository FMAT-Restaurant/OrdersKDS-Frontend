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
      className="flex flex-col gap-2 bg-gray-950 p-3 rounded-lg border border-gray-800 select-none"
    >
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div
          key={`kb-row-${rowIndex}`}
          className="flex flex-wrap justify-center gap-2"
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
              className="min-h-[64px] min-w-[64px] px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white font-bold text-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {letter}
            </button>
          ))}
        </div>
      ))}

      <div className="flex flex-wrap justify-center gap-2 mt-1">
        <button
          type="button"
          disabled={disabled}
          data-testid="virtual-key-space"
          aria-label="Espacio"
          {...pointerAction(handleSpace)}
          style={{ minHeight: 64, minWidth: 64 }}
          className="min-h-[64px] min-w-[64px] flex-1 max-w-xs px-6 py-2 rounded-md bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white font-bold text-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          className="min-h-[64px] min-w-[64px] px-6 py-2 rounded-md bg-red-900/80 hover:bg-red-800 active:bg-red-700 text-white font-bold text-lg border border-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}

export default VirtualKeyboard;

