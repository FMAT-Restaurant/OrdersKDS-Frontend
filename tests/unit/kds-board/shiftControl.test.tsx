import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ShiftControlBar } from '../../../src/features/kds-board/ShiftControlBar.tsx';
import { createSandboxController } from '../../../src/features/dev-sandbox/mockSandboxFetch.ts';
import { ApiClient } from '../../../src/shared/api/client.ts';
import { fetchCurrentShift } from '../../../src/shared/api/shiftApi.ts';
import { canManageShifts, UserRole, type ShellUser } from '../../../src/shared/types/auth.ts';
import { server } from '../../mocks/server.ts';

function renderShiftBar({
  currentUser,
  userRole,
  onFeedback = vi.fn(),
  onError = vi.fn(),
}: {
  currentUser?: ShellUser | null;
  userRole?: UserRole;
  onFeedback?: (msg: { text: string; type: 'success' | 'info' }) => void;
  onError?: (err: string) => void;
}) {
  const client = new ApiClient({
    baseUrl: 'http://localhost',
    tokenProvider: async () => 'test-token',
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={qc}>
      <ShiftControlBar
        client={client}
        currentUser={currentUser}
        userRole={userRole}
        onFeedback={onFeedback}
        onError={onError}
      />
    </QueryClientProvider>,
  );

  return { onFeedback, onError };
}

describe('Shift Control RBAC, UI, and API integration', () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });
  afterAll(() => server.close());

  it('grants manual shift management strictly to Master Chef and Admin', () => {
    expect(canManageShifts({ roles: ['ADMINISTRADOR'] })).toBe(true);
    expect(canManageShifts({ userType: 'ADMIN' })).toBe(true);
    expect(canManageShifts({ roles: ['CHEF_MASTER'] })).toBe(true);
    expect(canManageShifts({ roles: ['chef'], permissions: ['kitchen:orders:void_error'] })).toBe(true);
    expect(canManageShifts({ roles: ['chef'], permissions: ['kitchen:shifts:manage'] })).toBe(true);

    expect(canManageShifts({ roles: ['COCINERO'] })).toBe(false);
    expect(canManageShifts({ roles: ['MESERO'] })).toBe(false);
    expect(canManageShifts({ roles: ['CHEF_MASTER'], permissions: [] })).toBe(false);
    expect(canManageShifts({ roles: ['COCINERO'], permissions: ['kitchen:items:ready'] })).toBe(false);

    expect(canManageShifts(null, UserRole.CHEF)).toBe(true);
    expect(canManageShifts(null, UserRole.ADMIN)).toBe(true);
    expect(canManageShifts(null, UserRole.KITCHEN)).toBe(false);
    expect(canManageShifts(null, UserRole.WAITER)).toBe(false);
  });

  it('shows manual open/close controls for Master Chef and hides them for Kitchen/Waiter', async () => {
    renderShiftBar({ userRole: UserRole.CHEF });
    expect(await screen.findByTestId('shift-status-badge')).toHaveTextContent('Turno #1 · Folios: 2');
    expect(screen.getByTestId('shift-close-btn')).toBeInTheDocument();
    expect(screen.getByTestId('shift-rollover-btn')).toBeInTheDocument();

    cleanup();
    renderShiftBar({ userRole: UserRole.KITCHEN });
    expect(await screen.findByTestId('shift-status-badge')).toHaveTextContent('Turno #1 · Folios: 2');
    expect(screen.queryByTestId('shift-close-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shift-open-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shift-rollover-btn')).not.toBeInTheDocument();

    cleanup();
    renderShiftBar({ userRole: UserRole.WAITER });
    expect(await screen.findByTestId('shift-status-badge')).toHaveTextContent('Turno #1 · Folios: 2');
    expect(screen.queryByTestId('shift-close-btn')).not.toBeInTheDocument();
  });

  it('allows closing active shift, cancelling dialog, and opening next shift', async () => {
    let shiftOpen = true;
    let shiftNumber = 1;
    let lastNotes: string | null = null;

    server.use(
      http.get('*/shifts/current', () =>
        HttpResponse.json({
          isOpen: shiftOpen,
          canAcceptOrders: shiftOpen,
          currentShift: shiftOpen
            ? {
                id: `shift-${shiftNumber}`,
                shiftNumber,
                status: 'OPEN',
                lastOrderFolio: shiftNumber === 1 ? 5 : 0,
                openedAt: '2026-11-19T08:00:00Z',
                version: 1,
              }
            : null,
          lastClosedShift: null,
          nextShiftNumber: shiftOpen ? shiftNumber + 1 : shiftNumber,
        }),
      ),
      http.post('*/shifts/current/close', async ({ request }) => {
        const body = (await request.json()) as { notes?: string };
        lastNotes = body.notes ?? null;
        shiftOpen = false;
        return HttpResponse.json({
          id: 'shift-1',
          shiftNumber: 1,
          status: 'CLOSED',
          lastOrderFolio: 5,
          openedAt: '2026-11-19T08:00:00Z',
          closedAt: '2026-11-19T14:00:00Z',
          notes: lastNotes,
          version: 2,
        });
      }),
      http.post('*/shifts/open', async ({ request }) => {
        const body = (await request.json()) as { notes?: string };
        lastNotes = body.notes ?? null;
        shiftOpen = true;
        shiftNumber = 2;
        return HttpResponse.json(
          {
            id: 'shift-2',
            shiftNumber: 2,
            status: 'OPEN',
            lastOrderFolio: 0,
            openedAt: '2026-11-19T14:05:00Z',
            notes: lastNotes,
            version: 1,
          },
          { status: 201 },
        );
      }),
    );

    const { onFeedback } = renderShiftBar({
      currentUser: { roles: ['CHEF_MASTER'], permissions: ['kitchen:orders:void_error'] },
    });

    fireEvent.click(await screen.findByTestId('shift-close-btn'));
    expect(screen.getByTestId('shift-control-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('shift-dialog-cancel-btn'));
    expect(screen.queryByTestId('shift-control-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shift-close-btn'));
    fireEvent.change(screen.getByTestId('shift-dialog-notes-input'), {
      target: { value: 'Corte de caja turno 1' },
    });
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));

    await waitFor(() => {
      expect(lastNotes).toBe('Corte de caja turno 1');
      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'info', text: expect.stringContaining('Turno #1 cerrado') }),
      );
      expect(screen.getByTestId('shift-open-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('shift-open-btn'));
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));

    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', text: expect.stringContaining('Turno #2 abierto') }),
      );
      expect(screen.getByTestId('shift-status-badge')).toHaveTextContent('Turno #2 · Folios: 0');
    });
  });

  it('supports rollover success, direct open/close errors, and non-Error rejection fallback', async () => {
    const calls: string[] = [];
    let shouldFailOpen = true;

    server.use(
      http.post('*/shifts/current/close', () => {
        calls.push('close');
        return HttpResponse.json({
          id: 'shift-1',
          shiftNumber: 1,
          status: 'CLOSED',
          lastOrderFolio: 2,
          openedAt: '2026-11-19T08:00:00Z',
          version: 2,
        });
      }),
      http.post('*/shifts/open', () => {
        calls.push('open');
        if (shouldFailOpen) {
          return HttpResponse.json({ error: { message: 'Shift open failed' } }, { status: 409 });
        }
        return HttpResponse.json(
          {
            id: 'shift-2',
            shiftNumber: 2,
            status: 'OPEN',
            lastOrderFolio: 0,
            openedAt: '2026-11-19T14:00:00Z',
            version: 1,
          },
          { status: 201 },
        );
      }),
    );

    const { onFeedback, onError } = renderShiftBar({ userRole: UserRole.ADMIN });
    fireEvent.click(await screen.findByTestId('shift-rollover-btn'));
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));

    await waitFor(() => {
      expect(calls).toEqual(['close', 'open']);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    shouldFailOpen = false;
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));
    await waitFor(() => {
      expect(onFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', text: expect.stringContaining('Nuevo Turno #2') }),
      );
    });

    server.use(
      http.post('*/shifts/current/close', () =>
        HttpResponse.json({ error: { message: 'Close 409' } }, { status: 409 }),
      ),
    );
    fireEvent.click(await screen.findByTestId('shift-close-btn'));
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByTestId('shift-dialog-cancel-btn'));

    cleanup();
    server.use(
      http.get('*/shifts/current', () =>
        HttpResponse.json({
          isOpen: false,
          canAcceptOrders: false,
          currentShift: null,
          nextShiftNumber: 3,
        }),
      ),
      http.post('*/shifts/open', () =>
        HttpResponse.json({ error: { message: 'Open 409' } }, { status: 409 }),
      ),
    );
    const openErrorSpy = vi.fn();
    renderShiftBar({ userRole: UserRole.ADMIN, onError: openErrorSpy });
    fireEvent.click(await screen.findByTestId('shift-open-btn'));
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));
    await waitFor(() => {
      expect(openErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('uses fallback error message for non-Error mutation failures', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue({
        isOpen: false,
        canAcceptOrders: false,
        currentShift: null,
        nextShiftNumber: 2,
      }),
      post: vi.fn().mockRejectedValue('unexpected string rejection'),
    } as unknown as ApiClient;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const onError = vi.fn();
    render(
      <QueryClientProvider client={qc}>
        <ShiftControlBar client={fakeClient} userRole={UserRole.ADMIN} onError={onError} />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId('shift-open-btn'));
    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('No se pudo completar la operación del turno.');
    });
  });

  it('fetchCurrentShift returns null cleanly on non-shift payloads and sandbox controller handles double transitions', async () => {
    const fakeClient = {
      get: vi.fn().mockResolvedValue([]),
    } as unknown as ApiClient;
    await expect(fetchCurrentShift(fakeClient)).resolves.toBeNull();

    const sandbox = createSandboxController(async () => 'sim-token');
    expect((await sandbox.mockFetch('http://localhost/shifts/open', { method: 'POST', body: '{}' })).status).toBe(409);

    const created1 = await (await sandbox.mockFetch('http://localhost/orders', { method: 'POST', body: JSON.stringify({ tableNumber: 3 }) })).json();
    expect(created1.orderNumber).toBe(1);
    expect(created1.shiftFolio).toBe(1);

    const closedResp = await sandbox.mockFetch('http://localhost/shifts/current/close', { method: 'POST', body: '{}' });
    expect(closedResp.status).toBe(200);
    expect((await sandbox.mockFetch('http://localhost/shifts/current/close', { method: 'POST', body: '{}' })).status).toBe(409);

    const blockedOrderResp = await sandbox.mockFetch('http://localhost/orders', { method: 'POST', body: '{}' });
    expect(blockedOrderResp.status).toBe(409);

    const openedResp = await sandbox.mockFetch('http://localhost/shifts/open', { method: 'POST', body: '{}' });
    expect(openedResp.status).toBe(201);

    const created2 = await (await sandbox.mockFetch('http://localhost/orders', { method: 'POST', body: JSON.stringify({ tableNumber: 4 }) })).json();
    expect(created2.orderNumber).toBe(1);
    expect(created2.shiftFolio).toBe(1);
  });

  it('rejects unconfirmed draft confirmation with 409 when sandbox shift is closed and allows idempotent retries', async () => {
    const sandbox = createSandboxController(async () => 'sim-token');
    await sandbox.mockFetch('http://localhost/shifts/current/close', { method: 'POST', body: '{}' });

    const blockedConfirm = await sandbox.mockFetch('http://localhost/orders/ord-mesa-4/confirm', {
      method: 'POST',
      body: '{}',
    });
    expect(blockedConfirm.status).toBe(409);
    const blockedBody = await blockedConfirm.json();
    expect(blockedBody.error.code).toBe('INVALID_STATE_TRANSITION');

    await sandbox.mockFetch('http://localhost/shifts/open', { method: 'POST', body: '{}' });
    const confirmedResp = await sandbox.mockFetch('http://localhost/orders/ord-mesa-4/confirm', {
      method: 'POST',
      body: '{}',
    });
    expect(confirmedResp.status).toBe(200);

    await sandbox.mockFetch('http://localhost/shifts/current/close', { method: 'POST', body: '{}' });
    const idempotentRetry = await sandbox.mockFetch('http://localhost/orders/ord-mesa-4/confirm', {
      method: 'POST',
      body: '{}',
    });
    expect(idempotentRetry.status).toBe(200);
  });

  it('supports floating VirtualKeyboard inside ShiftControlDialog and sends composed shift note', async () => {
    let postedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('http://localhost/shifts/current/close', async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: 'shift-1',
            shiftId: 'shift-1',
            shiftNumber: 1,
            status: 'CLOSED',
            lastOrderFolio: 2,
            openedAt: '2026-04-12T10:00:00Z',
            closedAt: '2026-04-12T18:00:00Z',
            version: 2,
          },
          { status: 200 },
        );
      }),
    );

    renderShiftBar({ userRole: UserRole.ADMIN });
    fireEvent.click(await screen.findByTestId('shift-close-btn'));
    expect(screen.queryByTestId('virtual-keyboard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shift-dialog-toggle-keyboard'));
    expect(screen.getByTestId('virtual-keyboard')).toBeInTheDocument();

    for (const letter of ['O', 'K']) {
      fireEvent.click(screen.getByTestId(`virtual-key-${letter}`));
    }
    fireEvent.click(screen.getByTestId('virtual-key-space'));
    fireEvent.click(screen.getByTestId('virtual-key-A'));
    fireEvent.click(screen.getByTestId('virtual-key-backspace'));
    expect(screen.getByTestId('shift-dialog-notes-input')).toHaveValue('OK ');

    fireEvent.click(screen.getByTestId('virtual-keyboard-close'));
    expect(screen.queryByTestId('virtual-keyboard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('shift-dialog-confirm-btn'));
    await waitFor(() => {
      expect(postedBody).toEqual({ notes: 'OK' });
    });
  });

  it('handles multi-item kitchen-reject breakdown in sandbox mockFetch', async () => {
    const sandbox = createSandboxController(async () => 'sim-token');
    const createdResp = await sandbox.mockFetch('http://localhost/orders', {
      method: 'POST',
      body: JSON.stringify({ tableNumber: 9 }),
    });
    const created = (await createdResp.json()) as { id: string };

    const rejectResp = await sandbox.mockFetch(
      `http://localhost/orders/${created.id}/items/item-a/kitchen-reject`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          reason: 'Faltan dos ingredientes',
          items: [
            { itemId: 'item-a', availableQuantity: 0, reason: 'Sin pan' },
          ],
        }),
      },
    );
    expect(rejectResp.status).toBe(200);
    const rejectedOrder = (await rejectResp.json()) as {
      status: string;
      rejectionDetails?: { rejectedItems?: Array<Record<string, unknown>> };
    };
    expect(rejectedOrder.status).toBe('REJECTED');
    expect(rejectedOrder.rejectionDetails?.rejectedItems).toBeDefined();
  });
});
