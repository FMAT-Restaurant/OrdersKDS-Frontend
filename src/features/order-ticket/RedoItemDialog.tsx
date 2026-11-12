import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export interface RedoItemDialogProps {
  readonly itemName: string;
  readonly isPending: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (note: string) => Promise<void>;
}

export function RedoItemDialog({
  itemName,
  isPending,
  onClose,
  onSubmit,
}: Readonly<RedoItemDialogProps>) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    noteInput.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    if (isPending) dialog.current?.focus();
  }, [isPending]);

  useEffect(() => {
    const dialogElement = dialog.current;
    if (!dialogElement) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = dialogElement.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled)',
      );
      const firstElement = focusableElements.item(0);
      const lastElement = focusableElements.item(focusableElements.length - 1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.target === dialogElement && !isPending) {
        onClose();
      }
    };

    dialogElement.addEventListener('keydown', handleKeyDown);
    dialogElement.addEventListener('mousedown', handleMouseDown);

    return () => {
      dialogElement.removeEventListener('keydown', handleKeyDown);
      dialogElement.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isPending, onClose]);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote || isPending) return;

    setError(null);
    try {
      await onSubmit(trimmedNote);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No se pudo solicitar la rehechura del platillo.',
      );
    }
  };

  return (
    <dialog
      open
      ref={dialog}
      aria-modal="true"
      aria-labelledby="redo-item-title"
      aria-describedby="redo-item-description"
      tabIndex={-1}
      data-testid="redo-item-dialog-backdrop"
      className="fixed inset-0 z-50 m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 border-none backdrop:bg-transparent"
    >
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl">
        <h2 id="redo-item-title" className="text-xl font-bold text-gray-900">
          Rehacer platillo
        </h2>
        <p id="redo-item-description" className="mt-2 text-gray-600 text-sm sm:text-base">
          Indica por qué se devuelve <span className="font-semibold text-gray-900">{itemName}</span> a cocina.
        </p>

        <form className="mt-5" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="redo-item-note" className="mb-2 block text-sm font-semibold text-gray-800">
            Motivo <span aria-hidden="true" className="text-red-600">*</span>
          </label>
          <textarea
            ref={noteInput}
            id="redo-item-note"
            name="note"
            required
            rows={4}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            disabled={isPending}
            className="w-full resize-y rounded-md border border-gray-400 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600 font-semibold">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="order-ticket__redo-cancel min-h-12 min-w-[7rem] rounded-md border border-gray-400 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!note.trim() || isPending}
              className="order-ticket__redo-submit min-h-12 min-w-[7rem] rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {isPending ? 'Enviando…' : 'Rehacer'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
