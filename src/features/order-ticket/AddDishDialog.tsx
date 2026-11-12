import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export interface NewDishData {
  readonly dishId?: string;
  readonly itemId?: string;
  readonly name: string;
  readonly quantity: number;
  readonly modifiers: string[];
  readonly notes: string;
  readonly unitPrice?: number;
}

export interface SelectedDishInfo {
  readonly dishId?: string;
  readonly itemId?: string;
  readonly name: string;
  readonly unitPrice?: number;
}

export interface AddDishDialogProps {
  readonly isOpen?: boolean;
  readonly isPending?: boolean;
  readonly dish?: SelectedDishInfo | null;
  readonly initialDishName?: string;
  readonly onClose: () => void;
  readonly onAdd: (dish: NewDishData) => void;
}

export function AddDishDialog({
  isOpen = true,
  isPending = false,
  dish,
  initialDishName,
  onClose,
  onAdd,
}: Readonly<AddDishDialogProps>) {
  const resolvedName = dish?.name ?? initialDishName ?? 'Platillo del Menú';
  const [quantity, setQuantity] = useState(1);
  const [modifiersText, setModifiersText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const quantityInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    quantityInputRef.current?.focus();
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    const dialogElement = dialogRef.current;
    if (!dialogElement) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        event.preventDefault();
        onClose();
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

  if (!isOpen) return null;

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = resolvedName.trim();
    if (!trimmedName) {
      setError('El nombre del platillo es obligatorio.');
      return;
    }
    if (quantity < 1) {
      setError('La cantidad debe ser al menos 1.');
      return;
    }

    const modifiers = modifiersText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    onAdd({
      dishId: dish?.dishId,
      itemId: dish?.itemId,
      name: trimmedName,
      quantity,
      modifiers,
      notes: notes.trim(),
      unitPrice: dish?.unitPrice,
    });
    onClose();
  };

  return (
    <dialog
      open
      ref={dialogRef}
      className="order-ticket__dialog"
      data-testid="add-dish-dialog"
      aria-labelledby="add-dish-dialog-title"
      aria-modal="true"
    >
      <form onSubmit={handleSubmit} className="order-ticket__add-dish-form">
        <h3 id="add-dish-dialog-title">Agregar Platillo a la Comanda</h3>
        <p className="order-ticket__dialog-subtitle">
          Personaliza la porción, modificadores y notas para cocina:
        </p>

        <label htmlFor="add-dish-name">
          <span>Platillo</span>
          <input
            id="add-dish-name"
            type="text"
            readOnly
            aria-readonly="true"
            data-testid="add-dish-name-input"
            value={resolvedName}
            className="order-ticket__dish-name-readonly"
            title="El nombre del platillo se obtiene del menú y no se puede modificar manualmente"
          />
        </label>

        <label htmlFor="add-dish-quantity">
          <span>Cantidad *</span>
          <div className="order-ticket__stepper">
            <button
              type="button"
              className="order-ticket__stepper-button"
              aria-label="Disminuir cantidad"
              disabled={quantity <= 1 || isPending}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <input
              id="add-dish-quantity"
              ref={quantityInputRef}
              type="number"
              min="1"
              step="1"
              data-testid="add-dish-quantity-input"
              value={quantity}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setQuantity(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
              }}
              disabled={isPending}
            />
            <button
              type="button"
              className="order-ticket__stepper-button"
              aria-label="Aumentar cantidad"
              disabled={isPending}
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </button>
          </div>
        </label>

        <label htmlFor="add-dish-modifiers">
          <span>Modificadores (separados por coma)</span>
          <input
            id="add-dish-modifiers"
            type="text"
            data-testid="add-dish-modifiers-input"
            value={modifiersText}
            onChange={(e) => setModifiersText(e.target.value)}
            placeholder="Ej. Extra queso, sin cebolla"
            disabled={isPending}
          />
        </label>

        <label htmlFor="add-dish-notes">
          <span>Notas de cocina</span>
          <textarea
            id="add-dish-notes"
            data-testid="add-dish-notes-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instrucciones especiales para cocina..."
            disabled={isPending}
          />
        </label>

        {error && (
          <p className="order-ticket__dialog-error" role="alert">
            {error}
          </p>
        )}

        <div className="order-ticket__dialog-actions">
          <button
            type="button"
            className="order-ticket__button-secondary"
            data-testid="add-dish-cancel-btn"
            disabled={isPending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="order-ticket__add-submit"
            data-testid="add-dish-submit-btn"
            disabled={quantity < 1 || isPending}
          >
            {isPending ? 'Agregando…' : 'Agregar platillo'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
