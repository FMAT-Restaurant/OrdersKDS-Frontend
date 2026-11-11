import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Order } from '../../../shared/api/schemas.ts';

export interface ConfirmReadyDialogProps {
  readonly order: Order;
  readonly item: Order['items'][number];
  readonly isOpen: boolean;
  readonly isSubmitting?: boolean;
  readonly onConfirm: () => void;
  readonly onKeepInPrep: () => void;
}

export function ConfirmReadyDialog({
  order,
  item,
  isOpen,
  isSubmitting = false,
  onConfirm,
  onKeepInPrep,
}: Readonly<ConfirmReadyDialogProps>) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      confirmBtnRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';
  const orderNumberDisplay =
    order.orderNumber != null ? String(order.orderNumber) : displayId.slice(-4).toUpperCase();
  let tableDisplay = '';
  if (order.tableNumber !== null && order.tableNumber !== undefined) {
    tableDisplay = `Mesa ${order.tableNumber}`;
  } else if (order.isTakeaway) {
    tableDisplay = 'Para llevar';
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onKeepInPrep();
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="confirm-ready-dialog-title"
      aria-describedby="confirm-ready-dialog-desc"
      data-testid="confirm-ready-dialog"
      onKeyDown={handleKeyDown}
      className="orders-kds-root fixed inset-0 z-50 m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-xs border-none select-none"
    >
      <div className="w-full max-w-lg rounded-card bg-surface border border-border shadow-2xl p-6 flex flex-col gap-4 text-ink">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 id="confirm-ready-dialog-title" className="text-xl font-bold text-ink">
              ¿Marcar comanda como lista?
            </h2>
            <p className="text-sm text-muted">
              {tableDisplay ? `${tableDisplay} · ` : ''}Comanda #{orderNumberDisplay}
            </p>
          </div>
        </div>

        <div id="confirm-ready-dialog-desc" className="text-body text-sm space-y-2.5">
          <p>
            Has completado el último platillo ({' '}
            <span className="font-bold text-ink">{item.name}</span>).
          </p>
          <div className="p-3 bg-amber-50 rounded-control border border-amber-200 text-amber-900 text-xs sm:text-sm">
            <p className="font-semibold mb-1">
              ¿Deseas marcar la comanda completa como lista para entrega?
            </p>
            <p className="text-amber-800">
              Si aún faltan detalles o emplatado, puedes mantenerla en preparación y marcarla como lista
              manualmente cuando decidas pertinente.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            data-testid="confirm-ready-keep-prep-btn"
            onClick={onKeepInPrep}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 rounded-control font-bold text-sm bg-surface text-ink border border-border hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer disabled:opacity-50"
          >
            Mantener en preparación
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            data-testid="confirm-ready-submit-btn"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-control font-bold text-sm bg-fmat-primary text-white hover:bg-fmat-primary-hover focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? 'Marcando...' : 'Marcar comanda lista'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmReadyDialog;

