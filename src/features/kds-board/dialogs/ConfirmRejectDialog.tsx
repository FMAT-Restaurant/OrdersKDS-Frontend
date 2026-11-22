import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Order, OrderItem } from '../../../shared/api/schemas.ts';
import {
  formatOrderTableLabel,
  getItemKey,
  getOrderKey,
  getOrderNumberDisplay,
} from '../orderNumberDisplay.ts';

export interface ConfirmRejectItemSelection {
  readonly itemId: string;
  readonly availableQuantity: number;
}

export interface ConfirmRejectOptions {
  readonly availableQuantity?: number;
  readonly items?: readonly ConfirmRejectItemSelection[];
}

export interface ConfirmRejectDialogProps {
  readonly order: Order;
  readonly item?: OrderItem | null;
  readonly isOpen: boolean;
  readonly isSubmitting?: boolean;
  readonly onConfirm: (options?: ConfirmRejectOptions) => void;
  readonly onCancel: () => void;
}

function PartialAvailabilitySelector({
  targetItem,
  requestedQuantity,
  availableQuantity,
  maxAvailable,
  isSubmitting,
  onChange,
  testIdSuffix,
}: Readonly<{
  targetItem: OrderItem;
  requestedQuantity: number;
  availableQuantity: number;
  maxAvailable: number;
  isSubmitting: boolean;
  onChange: (nextQty: number) => void;
  testIdSuffix?: string;
}>) {
  const suffix = testIdSuffix ? `-${testIdSuffix}` : '';
  const inputId = `confirm-reject-available-input${suffix}`;
  return (
    <div
      className="p-3 bg-amber-500/15 rounded-control border border-amber-500/40 text-ink space-y-2"
      data-testid={`confirm-reject-partial-availability${suffix}`}
    >
      <p className="font-semibold text-xs sm:text-sm">
        Disponibilidad física en cocina para «{targetItem.name}» (Solicitados: {requestedQuantity})
      </p>
      {maxAvailable > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={inputId} className="text-xs font-medium">
            Sí se pueden preparar (0 a {maxAvailable}):
          </label>
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              data-testid={`confirm-reject-available-dec${suffix}`}
              aria-label={`Disminuir cantidad disponible de ${targetItem.name}`}
              disabled={isSubmitting || availableQuantity <= 0}
              onClick={() => onChange(Math.max(0, availableQuantity - 1))}
              className="w-9 h-9 rounded border border-amber-500/60 bg-surface font-bold text-base text-ink hover:bg-canvas disabled:opacity-50 cursor-pointer"
            >
              −
            </button>
            <input
              id={inputId}
              data-testid={`confirm-reject-available-input${suffix}`}
              aria-label={`Cantidad disponible en cocina de ${targetItem.name}`}
              type="number"
              min={0}
              max={maxAvailable}
              disabled={isSubmitting}
              value={availableQuantity}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                const clamped = Number.isNaN(parsed)
                  ? 0
                  : Math.max(0, Math.min(maxAvailable, parsed));
                onChange(clamped);
              }}
              className="w-16 h-9 text-center font-bold border border-amber-500/60 rounded bg-canvas text-ink"
            />
            <button
              type="button"
              data-testid={`confirm-reject-available-inc${suffix}`}
              aria-label={`Aumentar cantidad disponible de ${targetItem.name}`}
              disabled={isSubmitting || availableQuantity >= maxAvailable}
              onClick={() => onChange(Math.min(maxAvailable, availableQuantity + 1))}
              className="w-9 h-9 rounded border border-amber-500/60 bg-surface font-bold text-base text-ink hover:bg-canvas disabled:opacity-50 cursor-pointer"
            >
              +
            </button>
          </div>
          <p className="w-full text-xs text-body">
            El mesero verá: Solicitados: {requestedQuantity}, Disponibles: {availableQuantity}.
          </p>
        </div>
      ) : (
        <p className="text-xs text-body">
          Se notificará al mesero: Solicitados: {requestedQuantity}, Disponibles: 0.
        </p>
      )}
    </div>
  );
}

