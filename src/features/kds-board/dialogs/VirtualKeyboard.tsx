import { pointerAction } from '../pointerAction.ts';

export interface VirtualKeyboardProps {
  readonly value: string;
  readonly onChange: (nextValue: string) => void;
  readonly disabled?: boolean;
  readonly floating?: boolean;
  readonly maxLength?: number;
  readonly title?: string;
  readonly onClose?: () => void;
}

const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

/**
 * On-screen touch virtual keyboard for KDS dialogs (TASK-36, ADR-0012).
 * All keys enforce a minimum touch target of 64x64 pixels.
 * Supports `floating` mode to dock elevated above dialog backdrops without blocking forms.
 */
export function VirtualKeyboard({
  value,
  onChange,
  disabled = false,
  floating = false,
  maxLength,
  title = 'Teclado en pantalla',
  onClose,
}: Readonly<VirtualKeyboardProps>) {
  const appendText = (chunk: string) => {
    if (disabled) return;
    if (maxLength !== undefined && value.length >= maxLength) return;
    const nextValue = `${value}${chunk}`;
    onChange(maxLength !== undefined ? nextValue.slice(0, maxLength) : nextValue);
  };

  const handleKeyPress = (char: string) => {
    appendText(char);
  };

  const handleSpace = () => {
    appendText(' ');
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const containerClass = floating
    ? 'fixed inset-x-0 bottom-0 z-[70] flex flex-col gap-2 bg-surface/95 backdrop-blur-md px-3 pt-2 pb-3 border-t-2 border-fmat-primary shadow-2xl select-none overflow-x-auto w-full'
    : 'flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-border select-none overflow-x-auto w-full';

  return (
    <div
      data-testid="virtual-keyboard"
      aria-label="Teclado virtual en pantalla"
      className={containerClass}
    >
      {floating && (
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-3 px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {title}
          </span>
          {onClose && (
            <button
              type="button"
              data-testid="virtual-keyboard-close"
              disabled={disabled}
              {...pointerAction(onClose)}
              style={{ minHeight: 64, minWidth: 64 }}
              className="min-h-[64px] min-w-[64px] px-4 py-2 rounded-control text-xs sm:text-sm font-bold text-fmat-primary hover:bg-gray-100 border border-border bg-surface cursor-pointer disabled:opacity-40"
            >
              Ocultar teclado
            </button>
          )}
        </div>
      )}
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

