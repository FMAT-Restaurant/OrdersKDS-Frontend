/**
 * @file React Query hook for inspecting and manually opening/closing operational shifts.
 * @satisfies RF-12, RF-15, RNF-03
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../shared/api/client.ts';
import { closeCurrentShift, fetchCurrentShift, openShift } from '../../shared/api/shiftApi.ts';
import type { ShiftStatusResponse } from '../../shared/api/shiftSchemas.ts';

export interface ShiftFeedbackMessage {
  readonly text: string;
  readonly type: 'success' | 'info';
}

export interface UseShiftControlParams {
  readonly client: ApiClient | null;
  readonly enabled: boolean;
  readonly onFeedback?: (msg: ShiftFeedbackMessage) => void;
  readonly onError?: (message: string) => void;
}

const SHIFT_QUERY_KEY = ['kds', 'shift', 'current'] as const;

function extractShiftErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'No se pudo completar la operación del turno.';
}

/**
 * Manages shift status polling and Master Chef / Admin lifecycle mutations.
 */
export function useShiftControl({
  client,
  enabled,
  onFeedback,
  onError,
}: Readonly<UseShiftControlParams>) {
  const queryClient = useQueryClient();

  const shiftQuery = useQuery<ShiftStatusResponse | null>({
    queryKey: SHIFT_QUERY_KEY,
    queryFn: () => fetchCurrentShift(client!),
    enabled: Boolean(client) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const invalidateShiftAndOrders = () => {
    void queryClient.invalidateQueries({ queryKey: ['kds'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const openMutation = useMutation({
    mutationFn: (notes?: string) => openShift(client!, notes),
    onSuccess: (opened) => {
      invalidateShiftAndOrders();
      onFeedback?.({
        text: `Turno #${opened.shiftNumber} abierto. Los folios reinician en #001.`,
        type: 'success',
      });
    },
    onError: (err) => {
      onError?.(extractShiftErrorMessage(err));
    },
  });

  const closeMutation = useMutation({
    mutationFn: (notes?: string) => closeCurrentShift(client!, notes),
    onSuccess: (closed) => {
      invalidateShiftAndOrders();
      onFeedback?.({
        text: `Turno #${closed.shiftNumber} cerrado manualmente.`,
        type: 'info',
      });
    },
    onError: (err) => {
      onError?.(extractShiftErrorMessage(err));
    },
  });

  const rolloverMutation = useMutation({
    mutationFn: async (notes?: string) => {
      await closeCurrentShift(client!, notes);
      return openShift(client!, notes);
    },
    onSuccess: (opened) => {
      invalidateShiftAndOrders();
      onFeedback?.({
        text: `Turno cerrado. Nuevo Turno #${opened.shiftNumber} abierto (folios desde #001).`,
        type: 'success',
      });
    },
    onError: (err) => {
      invalidateShiftAndOrders();
      onError?.(extractShiftErrorMessage(err));
    },
  });

  return {
    status: shiftQuery.data ?? null,
    isLoading: shiftQuery.isLoading,
    isPendingAction:
      openMutation.isPending || closeMutation.isPending || rolloverMutation.isPending,
    openShift: (notes?: string) => openMutation.mutateAsync(notes),
    closeShift: (notes?: string) => closeMutation.mutateAsync(notes),
    rolloverShift: (notes?: string) => rolloverMutation.mutateAsync(notes),
  };
}
