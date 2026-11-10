import { z } from 'zod';
import { OrderSchema, type Order } from '../../../shared/api/schemas.ts';
import { UserRole } from '../../../shared/types/auth.ts';
import { OrderStatus } from '../../../shared/types/order.ts';
import { pointerAction } from '../pointerAction.ts';

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

  const handleConfirm = () => {
    onConfirm(order);
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="admin-void-dialog-title"
      data-testid="admin-void-dialog"
      className="orders-kds-root fixed inset-0 z-50 m-0 p-6 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/75 border-none select-none"
    >
      <div className="w-full max-w-lg rounded-fmat bg-gray-900 border border-gray-700 p-6 text-white shadow-2xl flex flex-col gap-5">
        <header className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 id="admin-void-dialog-title" className="text-2xl font-black text-white">
            Anulación Administrativa #{displayId}
          </h2>
        </header>

        <div
          role="alert"
          data-testid="admin-void-warning"
          className="rounded-md bg-amber-950/90 border border-amber-500/60 px-4 py-3 text-amber-200 font-bold text-lg"
        >
          Se cobrará la comanda mermada
        </div>

        {!isOperable && (
          <div
            role="alert"
            data-testid="admin-void-invalid-status"
            className="rounded-md bg-red-950 border border-red-500 px-4 py-3 text-red-200 font-semibold text-base"
          >
            Operación bloqueada: la comanda debe estar en estado EN PREPARACIÓN ({OrderStatus.IN_PREPARATION}).
          </div>
        )}

        <footer className="flex items-center justify-end gap-4 pt-2 border-t border-gray-800">
          <button
            type="button"
            data-testid="admin-void-cancel"
            disabled={isSubmitting}
            {...pointerAction(onCancel)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-md bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="admin-void-confirm"
            disabled={!isOperable || isSubmitting}
            {...pointerAction(handleConfirm)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirmar
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default AdminVoidDialog;

