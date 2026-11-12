import { describe, expect, it } from 'vitest';
import {
  mergeDraftItem,
  toEditableItems,
  type EditableOrderItem,
} from '../../../src/features/order-ticket/draftItemsHelper.ts';
import { ItemStatus } from '../../../src/shared/types/order.ts';
import type { OrderItem } from '../../../src/shared/api/schemas.ts';

describe('draftItemsHelper Edge Cases Suite', () => {
  it('handles string quantities and invalid string fallbacks when merging existing items', () => {
    const existing: EditableOrderItem[] = [
      {
        dishId: 'dish-1',
        name: 'Tacos al Pastor',
        quantity: '3',
        modifiers: ['Cebolla'],
        notes: 'Bien cocidos',
      },
      {
        dishId: 'dish-2',
        name: 'Horchata',
        quantity: 'not-a-number' as unknown as number,
        modifiers: [],
        notes: '',
      },
    ];

    // Merge into dish-1 with numeric quantity
    const updated1 = mergeDraftItem(existing, {
      dishId: 'dish-1',
      name: 'tacos al pastor ',
      quantity: 2,
      modifiers: ['Cebolla'],
      notes: 'bien cocidos',
    });
    expect(updated1[0].quantity).toBe(5);

    // Merge into dish-2 with string quantity '4'
    const updated2 = mergeDraftItem(existing, {
      dishId: 'dish-2',
      name: 'Horchata',
      quantity: '4',
      modifiers: [],
      notes: '',
    });
    // existing had invalid string -> fallback 1 + 4 = 5
    expect(updated2[1].quantity).toBe(5);

    // Merge into dish-2 with invalid string quantity
    const updated3 = mergeDraftItem(existing, {
      dishId: 'dish-2',
      name: 'Horchata',
      quantity: 'xyz' as unknown as number,
      modifiers: [],
      notes: '',
    });
    // 1 + fallback 1 = 2
    expect(updated3[1].quantity).toBe(2);
  });

  it('matches items by same dishId even if name whitespace/casing varies slightly', () => {
    const existing: EditableOrderItem[] = [
      {
        dishId: 'dish-uuid-99',
        name: 'Guacamole Especial',
        quantity: 1,
        modifiers: ['Totopos'],
        notes: 'Poco picante',
      },
    ];

    const merged = mergeDraftItem(existing, {
      dishId: 'dish-uuid-99',
      name: 'Guacamole Especial',
      quantity: 2,
      modifiers: ['Totopos'],
      notes: 'Poco picante',
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it('creates separate items when notes or modifiers do not match', () => {
    const existing: EditableOrderItem[] = [
      {
        dishId: 'dish-10',
        name: 'Enchiladas',
        quantity: 1,
        modifiers: ['Verdes'],
        notes: '',
      },
    ];

    // Different modifier
    const withDiffMod = mergeDraftItem(existing, {
      dishId: 'dish-10',
      name: 'Enchiladas',
      quantity: 1,
      modifiers: ['Rojas'],
      notes: '',
    });
    expect(withDiffMod).toHaveLength(2);

    // Different notes
    const withDiffNotes = mergeDraftItem(existing, {
      dishId: 'dish-10',
      name: 'Enchiladas',
      quantity: 1,
      modifiers: ['Verdes'],
      notes: 'Sin crema',
    });
    expect(withDiffNotes).toHaveLength(2);
  });

  it('converts OrderItem with null/undefined dishId, modifiers, and notes safely in toEditableItems', () => {
    const rawItems: OrderItem[] = [
      {
        id: 'item-raw-1',
        name: 'Platillo Especial',
        quantity: 2,
        unitPrice: 120,
        status: ItemStatus.PENDING,
        dishId: null as unknown as string,
        modifiers: null as unknown as string[],
        notes: null as unknown as string,
      },
    ];

    const editable = toEditableItems(rawItems);
    expect(editable).toHaveLength(1);
    expect(editable[0].dishId).toBeUndefined();
    expect(editable[0].modifiers).toEqual([]);
    expect(editable[0].notes).toBe('');
    expect(editable[0].name).toBe('Platillo Especial');
    expect(editable[0].quantity).toBe(2);
  });
});

