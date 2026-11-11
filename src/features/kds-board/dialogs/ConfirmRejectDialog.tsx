import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { Order } from '../../../shared/api/schemas.ts';
import { getOrderNumberDisplay } from '../orderNumberDisplay.ts';

export interface ConfirmRejectDialogProps {
  readonly order: Order;
  readonly isOpen: boolean;
  readonly isSubmitting?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmRejectDialog({
  order,
  isOpen,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmRejectDialogProps>) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      cancelBtnRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);

  let tableDisplay = '';
  if (order.tableNumber !== null && order.tableNumber !== undefined) {
    tableDisplay = `Mesa ${order.tableNumber}`;
  } else if (order.isTakeaway) {
    tableDisplay = 'Para llevar';
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="confirm-reject-dialog-title"
      aria-describedby="confirm-reject-dialog-desc"
      data-testid="confirm-reject-dialog"
      onKeyDown={handleKeyDown}
      className="orders-kds-root fixed inset-0 z-[60] m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-xs border-none select-none"
    >
      <div className="w-full max-w-lg rounded-card bg-surface border border-border shadow-2xl p-6 flex flex-col gap-4 text-ink">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <svg
              aria-hidden="true"
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 id="confirm-reject-dialog-title" className="text-xl font-bold text-ink">
              ¿Rechazar comanda por falta de insumos?
            </h2>
            <p className="text-sm text-muted">
              {tableDisplay ? `${tableDisplay} · ` : ''}Comanda #{orderNumberDisplay}
            </p>
          </div>
        </div>

        <div id="confirm-reject-dialog-desc" className="text-body text-sm space-y-2.5">
          <p>
            ¿Estás seguro de que deseas rechazar esta orden?
          </p>
          <div className="p-3 bg-red-50 rounded-control border border-red-200 text-red-900 text-xs sm:text-sm">
            <p className="font-semibold mb-1">
              Atención: Esta acción notificará la falta de insumos en cocina.
            </p>
            <p className="text-red-800">
              Se informará al personal de piso y servicio para cancelar o ajustar la comanda con el cliente.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            ref={cancelBtnRef}
            type="button"
            data-testid="confirm-reject-cancel-btn"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{ minHeight: 48 }}
            className="w-full sm:w-auto min-h-[48px] px-4 py-2.5 rounded-control font-bold text-sm bg-surface text-ink border border-border hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="confirm-reject-submit-btn"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{ minHeight: 48 }}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-control font-bold text-sm bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer shadow-sm disabled:opacity-50 border-0"
          >
            {isSubmitting ? 'Rechazando...' : 'Confirmar rechazo'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmRejectDialog;

