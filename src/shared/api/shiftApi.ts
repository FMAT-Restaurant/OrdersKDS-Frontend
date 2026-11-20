/**
 * @file REST client helpers for querying and managing operational shifts.
 * @satisfies RF-12, RF-15, RNF-03
 */

import type { ApiClient } from './client.ts';
import {
  ShiftSchema,
  ShiftStatusResponseSchema,
  type Shift,
  type ShiftStatusResponse,
} from './shiftSchemas.ts';

function normalizeNotesBody(notes?: string): { notes?: string } {
  const trimmed = notes?.trim();
  return trimmed ? { notes: trimmed } : {};
}

/**
 * Fetch active shift status; returns null if a test double returns an unrelated payload shape.
 */
export async function fetchCurrentShift(client: ApiClient): Promise<ShiftStatusResponse | null> {
  const raw = await client.get<unknown>('/shifts/current');
  const parsed = ShiftStatusResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Manually open a new shift (resets per-shift order folio to #001 on next created order).
 */
export function openShift(client: ApiClient, notes?: string): Promise<Shift> {
  return client.post<Shift>('/shifts/open', normalizeNotesBody(notes), ShiftSchema);
}

/**
 * Manually close the currently active shift.
 */
export function closeCurrentShift(client: ApiClient, notes?: string): Promise<Shift> {
  return client.post<Shift>('/shifts/current/close', normalizeNotesBody(notes), ShiftSchema);
}
