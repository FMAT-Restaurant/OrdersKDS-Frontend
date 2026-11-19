/**
 * @file Confirmation dialog for manual shift open, close, and rollover actions.
 * @satisfies RF-12, RF-15, RNF-03
 */

import { useState } from 'react';

export type ShiftControlMode = 'close' | 'open' | 'rollover';

export interface ShiftControlDialogProps {
  readonly mode: ShiftControlMode;
  readonly currentShiftNumber?: number | null;
  readonly nextShiftNumber: number;
  readonly isSubmitting: boolean;
  readonly onConfirm: (notes: string) => void;
  readonly onCancel: () => void;
}

const DIALOG_COPY: Record<
  ShiftControlMode,
  { readonly title: string; readonly confirmLabel: string; readonly buttonTone: string }
> = {
  close: {
    title: 'Cerrar turno actual',
    confirmLabel: 'Confirmar cierre',
    buttonTone: 'bg-red-700 hover:bg-red-800 text-white',
  },
  open: {
    title: 'Abrir nuevo turno',
    confirmLabel: 'Abrir turno',
    buttonTone: 'bg-fmat-primary hover:opacity-95 text-white',
  },
  rollover: {
    title: 'Cerrar turno e iniciar siguiente',
    confirmLabel: 'Cerrar e iniciar turno',
    buttonTone: 'bg-fmat-primary hover:opacity-95 text-white',
  },
};

function buildDialogDescription(
  mode: ShiftControlMode,
  currentShiftNumber: number | null | undefined,
  nextShiftNumber: number,
): string {
  if (mode === 'close') {
    return `Al cerrar el Turno #${currentShiftNumber ?? 1}, no se podrán crear nuevas comandas hasta que Master Chef o Admin abra el Turno #${nextShiftNumber}.`;
  }
  if (mode === 'rollover') {
    return `Se cerrará el Turno #${currentShiftNumber ?? 1} y se abrirá el Turno #${nextShiftNumber}. El folio de comandas se reiniciará a #001.`;
  }
  return `Se abrirá el Turno #${nextShiftNumber}. El folio de las próximas comandas iniciará nuevamente desde #001.`;
}

/**
 * Modal confirming shift transition for Master Chef / Admin with optional notes.
 */
export function ShiftControlDialog({
  mode,
  currentShiftNumber,
  nextShiftNumber,
  isSubmitting,
  onConfirm,
  onCancel,
}: Readonly<ShiftControlDialogProps>) {
  const [notes, setNotes] = useState('');
  const copy = DIALOG_COPY[mode];
  const description = buildDialogDescription(mode, currentShiftNumber, nextShiftNumber);

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="shift-control-dialog-title"
      data-testid="shift-control-dialog"
      className="orders-kds-root fixed inset-0 z-50 m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 border-none"
    >
      <div className="w-full max-w-md rounded-card bg-surface text-ink border border-border shadow-2xl p-6 space-y-4">
        <h2 id="shift-control-dialog-title" className="text-lg font-extrabold">
          {copy.title}
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed">{description}</p>

        <div className="space-y-1.5">
          <label htmlFor="shift-dialog-notes" className="block text-xs font-bold uppercase text-ink-muted">
            Notas del turno (opcional)
          </label>
          <textarea
            id="shift-dialog-notes"
            data-testid="shift-dialog-notes-input"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ej. Cierre matutino / Inicio turno vespertino"
            className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-fmat-primary"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            data-testid="shift-dialog-cancel-btn"
            disabled={isSubmitting}
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-control border border-border bg-surface text-ink font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="shift-dialog-confirm-btn"
            disabled={isSubmitting}
            onClick={() => onConfirm(notes)}
            className={`min-h-[44px] px-4 rounded-control font-bold text-sm transition-opacity disabled:opacity-50 ${copy.buttonTone}`}
          >
            {isSubmitting ? 'Procesando…' : copy.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
