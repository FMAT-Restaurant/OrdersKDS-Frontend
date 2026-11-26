/**
 * @file Zod schemas and domain types for operational kitchen shifts and folios.
 * @satisfies RF-12, RF-15, RNF-03
 */

import { z } from './zodCsp.ts';

export const ShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type ShiftStatus = typeof ShiftStatus[keyof typeof ShiftStatus];

export const ShiftSchema = z.object({
  id: z.string(),
  shiftId: z.string().optional(),
  shiftNumber: z.number().int().positive(),
  status: z.enum([ShiftStatus.OPEN, ShiftStatus.CLOSED]),
  lastOrderFolio: z.number().int().nonnegative(),
  openedAt: z.string(),
  openedBy: z.string().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  closedBy: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  version: z.number().int().nonnegative().optional(),
});

export type Shift = z.infer<typeof ShiftSchema>;

export const ShiftStatusResponseSchema = z.object({
  isOpen: z.boolean(),
  canAcceptOrders: z.boolean(),
  currentShift: ShiftSchema.nullable(),
  lastClosedShift: ShiftSchema.nullable().optional(),
  nextShiftNumber: z.number().int().positive(),
});

export type ShiftStatusResponse = z.infer<typeof ShiftStatusResponseSchema>;

export interface ShiftActionRequest {
  readonly notes?: string;
}
