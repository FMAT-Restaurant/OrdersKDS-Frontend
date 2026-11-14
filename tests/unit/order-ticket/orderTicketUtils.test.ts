/**
 * @file Unit tests for OrderTicketWidget helper utilities, parsing, and transformation logic.
 */

import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/shared/api/client.ts';
import { ErrorCode } from '../../../src/shared/api/errorCodes.ts';
import type { Order, OrderItem } from '../../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../../src/shared/types/order.ts';
import {
  applyRealtimeStatusChange,
  computeOrderActionPermissions,
  createEditableOrderItem,
  formatIngredientName,
  formatSessionDisplay,
  getDisplayError,
  getOrderAlert,
  getTableOrTakeawayLabel,
  getValidUnitPrice,
  hasInvalidDraftItemQuantity,
  mapDraftItemToApiInput,
  parseRejectionDetails,
  parseTableNumber,
  resolveDishName,
  resolveEffectiveUserId,
  updateKdsQueueWithRedoItem,
} from '../../../src/features/order-ticket/orderTicketUtils.ts';
import { executeCreateOrderSequence } from '../../../src/features/order-ticket/useOrderTicketActions.ts';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    publicId: 'ord-1',
    orderNumber: 101,
    status: OrderStatus.CREATED,
    version: 1,
    totalAmount: 100,
    isTakeaway: false,
    tableNumber: 4,
    items: [
      {
        id: 'item-1',
        dishId: 'dish-1',
        name: 'Tacos al Pastor',
        quantity: 2,
        unitPrice: 50,
        status: ItemStatus.PENDING,
        modifiers: [],
      },
    ],
    ...overrides,
  };
}

