import { useState } from 'react';
import { z } from 'zod';
import { OrderSchema, type Order } from '../../../shared/api/schemas.ts';
import { UserRole } from '../../../shared/types/auth.ts';
import { OrderStatus } from '../../../shared/types/order.ts';
import { pointerAction } from '../pointerAction.ts';
import { getOrderNumberDisplay } from '../orderNumberDisplay.ts';
import { VirtualKeyboard } from './VirtualKeyboard.tsx';

const InPreparationOrderSchema = OrderSchema.extend({
  status: z.literal(OrderStatus.IN_PREPARATION),
});

export interface AdminVoidOptions {
  readonly reason?: string;
  readonly chargeCustomer: boolean;
}

export interface AdminVoidDialogProps {
  readonly order: Order;
  readonly isOpen?: boolean;
  readonly userRole?: UserRole;
  readonly isSubmitting?: boolean;
  readonly onConfirm: (order: Order, options?: AdminVoidOptions) => void;
  readonly onCancel: () => void;
}

export interface QuickReason {
  readonly label: string;
  readonly description: string;
  readonly defaultCharge: boolean;
}

const ADMIN_QUICK_REASONS: readonly QuickReason[] = [
  {
    label: 'Deserción del comensal',
    description: 'Comensal abandonó el restaurante sin esperar o pagar',
    defaultCharge: true,
  },
  {
    label: 'Cancelación tardía',
    description: 'Comensal canceló cuando la preparación ya estaba avanzada',
    defaultCharge: true,
  },
  {
    label: 'Error de captura del mesero',
    description: 'Comanda ingresada por error en mesa o platillo equivocado',
    defaultCharge: false,
  },
  {
    label: 'Cortesía gerencial',
    description: 'Compensación por demora excesiva o disputa de servicio',
    defaultCharge: false,
  },
];

function getReasonButtonClass(isSelected: boolean, isContradictory: boolean): string {
  if (isContradictory) {
    return 'opacity-40 cursor-not-allowed bg-gray-100 text-muted border-border';
  }
  if (isSelected) {
    return 'bg-fmat-primary text-white border-fmat-primary shadow-sm';
  }
  return 'bg-surface text-ink border-border hover:bg-gray-50';
}

function getChargeSwitchDescription(
  hasQuickReasons: boolean,
  customReasonActive: boolean,
  chargeCustomer: boolean,
): string {
  if (hasQuickReasons) {
    return 'Fijado automáticamente por los motivos predeterminados seleccionados.';
  }
  if (customReasonActive) {
    if (chargeCustomer) {
      return 'Se enviará el cargo a la cuenta de la mesa.';
    }
    return 'Se registrará como merma absorbida por el restaurante.';
  }
  return 'Activa una razón personalizada para habilitar la edición manual del cobro.';
}

function getChargeSwitchTitle(
  hasQuickReasons: boolean,
  customReasonActive: boolean,
): string | undefined {
  if (hasQuickReasons) {
    return 'El cobro está determinado por los motivos seleccionados y no se puede alterar';
  }
  if (!customReasonActive) {
    return 'Activa una razón personalizada para habilitar la edición manual del cobro';
  }
  return undefined;
}

