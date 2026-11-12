import { describe, expect, it } from 'vitest';
import {
  mergeDraftItem,
  toEditableItems,
  type EditableOrderItem,
} from '../../src/features/order-ticket/draftItemsHelper.ts';
import type { OrderItem } from '../../src/shared/api/schemas.ts';

describe('draftItemsHelper', () => {
  it('converts OrderItem array to EditableOrderItem array', () => {
    const rawItems: OrderItem[] = [
      {
        id: 'item-1',
        name: 'Hamburguesa',
        quantity: 2,
        unitPrice: 150.0,
        status: 'PENDING',
        modifiers: ['Extra tocino'],
        notes: 'Bien cocida',
      },
      {
        id: 'item-2',
        name: 'Refresco',
        quantity: 1,
        unitPrice: 50.0,
        status: 'READY',
      },
    ];

    const editable = toEditableItems(rawItems);
    expect(editable).toHaveLength(2);
    expect(editable[0]).toEqual({
      id: 'item-1',
      itemId: undefined,
      dishId: undefined,
      name: 'Hamburguesa',
      quantity: 2,
      modifiers: ['Extra tocino'],
      notes: 'Bien cocida',
    });
    expect(editable[1].modifiers).toEqual([]);
    expect(editable[1].notes).toBe('');
  });

  it('merges identical items by incrementing quantity', () => {
    const current: EditableOrderItem[] = [
      {
        dishId: 'dish-1',
        name: 'Hamburguesa Clásica',
        quantity: 2,
        modifiers: ['Queso'],
        notes: 'Sin cebolla',
      },
    ];

    const newItem: EditableOrderItem = {
      dishId: 'dish-1',
      name: 'Hamburguesa Clásica',
      quantity: 3,
      modifiers: ['Queso'],
      notes: 'Sin cebolla',
    };

    const result = mergeDraftItem(current, newItem);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });

  it('appends as a new item when modifiers or notes differ', () => {
    const current: EditableOrderItem[] = [
      {
        dishId: 'dish-1',
        name: 'Hamburguesa Clásica',
        quantity: 1,
        modifiers: ['Queso'],
        notes: '',
      },
    ];

    const newItem: EditableOrderItem = {
      dishId: 'dish-1',
      name: 'Hamburguesa Clásica',
      quantity: 1,
      modifiers: ['Queso', 'Tocino'],
      notes: 'Bien cocida',
    };

    const result = mergeDraftItem(current, newItem);
    expect(result).toHaveLength(2);
    expect(result[0].quantity).toBe(1);
    expect(result[1].quantity).toBe(1);
    expect(result[1].notes).toBe('Bien cocida');
  });

  it('merges by name when dishId is not set but name matches case-insensitively', () => {
    const current: EditableOrderItem[] = [
      {
        name: 'Papas Francesas',
        quantity: 1,
        modifiers: [],
        notes: '',
      },
    ];

    const newItem: EditableOrderItem = {
      name: '  papas francesas  ',
      quantity: 2,
      modifiers: [],
      notes: '',
    };

    const result = mergeDraftItem(current, newItem);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it('appends different dish as a new item', () => {
    const current: EditableOrderItem[] = [
      {
        name: 'Papas Francesas',
        quantity: 1,
        modifiers: [],
        notes: '',
      },
    ];

    const newItem: EditableOrderItem = {
      name: 'Refresco Cola',
      quantity: 2,
      modifiers: [],
      notes: 'Con hielo',
    };

    const result = mergeDraftItem(current, newItem);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('Refresco Cola');
  });
});

