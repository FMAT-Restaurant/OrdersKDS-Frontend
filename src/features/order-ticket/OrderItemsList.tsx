/**
 * @file Editable and read-only dish item list components for OrderTicketWidget.
 * @satisfies RF-14, RF-17, RF-22, RF-23
 */

import type { OrderItem } from '../../shared/api/schemas.ts';
import { ItemStatus } from '../../shared/types/order.ts';
import type { EditableOrderItem } from './draftItemsHelper.ts';
import { ITEM_STATUS_LABELS } from './orderTicketUtils.ts';

/** Props for EditableItemRow. */
export interface EditableItemRowProps {
  readonly draft: EditableOrderItem;
  readonly index: number;
  readonly isMutating: boolean;
  readonly canRemove: boolean;
  readonly onUpdate: (index: number, update: Partial<EditableOrderItem>) => void;
  readonly onRemove: (index: number) => void;
}

/** Editable line item row with quantity stepper, modifiers, notes, and removal action. */
export function EditableItemRow({
  draft,
  index,
  isMutating,
  canRemove,
  onUpdate,
  onRemove,
}: Readonly<EditableItemRowProps>) {
  const numericQuantity =
    typeof draft.quantity === 'number'
      ? draft.quantity
      : Number.parseInt(String(draft.quantity), 10) || 0;

  return (
    <li className="order-ticket__item" key={draft.id ?? draft.itemId ?? `${draft.name}-${index}`}>
      <div className="order-ticket__item-editor">
        <strong>{draft.name}</strong>
        <label htmlFor={`item-qty-${index}`}>
          Cantidad de {draft.name}
        </label>
        <div className="order-ticket__stepper">
          <button
            type="button"
            className="order-ticket__stepper-button"
            aria-label={`Disminuir cantidad de ${draft.name}`}
            disabled={numericQuantity <= 1 || isMutating}
            onClick={() => {
              if (numericQuantity > 1) {
                onUpdate(index, { quantity: numericQuantity - 1 });
              }
            }}
          >
            −
          </button>
          <input
            id={`item-qty-${index}`}
            type="number"
            min="1"
            step="1"
            className="order-ticket__stepper-input"
            value={draft.quantity}
            onChange={(event) => {
              const val = event.target.value;
              if (val === '') {
                onUpdate(index, { quantity: '' });
              } else {
                const parsed = Number.parseInt(val, 10);
                onUpdate(index, {
                  quantity: Number.isNaN(parsed) ? '' : parsed,
                });
              }
            }}
          />
          <button
            type="button"
            className="order-ticket__stepper-button"
            aria-label={`Aumentar cantidad de ${draft.name}`}
            disabled={isMutating}
            onClick={() => onUpdate(index, { quantity: numericQuantity + 1 })}
          >
            +
          </button>
        </div>
        <label>
          <span>Modificadores de {draft.name}</span>
          <input
            type="text"
            value={draft.modifiers.join(', ')}
            onChange={(event) =>
              onUpdate(index, {
                modifiers: event.target.value
                  .split(',')
                  .map((modifier) => modifier.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          <span>Notas de {draft.name}</span>
          <textarea
            value={draft.notes}
            onChange={(event) => onUpdate(index, { notes: event.target.value })}
          />
        </label>
        {canRemove && (
          <button
            type="button"
            className="order-ticket__button-secondary order-ticket__item-remove"
            onClick={() => onRemove(index)}
          >
            Quitar platillo
          </button>
        )}
      </div>
    </li>
  );
}

/** Props for ReadOnlyItemRow. */
export interface ReadOnlyItemRowProps {
  readonly item: OrderItem;
  readonly isMutating: boolean;
  readonly canRedo: boolean;
  readonly onRedoItem: (item: OrderItem) => void;
}

/** Read-only dish row showing status badge and redo trigger when delivered. */
export function ReadOnlyItemRow({
  item,
  isMutating,
  canRedo,
  onRedoItem,
}: Readonly<ReadOnlyItemRowProps>) {
  const key = item.id ?? item.itemId ?? item.name;

  return (
    <li className="order-ticket__item" key={key}>
      <div className="order-ticket__item-title">
        <strong>
          {item.quantity} × {item.name}
        </strong>
        <span>{ITEM_STATUS_LABELS[item.status]}</span>
      </div>
      {item.modifiers && item.modifiers.length > 0 && (
        <p>Modificadores: {item.modifiers.join(', ')}</p>
      )}
      {item.notes && <p>Nota: {item.notes}</p>}
      {canRedo && item.status === ItemStatus.DELIVERED && (
        <button
          type="button"
          className="order-ticket__button-secondary"
          aria-label={`Rehacer ${item.name}`}
          disabled={isMutating}
          onClick={() => onRedoItem(item)}
        >
          Rehacer
        </button>
      )}
    </li>
  );
}

/** Props for OrderItemsList. */
export interface OrderItemsListProps {
  readonly items: readonly OrderItem[];
  readonly isEditing: boolean;
  readonly isMutating: boolean;
  readonly canRedo: boolean;
  readonly draftItems: readonly EditableOrderItem[];
  readonly emptyMessage?: string;
  readonly canRemoveItem?: boolean;
  readonly onUpdateDraftItem: (index: number, update: Partial<EditableOrderItem>) => void;
  readonly onRemoveDraftItem: (index: number) => void;
  readonly onRedoItem: (item: OrderItem) => void;
  readonly onOpenAddDish: () => void;
}

/** Dish collection view switching between draft editor mode and read-only status mode. */
export function OrderItemsList({
  items,
  isEditing,
  isMutating,
  canRedo,
  draftItems,
  emptyMessage = 'Esta comanda todavía no tiene platillos.',
  canRemoveItem = false,
  onUpdateDraftItem,
  onRemoveDraftItem,
  onRedoItem,
  onOpenAddDish,
}: Readonly<OrderItemsListProps>) {
  if (isEditing) {
    const allowRemove = canRemoveItem || draftItems.length > 1;
    return (
      <div className="order-ticket__items">
        <h3>Platillos</h3>
        {draftItems.length === 0 ? (
          <p>{emptyMessage}</p>
        ) : (
          <ul>
            {draftItems.map((draft, index) => (
              <EditableItemRow
                key={draft.id ?? draft.itemId ?? `${draft.name}-${index}`}
                draft={draft}
                index={index}
                isMutating={isMutating}
                canRemove={allowRemove}
                onUpdate={onUpdateDraftItem}
                onRemove={onRemoveDraftItem}
              />
            ))}
          </ul>
        )}
        <div className="order-ticket__add-item-container">
          <button
            type="button"
            className="order-ticket__add-item-btn"
            data-testid="order-ticket-add-dish-btn"
            disabled={isMutating}
            onClick={onOpenAddDish}
          >
            + Agregar platillo
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="order-ticket__items">
        <h3>Platillos</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="order-ticket__items">
      <h3>Platillos</h3>
      <ul>
        {items.map((item) => (
          <ReadOnlyItemRow
            key={item.id ?? item.itemId ?? item.name}
            item={item}
            isMutating={isMutating}
            canRedo={canRedo}
            onRedoItem={onRedoItem}
          />
        ))}
      </ul>
    </div>
  );
}
