import type { Order, OrderItem } from '../../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../../src/shared/types/order.ts';

export const mockOrderItem1: OrderItem = {
  id: 'item-1',
  itemId: 'item-1',
  dishId: 'dish-burger-1',
  name: 'Hamburguesa Clásica',
  quantity: 2,
  unitPrice: 150.0,
  status: ItemStatus.PENDING,
  station: 'plancha',
  notes: 'Sin cebolla',
  version: 1,
};

export const mockOrderItem2: OrderItem = {
  id: 'item-2',
  itemId: 'item-2',
  dishId: 'dish-fries-1',
  name: 'Papas Francesas',
  quantity: 1,
  unitPrice: 50.0,
  status: ItemStatus.READY,
  station: 'freidora',
  version: 2,
};

export const mockOrder1: Order = {
  id: 'ord-101',
  orderId: 'ord-101',
  tableNumber: 4,
  isTakeaway: false,
  status: OrderStatus.IN_PREPARATION,
  version: 3,
  totalAmount: 350.0,
  items: [mockOrderItem1, mockOrderItem2],
  confirmedAt: '2026-10-19T20:00:00Z',
  inPreparationAt: '2026-10-19T20:05:00Z',
  createdAt: '2026-10-19T19:55:00Z',
};

export const mockOrder2: Order = {
  id: 'ord-102',
  orderId: 'ord-102',
  tableNumber: null,
  isTakeaway: true,
  status: OrderStatus.CREATED,
  version: 1,
  totalAmount: 180.0,
  items: [
    {
      id: 'item-3',
      itemId: 'item-3',
      name: 'Ensalada César',
      quantity: 1,
      unitPrice: 180.0,
      status: ItemStatus.PENDING,
      station: 'frio',
      version: 1,
    },
  ],
  createdAt: '2026-10-19T20:10:00Z',
};

export const mockKdsQueue: Order[] = [mockOrder1, mockOrder2];
