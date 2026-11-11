import { z } from 'zod';
import { OrderSchema, type Order } from '../../../shared/api/schemas.ts';
import { UserRole } from '../../../shared/types/auth.ts';
import { OrderStatus } from '../../../shared/types/order.ts';
import { pointerAction } from '../pointerAction.ts';
import { getOrderNumberDisplay } from '../orderNumberDisplay.ts';

const InPreparationOrderSchema = OrderSchema.extend({
  status: z.literal(OrderStatus.IN_PREPARATION),
});

export interface AdminVoidDialogProps {
  readonly order: Order;
  readonly isOpen?: boolean;
  readonly userRole?: UserRole;
  readonly isSubmitting?: boolean;
  readonly onConfirm: (order: Order) => void;
  readonly onCancel: () => void;
}

/**
 * Administrative void dialog for orders in IN_PREPARATION (TASK-36, RF-26, RF-27, ADR-0012).
 * Warns that the wasted order will still be charged to the customer.
 * Hidden for non-admin roles according to RF-26 and UT-FE-23.
 */
export function AdminVoidDialog({
  order,
  isOpen = true,
  userRole,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: Readonly<AdminVoidDialogProps>) {
  if (!isOpen) {
    return null;
  }

  // UT-FE-23 & RF-26: Administrative void is strictly hidden for non-admin roles
  if (userRole && userRole !== UserRole.ADMIN) {
    return null;
  }

  const validation = InPreparationOrderSchema.safeParse(order);
  const isOperable = validation.success && order.status === OrderStatus.IN_PREPARATION;
  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);
  const tableDisplay =
    order.tableNumber != null ? `Mesa ${order.tableNumber}` : order.isTakeaway ? 'Para llevar' : null;

  const handleConfirm = () => {
    onConfirm(order);
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="admin-void-dialog-title"
      data-testid="admin-void-dialog"
      className="orders-kds-root fixed inset-0 z-50 m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-sm border-none select-none overflow-y-auto"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-card bg-surface border border-border p-6 text-ink shadow-2xl flex flex-col gap-4">
        <header className="flex items-center justify-between border-b border-border pb-3">
          <h2 id="admin-void-dialog-title" className="text-2xl font-black text-ink">
            Anulación Administrativa {tableDisplay ? `· ${tableDisplay}` : ''} · #{orderNumberDisplay}
            <span className="sr-only">#{displayId}</span>
          </h2>
        </header>

        <div
          role="alert"
          data-testid="admin-void-warning"
          className="rounded-control bg-amber-50 border border-amber-300 px-4 py-3 text-amber-900 font-bold text-center text-base"
        >
          Se cobrará la comanda mermada
        </div>

        {!isOperable && (
          <div
            role="alert"
            data-testid="admin-void-invalid-status"
            className="rounded-md bg-red-50 border border-red-300 px-4 py-3 text-red-700 font-semibold text-base"
          >
            Operación bloqueada: la comanda debe estar en estado EN PREPARACIÓN ({OrderStatus.IN_PREPARATION}).
          </div>
        )}

        <footer className="sticky -bottom-6 bg-surface flex items-center justify-end gap-4 pt-3 pb-1 border-t border-border shrink-0 -mx-6 px-6">
          <button
            type="button"
            data-testid="admin-void-cancel"
            disabled={isSubmitting}
            {...pointerAction(onCancel)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-control bg-surface hover:bg-gray-100 text-body font-bold text-lg border border-border focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="admin-void-confirm"
            disabled={!isOperable || isSubmitting}
            {...pointerAction(handleConfirm)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-control bg-red-600 hover:bg-red-700 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Confirmar
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default AdminVoidDialog;

