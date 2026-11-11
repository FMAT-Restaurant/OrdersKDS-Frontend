import { useState } from 'react';
import { z } from 'zod';
import { OrderSchema, type Order } from '../../../shared/api/schemas.ts';
import { UserRole } from '../../../shared/types/auth.ts';
import { OrderStatus } from '../../../shared/types/order.ts';
import { pointerAction } from '../pointerAction.ts';
import { VirtualKeyboard } from './VirtualKeyboard.tsx';

const InPreparationOrderSchema = OrderSchema.extend({
  status: z.literal(OrderStatus.IN_PREPARATION),
});

const ChefVoidJustificationSchema = z
  .object({
    selectedReasons: z.array(z.string().min(1)),
    customNote: z.string(),
  })
  .refine(
    (data) => data.selectedReasons.length > 0 || data.customNote.trim().length > 0,
    { message: 'At least one quick reason or non-empty text note is required (RF-29).' },
  );

const QUICK_REASONS: readonly string[] = [
  'Quemado',
  'Caído',
  'Contaminación cruzada',
  'Falla de equipo',
];

export interface ChefVoidDialogProps {
  readonly order: Order;
  readonly isOpen?: boolean;
  readonly userRole?: UserRole;
  readonly isSubmitting?: boolean;
  readonly onConfirm: (order: Order, note: string) => void;
  readonly onCancel: () => void;
}

/**
 * Kitchen-error void dialog for Chef / Admin on orders in IN_PREPARATION (TASK-36, RF-28..RF-31, ADR-0012).
 * Warns that the customer will not be charged and enforces mandatory justification (RF-29).
 * Hidden for non-chef/non-admin roles according to RF-28, RF-29 and UT-FE-22.
 */
export function ChefVoidDialog({
  order,
  isOpen = true,
  userRole,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: Readonly<ChefVoidDialogProps>) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState<string>('');

  if (!isOpen) {
    return null;
  }

  // UT-FE-22, RF-28, RF-29: Kitchen-error void is visible only to chef and admin roles
  if (userRole && userRole !== UserRole.CHEF && userRole !== UserRole.ADMIN) {
    return null;
  }

  const orderValidation = InPreparationOrderSchema.safeParse(order);
  const isOperable = orderValidation.success && order.status === OrderStatus.IN_PREPARATION;

  const justificationValidation = ChefVoidJustificationSchema.safeParse({
    selectedReasons,
    customNote,
  });
  const isConfirmEnabled = isOperable && justificationValidation.success && !isSubmitting;

  const displayId = order.id ?? order.orderId ?? order.publicId ?? 'unknown';

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason],
    );
  };

  const handleConfirm = () => {
    const trimmedNote = customNote.trim();
    const parts = [...selectedReasons];
    if (trimmedNote.length > 0) {
      parts.push(trimmedNote);
    }
    const finalNote = parts.join(' - ');
    onConfirm(order, finalNote);
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="chef-void-dialog-title"
      data-testid="chef-void-dialog"
      className="orders-kds-root fixed inset-0 z-50 m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-sm border-none select-none overflow-y-auto"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-card bg-surface border border-border p-6 text-ink shadow-2xl flex flex-col gap-4">
        <header className="flex items-center justify-between border-b border-border pb-3">
          <h2 id="chef-void-dialog-title" className="text-2xl font-black text-ink">
            Anulación por Error de Cocina #{displayId}
          </h2>
        </header>

        <div
          role="alert"
          data-testid="chef-void-warning"
          className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-blue-800 font-bold text-lg"
        >
          No se cobrará por error de cocina
        </div>

        {!isOperable && (
          <div
            role="alert"
            data-testid="chef-void-invalid-status"
            className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-red-700 font-semibold text-base"
          >
            Operación bloqueada: la comanda debe estar en estado EN PREPARACIÓN ({OrderStatus.IN_PREPARATION}).
          </div>
        )}

        <section aria-label="Motivos rápidos de error de cocina" className="flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-wider text-body">
            Seleccione uno o más motivos rápidos:
          </span>
          <div
            data-testid="chef-quick-reasons-grid"
            className="grid grid-cols-2 gap-3"
          >
            {QUICK_REASONS.map((reason, idx) => {
              const isSelected = selectedReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  disabled={!isOperable || isSubmitting}
                  aria-pressed={isSelected}
                  data-testid={`chef-reason-${idx}`}
                  {...pointerAction(() => toggleReason(reason))}
                  style={{ minHeight: 64, minWidth: 64 }}
                  className={`min-h-[64px] min-w-[64px] px-4 py-3 rounded-md font-bold text-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-fmat-primary text-white border-fmat-primary shadow-sm'
                      : 'bg-surface text-ink border border-border hover:bg-fmat-soft hover:border-fmat-primary'
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Detalle adicional del motivo" className="flex flex-col gap-3">
          <label
            htmlFor="chef-void-note-input"
            className="text-sm font-semibold uppercase tracking-wider text-body"
          >
            Nota adicional (opcional si eligió motivo rápido):
          </label>
          <input
            id="chef-void-note-input"
            type="text"
            value={customNote}
            disabled={!isOperable || isSubmitting}
            onChange={(event) => setCustomNote(event.target.value)}
            placeholder="Escriba con el teclado en pantalla..."
            data-testid="chef-void-note-input"
            className="w-full min-h-[48px] px-4 py-2 rounded-md bg-surface border border-border text-ink placeholder:text-muted text-lg font-medium focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40"
          />

          <VirtualKeyboard
            value={customNote}
            onChange={setCustomNote}
            disabled={!isOperable || isSubmitting}
          />
        </section>

        <footer className="sticky -bottom-6 bg-surface flex items-center justify-end gap-4 pt-3 pb-1 border-t border-border shrink-0 -mx-6 px-6">
          <button
            type="button"
            data-testid="chef-void-cancel"
            disabled={isSubmitting}
            {...pointerAction(onCancel)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-md bg-surface hover:bg-gray-100 text-body font-bold text-lg border border-border focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="chef-void-confirm"
            disabled={!isConfirmEnabled}
            {...pointerAction(handleConfirm)}
            style={{ minHeight: 64, minWidth: 64 }}
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Confirmar
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default ChefVoidDialog;