/**
 * Administrative void dialog for orders in IN_PREPARATION (TASK-36, RF-26, RF-27, ADR-0012).
 * Enables Administrator to select quick administrative reasons, input notes,
 * and define whether the wasted order should be charged to the customer or registered as pure waste.
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
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customReasonActive, setCustomReasonActive] = useState<boolean>(false);
  const [customReason, setCustomReason] = useState<string>('');
  const [chargeCustomer, setChargeCustomer] = useState<boolean>(true);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false);

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

  let tableDisplay: string | null = null;
  if (order.tableNumber != null) {
    tableDisplay = `Mesa ${order.tableNumber}`;
  } else if (order.isTakeaway) {
    tableDisplay = 'Para llevar';
  }

  const hasChargeReasonsSelected = selectedReasons.some((label) => {
    const r = ADMIN_QUICK_REASONS.find((item) => item.label === label);
    return r?.defaultCharge === true;
  });

  const hasNoChargeReasonsSelected = selectedReasons.some((label) => {
    const r = ADMIN_QUICK_REASONS.find((item) => item.label === label);
    return r?.defaultCharge === false;
  });

  const hasQuickReasons = selectedReasons.length > 0;
  const isManualToggleAllowed = customReasonActive && !hasQuickReasons;
  const isChargeToggleDisabled = !isOperable || isSubmitting || !isManualToggleAllowed;

  const handleToggleCharge = () => {
    if (isChargeToggleDisabled) {
      return;
    }
    setChargeCustomer((prev) => !prev);
  };

  const isContradictoryReason = (reason: QuickReason) => {
    if (reason.defaultCharge) {
      return hasNoChargeReasonsSelected;
    }
    return hasChargeReasonsSelected;
  };

  const toggleReason = (reason: QuickReason) => {
    if (isContradictoryReason(reason)) {
      return;
    }
    setSelectedReasons((prev) => {
      const exists = prev.includes(reason.label);
      if (exists) {
        return prev.filter((item) => item !== reason.label);
      }
      setChargeCustomer(reason.defaultCharge);
      return [...prev, reason.label];
    });
  };

  const handleConfirm = () => {
    const trimmedReason = customReason.trim();
    const parts = [...selectedReasons];
    if (customReasonActive && trimmedReason.length > 0) {
      parts.push(trimmedReason);
    }
    const finalReason = parts.length > 0 ? parts.join(' - ') : undefined;
    onConfirm(order, { reason: finalReason, chargeCustomer });
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="admin-void-dialog-title"
      data-testid="admin-void-dialog"
      className="orders-kds-root fixed inset-0 z-[60] m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-sm border-none select-none overflow-y-auto"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-card bg-surface border border-border p-6 text-ink shadow-2xl flex flex-col gap-4">
        <header className="flex items-center justify-between border-b border-border pb-3">
          <h2 id="admin-void-dialog-title" className="text-2xl font-black text-ink">
            Anulación Administrativa {tableDisplay ? `· ${tableDisplay}` : ''} · #{orderNumberDisplay}
            <span className="sr-only">#{displayId}</span>
          </h2>
        </header>

        {/* Charge Customer Toggle Switch */}
        <div className="flex items-center justify-between p-3.5 bg-gray-50 border border-border rounded-control">
          <div className="flex flex-col">
            <span id="admin-charge-label" className="font-bold text-ink text-base">
              ¿Cobrar comanda mermada al comensal?
            </span>
            <span className="text-sm text-body">
              {getChargeSwitchDescription(hasQuickReasons, customReasonActive, chargeCustomer)}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            id="admin-void-charge-toggle"
            aria-checked={chargeCustomer}
            aria-labelledby="admin-charge-label"
            data-testid="admin-void-charge-toggle"
            disabled={isChargeToggleDisabled}
            title={getChargeSwitchTitle(hasQuickReasons, customReasonActive)}
            {...pointerAction(handleToggleCharge)}
            style={{ minHeight: 48, minWidth: 48 }}
            className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-fmat-primary items-center p-1 ${
              isChargeToggleDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${chargeCustomer ? 'bg-fmat-primary' : 'bg-gray-300'}`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                chargeCustomer ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Instructions banner for UI/UX clarity */}
        <div className="p-3 bg-gray-50 border border-border rounded-control text-xs text-body leading-relaxed flex flex-col gap-1">
          <span className="font-bold text-ink">
            Instrucciones para la anulación:
          </span>
          <span>
            Los motivos predeterminados establecen automáticamente si la comanda se cobra o se registra como merma. Para definir manualmente el tipo de cobro, activa una razón personalizada con el botón "+ Razón personalizada". No se permiten contradicciones entre opciones de cobro y merma.
          </span>
        </div>

        <div
          role="alert"
          data-testid="admin-void-warning"
          className={`rounded-control border px-4 py-3 font-bold text-center text-base ${
            chargeCustomer
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-blue-50 border-blue-300 text-blue-900'
          }`}
        >
          {chargeCustomer ? (
            <>
              <span>Se cobrará la comanda mermada al cliente</span>
              <span className="sr-only">Se cobrará la comanda mermada</span>
            </>
          ) : (
            <>
              <span>Merma pura asumida por el restaurante (sin cobro al cliente)</span>
              <span className="sr-only">Merma pura sin cobro</span>
            </>
          )}
        </div>

        {/* Quick Reasons Selection */}
        <section aria-label="Motivos administrativos rápidos" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-body">
              Motivo administrativo:
            </span>
            <span className="text-xs text-muted">
              {chargeCustomer ? '(Opciones con cobro)' : '(Opciones de merma pura)'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ADMIN_QUICK_REASONS.map((item) => {
              const isSelected = selectedReasons.includes(item.label);
              const isContradictory = isContradictoryReason(item);
              return (
                <button
                  key={item.label}
                  type="button"
                  data-testid={`admin-void-reason-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-pressed={isSelected}
                  disabled={!isOperable || isSubmitting || isContradictory}
                  title={isContradictory ? 'Incompatible con la selección actual' : undefined}
                  {...pointerAction(() => toggleReason(item))}
                  style={{ minHeight: 48 }}
                  className={`min-h-[48px] px-3 py-2 rounded-control text-left border transition-all text-sm font-semibold flex flex-col justify-center cursor-pointer ${getReasonButtonClass(
                    isSelected,
                    isContradictory,
                  )}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{item.label}</span>
                    {isContradictory && (
                      <span className="text-[10px] uppercase font-normal text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                        Incompatible
                      </span>
                    )}
                  </div>
                  <span className={`text-xs ${isSelected ? 'text-white/80' : 'text-muted'}`}>
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Custom reason & virtual keyboard */}
        <section aria-label="Razón personalizada" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider text-body">
              Razón personalizada:
            </span>
            <button
              type="button"
              data-testid="admin-void-toggle-custom-reason"
              disabled={!isOperable || isSubmitting}
              {...pointerAction(() => {
                setCustomReasonActive((prev) => {
                  const nextVal = !prev;
                  if (!nextVal) {
                    setCustomReason('');
                    setShowKeyboard(false);
                  }
                  return nextVal;
                });
              })}
              className="text-xs font-bold px-2 py-1 rounded border border-border text-fmat-primary hover:bg-gray-50 cursor-pointer disabled:opacity-40"
            >
              {customReasonActive ? 'Quitar razón personalizada' : '+ Razón personalizada'}
            </button>
          </div>
          {customReasonActive && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="admin-void-custom-reason-input" className="text-xs text-muted">
                  Describe el motivo de anulación:
                </label>
                <button
                  type="button"
                  data-testid="admin-void-toggle-keyboard"
                  disabled={!isOperable || isSubmitting}
                  {...pointerAction(() => setShowKeyboard((prev) => !prev))}
                  className="text-xs font-bold text-fmat-primary hover:underline px-2 py-1 cursor-pointer"
                >
                  {showKeyboard ? 'Ocultar teclado' : 'Teclado en pantalla'}
                </button>
              </div>
              <input
                id="admin-void-custom-reason-input"
                type="text"
                value={customReason}
                disabled={!isOperable || isSubmitting}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Observaciones o motivo específico..."
                data-testid="admin-void-custom-reason-input"
                className="w-full min-h-[48px] px-4 py-2 rounded-md bg-surface border border-border text-ink placeholder:text-muted text-base font-medium focus:outline-none focus:ring-2 focus:ring-fmat-primary disabled:opacity-40"
              />
              {showKeyboard && (
                <VirtualKeyboard
                  value={customReason}
                  onChange={setCustomReason}
                  disabled={!isOperable || isSubmitting}
                />
              )}
            </div>
          )}
        </section>

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
            className="min-h-[64px] min-w-[64px] px-6 py-3 rounded-control bg-red-600 hover:bg-red-700 text-white font-bold text-lg border-0 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
          >
            Confirmar
          </button>
        </footer>
      </div>
    </dialog>
  );
}

export default AdminVoidDialog;
