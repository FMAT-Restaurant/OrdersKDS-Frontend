import { describe, expect, it } from 'vitest';
import {
  MAX_CATALOG_ID_LENGTH,
  mapDraftItemToApiInput,
  parseRejectionDetails,
  resolveDishName,
} from '../../../src/features/order-ticket/orderTicketUtils.ts';
import { ItemStatus } from '../../../src/shared/types/order.ts';

describe('OrderTicket sourceId / plateId / offerId alignment', () => {
  it('exposes MAX_CATALOG_ID_LENGTH aligned with backend/inventory 100 chars', () => {
    expect(MAX_CATALOG_ID_LENGTH).toBe(100);
  });

  it('parses sourceId and plateId aliases from rejectionDetails', () => {
    const parsed = parseRejectionDetails({
      reason: 'Sin insumos',
      rejectedItems: [
        {
          sourceId: 'source-receta-01',
          offerId: 'offer-combo-01',
          name: 'Hamburguesa Combo',
          requestedQuantity: 2,
          availableQuantity: 0,
        },
        {
          plateId: 'plate-papas-02',
          quantity: 1,
          availableStock: 0,
        },
      ],
    });

    expect(parsed?.rejectedItems[0]).toMatchObject({
      sourceId: 'source-receta-01',
      dishId: 'source-receta-01',
      offerId: 'offer-combo-01',
    });
    expect(parsed?.rejectedItems[1]).toMatchObject({
      dishId: 'plate-papas-02',
      requestedQuantity: 1,
    });
  });

  it('resolves dish names by sourceId and offerId in addition to dishId', () => {
    const items = [
      {
        id: 'item-1',
        publicId: 'item-1',
        itemId: 'item-1',
        dishId: 'source-taco-01',
        sourceId: 'source-taco-01',
        offerId: 'offer-taco-promo',
        name: 'Orden Tacos Pastor',
        quantity: 1,
        unitPrice: 120,
        status: ItemStatus.PENDING,
      },
    ];

    expect(resolveDishName('source-taco-01', items)).toBe('Orden Tacos Pastor');
    expect(resolveDishName('offer-taco-promo', items)).toBe('Orden Tacos Pastor');
    expect(resolveDishName('missing-id', items)).toBe('missing-id');
  });

  it('preserves 100-character sourceId and offerId in mapDraftItemToApiInput', () => {
    const source100 = 's'.repeat(100);
    const offer100 = 'o'.repeat(100);

    const payload = mapDraftItemToApiInput({
      sourceId: source100,
      offerId: offer100,
      name: 'Platillo ID Largo',
      quantity: 2,
      unitPrice: 95,
      modifiers: [],
      notes: '',
    });

    expect(payload.dishId).toBe(source100);
    expect(payload.sourceId).toBe(source100);
    expect(payload.offerId).toBe(offer100);
  });
});