describe('orderTicketUtils', () => {
  it('translates ApiError codes and unknown errors safely', () => {
    expect(getDisplayError(new ApiError(404, ErrorCode.ORDER_NOT_FOUND, 'Not found'))).toContain(
      'comanda',
    );
    expect(getDisplayError(new Error('unexpected'))).toBeTruthy();
  });

  it('formats ingredient names and dining session displays cleanly', () => {
    expect(formatIngredientName('  pan_brioche-especial  ')).toBe('pan brioche especial');
    expect(formatSessionDisplay('12345678-1234-1234-1234-12345678abcd')).toBe('#ABCD');
    expect(formatSessionDisplay('ses-42')).toBe('#42');
    expect(formatSessionDisplay('session-99')).toBe('#99');
  });

  it('parses rejection details across primary and fallback aliases', () => {
    expect(parseRejectionDetails(null)).toBeNull();
    expect(parseRejectionDetails({})).toBeNull();

    const parsed = parseRejectionDetails({
      source: 'INVENTORY',
      reason: '  Stock insuficiente  ',
      faltantes: ['queso_oaxaca', 123, { bad: true }],
      items: [
        'invalid-entry',
        {
          plateId: 'src-1',
          itemId: 'item-a',
          itemName: 'Quesadilla',
          availableStock: 1,
          quantity: 4,
          reason: 'low stock',
        },
      ],
      reservedItems: [{ dishId: 'src-2', quantity: 2 }],
    });

    expect(parsed).toEqual({
      source: 'INVENTORY',
      reason: 'Stock insuficiente',
      missingIngredients: ['queso_oaxaca', '123', ''],
      rejectedItems: [
        {},
        {
          offerId: 'item-a',
          dishId: 'src-1',
          itemId: 'item-a',
          name: 'Quesadilla',
          itemName: 'Quesadilla',
          reason: 'low stock',
          requestedQuantity: 4,
          availableQuantity: 1,
          availableStock: 1,
        },
      ],
      reservedItems: [{ dishId: 'src-2', quantity: 2 }],
    });
  });

  it('resolves dish names from order items with sensible fallbacks', () => {
    const items: OrderItem[] = [
      {
        id: 'id-1',
        itemId: 'legacy-1',
        dishId: 'dish-1',
        name: 'Pozole Rojo',
        quantity: 1,
        unitPrice: 90,
        status: ItemStatus.PENDING,
        modifiers: [],
      },
    ];

    expect(resolveDishName(undefined, items)).toBe('Platillo');
    expect(resolveDishName('dish-1', items)).toBe('Pozole Rojo');
    expect(resolveDishName('legacy-1', items)).toBe('Pozole Rojo');
    expect(resolveDishName('unknown-99', items)).toBe('unknown-99');
  });

  it('builds localized alert messages, table labels, and table numbers', () => {
    expect(getOrderAlert(OrderStatus.REJECTED, 'comanda')).toContain('Modifica la comanda');
    expect(getOrderAlert(OrderStatus.EXPIRED, 'orden')).toContain('La orden expiró');
    expect(getOrderAlert(OrderStatus.CANCELLED)).toContain('orden ha sido cancelada');
    expect(getOrderAlert(OrderStatus.DELIVERED)).toContain('recoger');
    expect(getOrderAlert(OrderStatus.PAID)).toBe('');

    expect(getTableOrTakeawayLabel(makeOrder({ isTakeaway: true }))).toBe('Para llevar');
    expect(getTableOrTakeawayLabel(makeOrder({ tableNumber: 7 }))).toBe('Mesa 7');
    expect(getTableOrTakeawayLabel(makeOrder({ tableNumber: undefined }))).toBe('Mesa sin asignar');

    expect(parseTableNumber(true, 5)).toBeUndefined();
    expect(parseTableNumber(false, 8)).toBe(8);
    expect(parseTableNumber(false, '12')).toBe(12);
    expect(parseTableNumber(false, 'abc')).toBe(1);
  });

  it('validates unitPrice and maps draft items cleanly', () => {
    expect(getValidUnitPrice(25.5)).toBe(25.5);
    expect(getValidUnitPrice(0)).toBe(0);
    expect(getValidUnitPrice(-5)).toBeUndefined();
    expect(getValidUnitPrice(Number.NaN)).toBeUndefined();

    const editable = createEditableOrderItem({
      sourceId: 'src-enchiladas',
      offerId: 'offer-promo',
      unitPrice: 120,
      name: 'Enchiladas',
      quantity: 2,
      modifiers: ['Sin crema'],
      notes: 'Extra salsa',
    });
    expect(editable).toEqual({
      dishId: 'src-enchiladas',
      sourceId: 'src-enchiladas',
      offerId: 'offer-promo',
      itemId: undefined,
      unitPrice: 120,
      name: 'Enchiladas',
      quantity: 2,
      modifiers: ['Sin crema'],
      notes: 'Extra salsa',
    });

    const apiInput = mapDraftItemToApiInput({
      ...editable,
      quantity: '',
    });
    expect(apiInput).toEqual({
      id: undefined,
      itemId: undefined,
      dishId: 'src-enchiladas',
      sourceId: 'src-enchiladas',
      offerId: 'offer-promo',
      unitPrice: 120,
      name: 'Enchiladas',
      quantity: 1,
      modifiers: ['Sin crema'],
      notes: 'Extra salsa',
    });
  });

  it('executes create + attach items (+ optional confirm) sequence and fails on missing ID', async () => {
    const orderWithoutId = makeOrder({ id: undefined, orderId: undefined, publicId: undefined });
    const failingApi = {
      post: vi.fn().mockResolvedValue(orderWithoutId),
      patch: vi.fn(),
    } as unknown as Parameters<typeof executeCreateOrderSequence>[0]['api'];

    await expect(
      executeCreateOrderSequence({
        api: failingApi,
        tableNumber: 3,
        isTakeaway: false,
        diningSessionId: 'ses-1',
        items: [],
        confirm: false,
      }),
    ).rejects.toThrow('identificador');

    const created = makeOrder({ id: 'ord-created', status: OrderStatus.CREATED });
    const confirmed = makeOrder({ id: 'ord-created', status: OrderStatus.RESERVED });
    const api = {
      post: vi.fn().mockResolvedValueOnce(created).mockResolvedValueOnce(confirmed),
      patch: vi.fn().mockResolvedValueOnce(created),
    } as unknown as Parameters<typeof executeCreateOrderSequence>[0]['api'];

    const result = await executeCreateOrderSequence({
      api,
      tableNumber: undefined,
      isTakeaway: true,
      diningSessionId: 'ses-1',
      items: [createEditableOrderItem({ dishId: 'd-1', name: 'Sope' })],
      confirm: true,
    });

    expect(result.orderId).toBe('ord-created');
    expect(result.order.status).toBe(OrderStatus.RESERVED);
  });

  it('patches cached KDS queue when an item redo occurs', () => {
    expect(updateKdsQueueWithRedoItem(undefined, makeOrder(), 'item-1', 'ord-1')).toBeUndefined();

    const targetItem: OrderItem = {
      id: 'item-1',
      dishId: 'dish-1',
      name: 'Tacos al Pastor',
      quantity: 2,
      unitPrice: 50,
      status: ItemStatus.PENDING,
      modifiers: [],
      notes: 'rehacer',
    };
    const otherItem = {
      id: 'item-2',
      dishId: 'dish-2',
      name: 'Agua de Horchata',
      quantity: 1,
      unitPrice: 30,
      status: ItemStatus.DELIVERED,
      modifiers: [],
    };
    const updatedOrder = makeOrder({
      status: OrderStatus.IN_PREPARATION,
      items: [targetItem, otherItem],
    });
    const queue: Order[] = [
      makeOrder({
        status: OrderStatus.DELIVERED,
        items: [
          { ...targetItem, status: ItemStatus.DELIVERED },
          otherItem,
        ],
      }),
      makeOrder({ id: 'ord-other', publicId: 'ord-other' }),
    ];

    const patched = updateKdsQueueWithRedoItem(queue, updatedOrder, 'item-1', 'ord-1');
    expect(patched?.[0]?.status).toBe(OrderStatus.IN_PREPARATION);
    expect(patched?.[0]?.items[0]?.status).toBe(ItemStatus.PENDING);
    expect(patched?.[0]?.items[1]?.status).toBe(ItemStatus.DELIVERED);
    expect(patched?.[1]?.id).toBe('ord-other');
  });

  it('resolves user id, validates draft item quantities, and derives action permissions', () => {
    expect(resolveEffectiveUserId('u-1', 'w-1', { id: 's-1', sub: 'sub-1' })).toBe('u-1');
    expect(resolveEffectiveUserId(undefined, 'w-1', { id: 's-1' })).toBe('w-1');
    expect(resolveEffectiveUserId(undefined, undefined, { sub: 'sub-1' })).toBe('sub-1');
    expect(resolveEffectiveUserId(undefined, undefined, null)).toBe('waiter-default');

    expect(
      hasInvalidDraftItemQuantity({
        name: 'Taco',
        quantity: 2,
        modifiers: [],
        notes: '',
      }),
    ).toBe(false);
    expect(
      hasInvalidDraftItemQuantity({
        name: 'Taco',
        quantity: 0,
        modifiers: [],
        notes: '',
      }),
    ).toBe(true);

    expect(computeOrderActionPermissions(makeOrder({ status: OrderStatus.CREATED }))).toEqual({
      isRejected: false,
      canCancel: true,
      canEdit: true,
      canConfirm: true,
      canResetToNew: false,
      showTerminalResetButton: false,
    });
    expect(
      computeOrderActionPermissions(makeOrder({ status: OrderStatus.EXPIRED })),
    ).toMatchObject({
      canConfirm: true,
      canResetToNew: true,
      showTerminalResetButton: true,
    });
  });

  it('applies monotonic WebSocket status changes cleanly', () => {
    const base = makeOrder({ version: 2, status: OrderStatus.CREATED, awaitingStockConfirmation: true });
    expect(applyRealtimeStatusChange(undefined, { type: 'order.status_changed', orderId: 'ord-1', status: OrderStatus.RESERVED, version: 3, timestamp: new Date().toISOString() })).toBeUndefined();
    expect(
      applyRealtimeStatusChange(base, {
        type: 'order.status_changed',
        orderId: 'ord-1',
        status: OrderStatus.RESERVED,
        version: 2,
        timestamp: new Date().toISOString(),
      }),
    ).toBe(base);

    const updated = applyRealtimeStatusChange(base, {
      type: 'order.status_changed',
      orderId: 'ord-1',
      status: OrderStatus.REJECTED,
      version: 3,
      timestamp: new Date().toISOString(),
      rejectionDetails: { reason: 'Sin stock' },
    });
    expect(updated?.status).toBe(OrderStatus.REJECTED);
    expect(updated?.awaitingStockConfirmation).toBe(false);
    expect(updated?.rejectionDetails).toEqual({ reason: 'Sin stock' });
  });
});