function MultiItemRejectList({
  items,
  selectedMap,
  isSubmitting,
  onToggleItem,
  onChangeQuantity,
}: Readonly<{
  items: readonly OrderItem[];
  selectedMap: Record<string, number>;
  isSubmitting: boolean;
  onToggleItem: (itemId: string) => void;
  onChangeQuantity: (itemId: string, nextQty: number) => void;
}>) {
  return (
    <div
      data-testid="confirm-reject-items-list"
      className="max-h-[40vh] overflow-y-auto space-y-2.5 pr-1"
    >
      <p className="text-xs font-semibold text-ink">
        Selecciona los platillos sin insumos e indica cuántas unidades sí pueden prepararse:
      </p>
      {items.map((candidate, index) => {
        const itemId = getItemKey(candidate, index);
        const isSelected = Object.hasOwn(selectedMap, itemId);
        const availableQuantity = selectedMap[itemId] ?? 0;
        const maxAvailable = Math.max(0, candidate.quantity - 1);
        return (
          <div
            key={itemId}
            className={`rounded-control border p-2.5 space-y-2 ${
              isSelected ? 'border-red-500/60 bg-red-500/10' : 'border-border bg-surface'
            }`}
          >
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid={`confirm-reject-item-toggle-${itemId}`}
                checked={isSelected}
                disabled={isSubmitting}
                onChange={() => onToggleItem(itemId)}
                className="w-5 h-5 accent-red-600 rounded cursor-pointer"
              />
              <span className="font-bold text-sm text-ink">
                {candidate.quantity}x {candidate.name}
              </span>
            </label>
            {isSelected && (
              <PartialAvailabilitySelector
                targetItem={candidate}
                requestedQuantity={candidate.quantity}
                availableQuantity={availableQuantity}
                maxAvailable={maxAvailable}
                isSubmitting={isSubmitting}
                onChange={(nextQty) => onChangeQuantity(itemId, nextQty)}
                testIdSuffix={itemId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildSelectedRejectEntries(
  eligibleItems: readonly OrderItem[],
  selectedMap: Record<string, number>,
): ConfirmRejectItemSelection[] {
  const entries: ConfirmRejectItemSelection[] = [];
  eligibleItems.forEach((candidate, index) => {
    const itemId = getItemKey(candidate, index);
    if (Object.hasOwn(selectedMap, itemId)) {
      entries.push({ itemId, availableQuantity: selectedMap[itemId] ?? 0 });
    }
  });
  return entries;
}

function resolveEligibleRejectItems(
  order: Order,
  item?: OrderItem | null,
): readonly OrderItem[] {
  if (item) return [item];
  const nonCancelled = order.items.filter((candidate) => candidate.status !== 'CANCELLED');
  return nonCancelled.length > 0 ? nonCancelled : order.items;
}

function toggleRejectSelection(
  activeMap: Record<string, number>,
  itemId: string,
): Record<string, number> {
  const nextMap = { ...activeMap };
  if (Object.hasOwn(nextMap, itemId)) {
    delete nextMap[itemId];
  } else {
    nextMap[itemId] = 0;
  }
  return nextMap;
}

function buildConfirmRejectPayload(
  isMultiItemMode: boolean,
  selectedEntries: readonly ConfirmRejectItemSelection[],
  singleAvailable: number,
): ConfirmRejectOptions | undefined {
  if (isMultiItemMode) {
    const firstQty = selectedEntries[0]?.availableQuantity ?? 0;
    return { availableQuantity: firstQty, items: selectedEntries };
  }
  return singleAvailable > 0 ? { availableQuantity: singleAvailable } : undefined;
}

function resolveRejectStateContext(
  order: Order,
  item: OrderItem | null | undefined,
  eligibleItems: readonly OrderItem[],
  isOpen: boolean,
) {
  const firstItem = eligibleItems[0] ?? null;
  const firstItemId = firstItem ? getItemKey(firstItem, 0) : '';
  const scope = item ? firstItemId : 'order';
  return {
    firstItem,
    firstItemId,
    targetKey: `${getOrderKey(order) || 'unknown'}:${scope}:${isOpen}`,
    fallbackMap: firstItemId ? { [firstItemId]: 0 } : ({} as Record<string, number>),
  };
}

function ConfirmRejectHeader({
  item,
  tableDisplay,
  orderNumberDisplay,
}: Readonly<{
  item?: OrderItem | null;
  tableDisplay: string;
  orderNumberDisplay: string;
}>) {
  const title = item
    ? '¿Rechazar platillo por falta de insumos?'
    : '¿Rechazar comanda por falta de insumos?';
  const tablePrefix = tableDisplay ? `${tableDisplay} · ` : '';
  const itemSuffix = item ? ` · ${item.name}` : '';
  return (
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
          {title}
        </h2>
        <p className="text-sm text-muted">
          {tablePrefix}Comanda #{orderNumberDisplay}
          {itemSuffix}
        </p>
      </div>
    </div>
  );
}

interface ConfirmRejectBodyProps {
  readonly item?: OrderItem | null;
  readonly isMultiItemMode: boolean;
  readonly eligibleItems: readonly OrderItem[];
  readonly activeMap: Record<string, number>;
  readonly selectedEntries: readonly ConfirmRejectItemSelection[];
  readonly singleTarget: OrderItem | null;
  readonly singleTargetId: string;
  readonly singleAvailable: number;
  readonly isSubmitting: boolean;
  readonly onToggleItem: (itemId: string) => void;
  readonly onChangeQuantity: (itemId: string, nextQty: number) => void;
}

function renderRejectAvailabilityContent({
  isMultiItemMode,
  eligibleItems,
  activeMap,
  selectedEntries,
  singleTarget,
  singleTargetId,
  singleAvailable,
  isSubmitting,
  onToggleItem,
  onChangeQuantity,
}: Omit<ConfirmRejectBodyProps, 'item'>): ReactNode {
  if (isMultiItemMode) {
    return (
      <>
        <MultiItemRejectList
          items={eligibleItems}
          selectedMap={activeMap}
          isSubmitting={isSubmitting}
          onToggleItem={onToggleItem}
          onChangeQuantity={onChangeQuantity}
        />
        {selectedEntries.length === 0 && (
          <p
            role="alert"
            className="rounded px-2 py-1 bg-red-50 border border-red-200 text-xs font-semibold text-red-800"
          >
            Selecciona al menos un platillo afectado.
          </p>
        )}
      </>
    );
  }
  if (!singleTarget) {
    return null;
  }
  return (
    <PartialAvailabilitySelector
      targetItem={singleTarget}
      requestedQuantity={singleTarget.quantity}
      availableQuantity={singleAvailable}
      maxAvailable={Math.max(0, singleTarget.quantity - 1)}
      isSubmitting={isSubmitting}
      onChange={(nextQty) => onChangeQuantity(singleTargetId, nextQty)}
    />
  );
}

function ConfirmRejectBody(props: Readonly<ConfirmRejectBodyProps>) {
  const { item } = props;
  const promptText = item
    ? `¿Estás seguro de que deseas rechazar "${item.name}" por falta de insumos físicos en cocina?`
    : '¿Estás seguro de que deseas rechazar esta orden?';
  const warningText = item
    ? 'El platillo se cancelará sin cobro al comensal y se actualizará su disponibilidad en el menú.'
    : 'Se informará al personal de piso y servicio para cancelar o ajustar la comanda con el cliente.';

  return (
    <div id="confirm-reject-dialog-desc" className="text-body text-sm space-y-2.5">
      <p>{promptText}</p>
      <div className="p-3 bg-red-50 rounded-control border border-red-200 text-red-900 text-xs sm:text-sm">
        <p className="font-semibold mb-1">
          Atención: Esta acción notificará la falta de insumos en cocina.
        </p>
        <p className="text-red-800">{warningText}</p>
      </div>
      {renderRejectAvailabilityContent(props)}
    </div>
  );
}

export function ConfirmRejectDialog({
  order,
  item,
  isOpen,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmRejectDialogProps>) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const eligibleItems = resolveEligibleRejectItems(order, item);
  const { firstItem, firstItemId, targetKey, fallbackMap } = resolveRejectStateContext(
    order,
    item,
    eligibleItems,
    isOpen,
  );
  const [selectionState, setSelectionState] = useState<{
    readonly targetKey: string;
    readonly selectedMap: Record<string, number>;
  }>({ targetKey: '', selectedMap: {} });

  const activeMap =
    selectionState.targetKey === targetKey ? selectionState.selectedMap : fallbackMap;

  useEffect(() => {
    if (isOpen) {
      cancelBtnRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMultiItemMode = !item && eligibleItems.length > 1;
  const selectedEntries = buildSelectedRejectEntries(eligibleItems, activeMap);
  const singleAvailable = activeMap[firstItemId] ?? 0;
  const hasValidSelection = !isMultiItemMode || selectedEntries.length > 0;
  const isSubmitDisabled = isSubmitting || !hasValidSelection;

  const displayId = getOrderKey(order) || 'unknown';
  const orderNumberDisplay = getOrderNumberDisplay(order.orderNumber, displayId);
  const tableDisplay = formatOrderTableLabel(order) ?? '';

  const handleToggleItem = (itemId: string) => {
    setSelectionState({
      targetKey,
      selectedMap: toggleRejectSelection(activeMap, itemId),
    });
  };

  const handleChangeQuantity = (itemId: string, nextQty: number) => {
    setSelectionState({
      targetKey,
      selectedMap: { ...activeMap, [itemId]: nextQty },
    });
  };

  const handleSubmit = () => {
    onConfirm(buildConfirmRejectPayload(isMultiItemMode, selectedEntries, singleAvailable));
  };

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
      className="orders-kds-root fixed inset-0 z-[60] m-0 p-4 w-full h-full max-w-none max-h-none flex items-center justify-center bg-black/60 backdrop-blur-xs border-none select-none overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-card bg-surface border border-border shadow-2xl p-6 flex flex-col gap-4 text-ink">
        <ConfirmRejectHeader
          item={item}
          tableDisplay={tableDisplay}
          orderNumberDisplay={orderNumberDisplay}
        />

        <ConfirmRejectBody
          item={item}
          isMultiItemMode={isMultiItemMode}
          eligibleItems={eligibleItems}
          activeMap={activeMap}
          selectedEntries={selectedEntries}
          singleTarget={firstItem}
          singleTargetId={firstItemId}
          singleAvailable={singleAvailable}
          isSubmitting={isSubmitting}
          onToggleItem={handleToggleItem}
          onChangeQuantity={handleChangeQuantity}
        />

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            ref={cancelBtnRef}
            type="button"
            data-testid="confirm-reject-cancel-btn"
            onClick={onCancel}
            disabled={isSubmitting}
            style={{ minHeight: 48 }}
            className="w-full sm:w-auto min-h-[48px] px-4 py-2.5 rounded-control font-bold text-sm bg-surface text-ink border border-border hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-fmat-primary cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="confirm-reject-submit-btn"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
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

