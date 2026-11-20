/**
 * @file Header widget showing shift folio status and manual open/close controls for Master Chef & Admin.
 * @satisfies RF-12, RF-15, RNF-03
 */

import { useState } from 'react';
import type { ApiClient } from '../../shared/api/client.ts';
import { canManageShifts, type ShellUser, type UserRole } from '../../shared/types/auth.ts';
import { ShiftControlDialog, type ShiftControlMode } from './dialogs/ShiftControlDialog.tsx';
import { useShiftControl, type ShiftFeedbackMessage } from './useShiftControl.ts';

export interface ShiftControlBarProps {
  readonly client: ApiClient | null;
  readonly currentUser?: ShellUser | null;
  readonly userRole?: UserRole;
  readonly onFeedback?: (msg: ShiftFeedbackMessage) => void;
  readonly onError?: (err: string) => void;
}

/**
 * Displays active shift status badge and renders manual close/open actions strictly for Master Chef / Admin.
 */
export function ShiftControlBar({
  client,
  currentUser,
  userRole,
  onFeedback,
  onError,
}: Readonly<ShiftControlBarProps>) {
  const [dialogMode, setDialogMode] = useState<ShiftControlMode | null>(null);
  const canManage = canManageShifts(currentUser, userRole);

  const {
    status,
    isPendingAction,
    openShift,
    closeShift,
    rolloverShift,
  } = useShiftControl({
    client,
    enabled: Boolean(client),
    onFeedback,
    onError,
  });

  if (!status) {
    return null;
  }

  const handleConfirm = async (notes: string) => {
    try {
      if (dialogMode === 'close') {
        await closeShift(notes);
      } else if (dialogMode === 'open') {
        await openShift(notes);
      } else if (dialogMode === 'rollover') {
        await rolloverShift(notes);
      }
      setDialogMode(null);
    } catch {
      // Error toast is already surfaced by useShiftControl.
    }
  };

  const activeShift = status.currentShift;
  const badgeText =
    status.isOpen && activeShift
      ? `Turno #${activeShift.shiftNumber} · Folios: ${activeShift.lastOrderFolio}`
      : `Turno cerrado · Próx: #${status.nextShiftNumber}`;

  const badgeClass = status.isOpen
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : 'bg-amber-50 text-amber-900 border-amber-300';

  return (
    <div className="flex items-center gap-2 shrink-0" data-testid="shift-control-bar">
      <span
        data-testid="shift-status-badge"
        className={`inline-flex items-center px-2.5 py-1 rounded-control border text-xs font-bold whitespace-nowrap ${badgeClass}`}
      >
        {badgeText}
      </span>

      {canManage && status.isOpen && (
        <>
          <button
            type="button"
            data-testid="shift-rollover-btn"
            disabled={isPendingAction}
            onClick={() => setDialogMode('rollover')}
            className="min-h-[40px] px-2.5 py-1 rounded-control border border-border bg-surface text-ink text-xs font-bold hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
          >
            Nuevo turno
          </button>
          <button
            type="button"
            data-testid="shift-close-btn"
            disabled={isPendingAction}
            onClick={() => setDialogMode('close')}
            className="min-h-[40px] px-2.5 py-1 rounded-control border border-red-300 bg-red-50 text-red-800 text-xs font-bold hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
          >
            Cerrar turno
          </button>
        </>
      )}

      {canManage && !status.isOpen && (
        <button
          type="button"
          data-testid="shift-open-btn"
          disabled={isPendingAction}
          onClick={() => setDialogMode('open')}
          className="min-h-[40px] px-3 py-1 rounded-control bg-fmat-primary text-white text-xs font-bold hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
        >
          Abrir turno
        </button>
      )}

      {dialogMode && (
        <ShiftControlDialog
          mode={dialogMode}
          currentShiftNumber={activeShift?.shiftNumber}
          nextShiftNumber={status.nextShiftNumber}
          isSubmitting={isPendingAction}
          onConfirm={(notes) => {
            void handleConfirm(notes);
          }}
          onCancel={() => {
            if (!isPendingAction) setDialogMode(null);
          }}
        />
      )}
    </div>
  );
}
