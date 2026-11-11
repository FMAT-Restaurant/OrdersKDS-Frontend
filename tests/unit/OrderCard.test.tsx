/// <reference types="vite/client" />
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { OrderCard } from '../../src/features/kds-board/OrderCard.tsx';
import { STATUS_CONFIG } from '../../src/features/kds-board/orderStatusConfig.ts';
import { StatusBadge } from '../../src/features/kds-board/StatusBadge.tsx';
import {
  computeDelayInfo,
  formatElapsedTime,
  getDelayThresholds,
  useElapsedTime,
} from '../../src/features/kds-board/useElapsedTime.ts';
import type { Order } from '../../src/shared/api/schemas.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';

describe('OrderCard Component & Hook Suite (TASK-15 Phase 2, ADR-0012)', () => {
  const baseTimestamp = new Date('2026-10-31T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // UT-FE-04: Delay semáforo with thresholds (KDS_WARNING / KDS_LATE)
  // -------------------------------------------------------------------------
  describe('UT-FE-04: Semáforo de atraso con umbrales', () => {
    it('formats elapsed time correctly for seconds, minutes, and hours', () => {
      expect(formatElapsedTime(0)).toBe('00:00');
      expect(formatElapsedTime(-10)).toBe('00:00');
      expect(formatElapsedTime(NaN)).toBe('00:00');
      expect(formatElapsedTime(5)).toBe('00:05');
      expect(formatElapsedTime(59)).toBe('00:59');
      expect(formatElapsedTime(60)).toBe('01:00');
      expect(formatElapsedTime(65)).toBe('01:05');
      expect(formatElapsedTime(599)).toBe('09:59');
      expect(formatElapsedTime(600)).toBe('10:00');
      expect(formatElapsedTime(3599)).toBe('59:59');
      expect(formatElapsedTime(3600)).toBe('01:00:00');
      expect(formatElapsedTime(3665)).toBe('01:01:05');
    });

    it('computes delay statuses correctly according to warning and late thresholds', () => {
      // Under warning (< 600s): En tiempo / var(--color-success)
      const onTime = computeDelayInfo(599, 600, 900);
      expect(onTime.delayStatus).toBe('on_time');
      expect(onTime.delayLabel).toBe('En tiempo');
      expect(onTime.delayColorToken).toBe('var(--color-success)');

      // Between warning and late (600s - 899s): Por atrasarse / var(--color-warning)
      const warningStart = computeDelayInfo(600, 600, 900);
      expect(warningStart.delayStatus).toBe('warning');
      expect(warningStart.delayLabel).toBe('Por atrasarse');
      expect(warningStart.delayColorToken).toBe('var(--color-warning)');

      const warningMid = computeDelayInfo(750, 600, 900);
      expect(warningMid.delayStatus).toBe('warning');

      const warningEnd = computeDelayInfo(899, 600, 900);
      expect(warningEnd.delayStatus).toBe('warning');

      // Late (>= 900s): Atrasada / var(--color-error)
      const lateStart = computeDelayInfo(900, 600, 900);
      expect(lateStart.delayStatus).toBe('late');
      expect(lateStart.delayLabel).toBe('Atrasada');
      expect(lateStart.delayColorToken).toBe('var(--color-error)');

      const lateMore = computeDelayInfo(1200, 600, 900);
      expect(lateMore.delayStatus).toBe('late');
      expect(lateMore.delayLabel).toBe('Atrasada');
      expect(lateMore.delayColorToken).toBe('var(--color-error)');
    });

    it('supports custom threshold parameters to dynamically shift semáforo boundaries', () => {
      const thresholds = getDelayThresholds(180, 360);
      expect(thresholds.warningSeconds).toBe(180);
      expect(thresholds.lateSeconds).toBe(360);

      // 170s is on time
      const status170 = computeDelayInfo(170, thresholds.warningSeconds, thresholds.lateSeconds);
      expect(status170.delayStatus).toBe('on_time');

      // 180s enters warning
      const status180 = computeDelayInfo(180, thresholds.warningSeconds, thresholds.lateSeconds);
      expect(status180.delayStatus).toBe('warning');

      // 360s enters late
      const status360 = computeDelayInfo(360, thresholds.warningSeconds, thresholds.lateSeconds);
      expect(status360.delayStatus).toBe('late');
    });

    it('reads thresholds from environment variables when present', () => {
      vi.stubEnv('VITE_KDS_WARNING_AFTER_SECONDS', '400');
      vi.stubEnv('VITE_KDS_LATE_AFTER_SECONDS', '800');

      try {
        const envThresholds = getDelayThresholds();
        expect(envThresholds.warningSeconds).toBe(400);
        expect(envThresholds.lateSeconds).toBe(800);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('renders on_time, warning, and late styles on OrderCard based on elapsed time', () => {
      // 1. Order in preparation 5 minutes ago (300s -> on_time)
      const onTimeOrder: Order = {
        id: 'ord-sem-1',
        tableNumber: 1,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [{ name: 'Sopa', quantity: 1, unitPrice: 50, status: ItemStatus.PENDING }],
        in_preparation_at: new Date(baseTimestamp - 300 * 1000).toISOString(),
      };

      const { rerender } = render(<OrderCard order={onTimeOrder} />);
      const stopwatch1 = screen.getByTestId('order-stopwatch-ord-sem-1');
      expect(stopwatch1).toHaveAttribute('data-delay-status', 'on_time');
      expect(stopwatch1).toHaveStyle({ backgroundColor: 'var(--color-success)' });
      expect(screen.getByTestId('order-delay-label-ord-sem-1')).toHaveTextContent('(En tiempo)');
      expect(screen.getByTestId('order-timer-ord-sem-1')).toHaveTextContent('05:00');

      // 2. Order in preparation 11 minutes ago (660s -> warning)
      const warningOrder: Order = {
        ...onTimeOrder,
        id: 'ord-sem-2',
        in_preparation_at: new Date(baseTimestamp - 660 * 1000).toISOString(),
      };
      rerender(<OrderCard order={warningOrder} />);
      const stopwatch2 = screen.getByTestId('order-stopwatch-ord-sem-2');
      expect(stopwatch2).toHaveAttribute('data-delay-status', 'warning');
      expect(stopwatch2).toHaveStyle({ backgroundColor: 'var(--color-warning)' });
      expect(screen.getByTestId('order-delay-label-ord-sem-2')).toHaveTextContent('(Por atrasarse)');
      expect(screen.getByTestId('order-timer-ord-sem-2')).toHaveTextContent('11:00');

      // 3. Order in preparation 20 minutes ago (1200s -> late)
      const lateOrder: Order = {
        ...onTimeOrder,
        id: 'ord-sem-3',
        in_preparation_at: new Date(baseTimestamp - 1200 * 1000).toISOString(),
      };
      rerender(<OrderCard order={lateOrder} />);
      const stopwatch3 = screen.getByTestId('order-stopwatch-ord-sem-3');
      expect(stopwatch3).toHaveAttribute('data-delay-status', 'late');
      expect(stopwatch3).toHaveStyle({ backgroundColor: 'var(--color-error)' });
      expect(screen.getByTestId('order-delay-label-ord-sem-3')).toHaveTextContent('(Atrasada)');
      expect(screen.getByTestId('order-timer-ord-sem-3')).toHaveTextContent('20:00');
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-05: Strict XSS escaping for Notes, Modifiers, and prep time (ST-19)
  // -------------------------------------------------------------------------
  describe('UT-FE-05: Escape estricto de Notas/XSS (ST-19)', () => {
    it('escapes malicious HTML/JavaScript strings in notes, modifiers, and preparationTimeText', () => {
      const xssNotes = "<script>alert('xss-notes')</script>";
      const xssModifier1 = "<img src='invalid' onerror='window.hacked=true' />";
      const xssModifier2 = "\"><svg onload=\"alert('svg-xss')\">";
      const xssPrepTime = "<b onmouseover=\"alert('prep')\">15 min</b>";

      const xssOrder: Order = {
        id: 'ord-xss-99',
        tableNumber: 99,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [
          {
            id: 'item-xss-1',
            name: 'Dish Safe Name',
            quantity: 2,
            unitPrice: 100,
            status: ItemStatus.PENDING,
            notes: xssNotes,
            modifiers: [xssModifier1, xssModifier2],
            preparationTimeText: xssPrepTime,
          },
        ],
        in_preparation_at: new Date(baseTimestamp - 60 * 1000).toISOString(),
      };

      const { container } = render(<OrderCard order={xssOrder} />);

      // Verify strings are rendered safely as visible text nodes
      expect(screen.getByText(xssNotes)).toBeInTheDocument();
      expect(screen.getByText(`+ ${xssModifier1}`)).toBeInTheDocument();
      expect(screen.getByText(`+ ${xssModifier2}`)).toBeInTheDocument();
      expect(screen.getByText(xssPrepTime)).toBeInTheDocument();

      // Verify no executable HTML elements were created in the DOM
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('svg[onload]')).toBeNull();
      expect(container.querySelector('b[onmouseover]')).toBeNull();

      // Confirms window was not polluted
      expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-06: StatusBadge and domain order states with semantic tokens
  // -------------------------------------------------------------------------
  describe('UT-FE-06: StatusBadge y estados con tokens', () => {
    const expectedTokens: Record<OrderStatus, { label: string; token: string }> = {
      CREATED: { label: 'Created', token: 'var(--color-warning)' },
      RESERVED: { label: 'Reservado / Por iniciar', token: 'var(--color-info)' },
      IN_PREPARATION: { label: 'In Preparation', token: 'var(--color-info)' },
      DELIVERED: { label: 'Delivered', token: 'var(--color-success)' },
      PAID: { label: 'Paid', token: 'var(--color-success)' },
      CANCELLED: { label: 'Cancelled', token: 'var(--color-error)' },
      REJECTED: { label: 'Rejected', token: 'var(--color-error)' },
      WASTED: { label: 'Wasted', token: 'var(--color-error)' },
      VOIDED: { label: 'Voided', token: 'var(--color-error)' },
      EXPIRED: { label: 'Expired', token: 'var(--color-error)' },
    };

    it.each(Object.keys(expectedTokens) as OrderStatus[])(
      'renders status %s with readable text and semantic CSS token',
      (status) => {
        const { label, token } = expectedTokens[status];
        render(<StatusBadge status={status} />);

        const badge = screen.getByTestId(`status-badge-${status.toLowerCase()}`);
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(label);
        expect(badge).toHaveAttribute('data-status', status);
        expect(badge).toHaveStyle({ backgroundColor: token });
      },
    );

    it('exports all 10 domain statuses in STATUS_CONFIG matching TASK-C08 tokens and ADR-0012', () => {
      const keys = Object.keys(STATUS_CONFIG);
      expect(keys).toHaveLength(10);
      expect(STATUS_CONFIG.CREATED.token).toBe('var(--color-warning)');
      expect(STATUS_CONFIG.RESERVED.token).toBe('var(--color-info)');
      expect(STATUS_CONFIG.RESERVED.label).toBe('Reservado / Por iniciar');
      expect(STATUS_CONFIG.IN_PREPARATION.token).toBe('var(--color-info)');
      expect(STATUS_CONFIG.DELIVERED.token).toBe('var(--color-success)');
      expect(STATUS_CONFIG.PAID.token).toBe('var(--color-success)');
      expect(STATUS_CONFIG.CANCELLED.token).toBe('var(--color-error)');
      expect(STATUS_CONFIG.REJECTED.token).toBe('var(--color-error)');
      expect(STATUS_CONFIG.WASTED.token).toBe('var(--color-error)');
      expect(STATUS_CONFIG.VOIDED.token).toBe('var(--color-error)');
      expect(STATUS_CONFIG.EXPIRED.token).toBe('var(--color-error)');
    });

    it('falls back safely when passed an unmapped status', () => {
      render(<StatusBadge status={'UNKNOWN_STATUS' as OrderStatus} />);
      const fallbackBadge = screen.getByTestId('status-badge-unknown_status');
      expect(fallbackBadge).toHaveTextContent('UNKNOWN_STATUS');
      expect(fallbackBadge).toHaveStyle({ backgroundColor: 'var(--color-info)' });
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-07: Live Stopwatch strictly based on in_preparation_at (OP-11, ADR-0012)
  // -------------------------------------------------------------------------
  describe('UT-FE-07: Cronómetro basado en in_preparation_at y fallback stock_reserved_at (OP-11, ADR-0012)', () => {
    it('strictly counts from in_preparation_at and ignores createdAt', () => {
      const twoHoursAgo = new Date(baseTimestamp - 7200 * 1000).toISOString();
      const fiveMinutesAgo = new Date(baseTimestamp - 300 * 1000).toISOString();

      const orderWithBothTimes: Order = {
        id: 'ord-op11',
        tableNumber: 12,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [{ name: 'Filete', quantity: 1, unitPrice: 200, status: ItemStatus.PENDING }],
        createdAt: twoHoursAgo, // 02:00:00 elapsed if incorrectly used
        in_preparation_at: fiveMinutesAgo, // 05:00 elapsed (correct)
      };

      render(<OrderCard order={orderWithBothTimes} />);

      // Must be 05:00, NOT 02:00:00
      const timerElement = screen.getByTestId('order-timer-ord-op11');
      expect(timerElement).toHaveTextContent('05:00');
      expect(timerElement).not.toHaveTextContent('02:00:00');
    });

    it('supports camelCase inPreparationAt when in_preparation_at is omitted', () => {
      const threeMinutesAgo = new Date(baseTimestamp - 180 * 1000).toISOString();

      const camelOrder: Order = {
        id: 'ord-camel',
        tableNumber: 3,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [{ name: 'Tacos', quantity: 2, unitPrice: 60, status: ItemStatus.PENDING }],
        createdAt: new Date(baseTimestamp - 3600 * 1000).toISOString(),
        inPreparationAt: threeMinutesAgo,
      };

      render(<OrderCard order={camelOrder} />);
      expect(screen.getByTestId('order-timer-ord-camel')).toHaveTextContent('03:00');
    });

    it('uses stock_reserved_at as fallback when in_preparation_at is absent (ADR-0012)', () => {
      const fiveMinutesAgo = new Date(baseTimestamp - 300 * 1000).toISOString();
      const reservedOrder: Order = {
        id: 'ord-reserved-fallback',
        tableNumber: 15,
        status: OrderStatus.RESERVED,
        version: 1,
        items: [{ name: 'Corte New York', quantity: 1, unitPrice: 320, status: ItemStatus.PENDING }],
        createdAt: new Date(baseTimestamp - 3600 * 1000).toISOString(),
        stock_reserved_at: fiveMinutesAgo,
      };

      render(<OrderCard order={reservedOrder} />);
      expect(screen.getByTestId('order-timer-ord-reserved-fallback')).toHaveTextContent('05:00');
    });

    it('supports camelCase stockReservedAt as fallback when in_preparation_at is absent', () => {
      const fourMinutesAgo = new Date(baseTimestamp - 240 * 1000).toISOString();
      const reservedOrder: Order = {
        id: 'ord-reserved-camel',
        tableNumber: 16,
        status: OrderStatus.RESERVED,
        version: 1,
        items: [{ name: 'Costillas BBQ', quantity: 1, unitPrice: 280, status: ItemStatus.PENDING }],
        stockReservedAt: fourMinutesAgo,
      };

      render(<OrderCard order={reservedOrder} />);
      expect(screen.getByTestId('order-timer-ord-reserved-camel')).toHaveTextContent('04:00');
    });

    it('prioritizes in_preparation_at over stock_reserved_at when both are present', () => {
      const twoMinutesAgo = new Date(baseTimestamp - 120 * 1000).toISOString();
      const tenMinutesAgo = new Date(baseTimestamp - 600 * 1000).toISOString();
      const orderBoth: Order = {
        id: 'ord-both-times',
        tableNumber: 17,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [{ name: 'Pasta Carbonara', quantity: 1, unitPrice: 190, status: ItemStatus.PENDING }],
        in_preparation_at: twoMinutesAgo,
        stock_reserved_at: tenMinutesAgo,
      };

      render(<OrderCard order={orderBoth} />);
      expect(screen.getByTestId('order-timer-ord-both-times')).toHaveTextContent('02:00');
    });

    it('defaults to 00:00 when neither in_preparation_at nor stock_reserved_at is present', () => {
      const createdOrder: Order = {
        id: 'ord-no-prep',
        tableNumber: 5,
        status: OrderStatus.CREATED,
        version: 1,
        items: [{ name: 'Ensalada', quantity: 1, unitPrice: 80, status: ItemStatus.PENDING }],
        createdAt: new Date(baseTimestamp - 600 * 1000).toISOString(),
      };

      render(<OrderCard order={createdOrder} />);
      expect(screen.getByTestId('order-timer-ord-no-prep')).toHaveTextContent('00:00');
      expect(screen.getByTestId('order-delay-label-ord-no-prep')).toHaveTextContent('(En tiempo)');
    });

    it('updates elapsed time live on every 1000ms tick', () => {
      const tenSecondsAgo = new Date(baseTimestamp - 10 * 1000).toISOString();
      const order: Order = {
        id: 'ord-live',
        tableNumber: 8,
        status: OrderStatus.IN_PREPARATION,
        version: 1,
        items: [{ name: 'Pizza', quantity: 1, unitPrice: 150, status: ItemStatus.PENDING }],
        in_preparation_at: tenSecondsAgo,
      };

      render(<OrderCard order={order} />);
      expect(screen.getByTestId('order-timer-ord-live')).toHaveTextContent('00:10');

      // Advance by 5 seconds
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('order-timer-ord-live')).toHaveTextContent('00:15');

      // Advance by 55 seconds (crosses into minute)
      act(() => {
        vi.advanceTimersByTime(55000);
      });
      expect(screen.getByTestId('order-timer-ord-live')).toHaveTextContent('01:10');
    });

    it('handles hook unmount and invalid timestamps safely without memory leaks', () => {
      const invalidTimestamp = 'invalid-date-string';
      const { result, unmount } = renderHook(() => useElapsedTime(invalidTimestamp));

      expect(result.current.elapsedSeconds).toBe(0);
      expect(result.current.formattedTime).toBe('00:00');
      expect(result.current.delayStatus).toBe('on_time');

      // Unmount should clear interval cleanly
      unmount();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.elapsedSeconds).toBe(0);
    });

    it('supports useElapsedTime with options as second argument', () => {
      const twoMinutesAgo = new Date(baseTimestamp - 120 * 1000).toISOString();
      const { result } = renderHook(() =>
        useElapsedTime(twoMinutesAgo, { warningAfterSeconds: 100, lateAfterSeconds: 200 }),
      );

      expect(result.current.elapsedSeconds).toBe(120);
      expect(result.current.delayStatus).toBe('warning');
    });

    it('calculates fixed elapsed time and skips live interval when endTime is passed', () => {
      const startTime = new Date(baseTimestamp - 300 * 1000).toISOString();
      const endTime = new Date(baseTimestamp - 60 * 1000).toISOString(); // 240s elapsed
      const { result } = renderHook(() =>
        useElapsedTime(startTime, { endTime }),
      );

      expect(result.current.elapsedSeconds).toBe(240);
      expect(result.current.formattedTime).toBe('04:00');

      // Advancing time should NOT change elapsedSeconds because timer is static
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(result.current.elapsedSeconds).toBe(240);
    });

    it('falls back to live time when endTime is an invalid date string', () => {
      const startTime = new Date(baseTimestamp - 60 * 1000).toISOString();
      const { result } = renderHook(() =>
        useElapsedTime(startTime, { endTime: 'invalid-end-date' }),
      );

      expect(result.current.elapsedSeconds).toBe(60);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.elapsedSeconds).toBe(65);
    });
  });

  // -------------------------------------------------------------------------
  // ADR-0012: Action buttons for RESERVED status
  // -------------------------------------------------------------------------
  describe('ADR-0012: Botones de Acción exclusivos en estado RESERVED', () => {
    it('renders both action buttons with >= 48px height exclusively when status is RESERVED', () => {
      const onStartPreparation = vi.fn();
      const onRejectSupplies = vi.fn();
      const reservedOrder: Order = {
        id: 'ord-res-act',
        tableNumber: 22,
        status: OrderStatus.RESERVED,
        version: 1,
        items: [{ name: 'Ramen', quantity: 1, unitPrice: 160, status: ItemStatus.PENDING }],
      };

      const { rerender } = render(
        <OrderCard
          order={reservedOrder}
          onStartPreparation={onStartPreparation}
          onRejectSupplies={onRejectSupplies}
        />,
      );

      // Buttons must be present
      const startBtn = screen.getByTestId('order-action-start-ord-res-act');
      const rejectBtn = screen.getByTestId('order-action-reject-ord-res-act');

      expect(startBtn).toBeInTheDocument();
      expect(startBtn).toHaveTextContent('Iniciar preparación');
      expect(startBtn).toHaveClass('min-h-[48px]');

      expect(rejectBtn).toBeInTheDocument();
      expect(rejectBtn).toHaveTextContent('Rechazar insumo');
      expect(rejectBtn).toHaveClass('min-h-[48px]');

      // Click start preparation
      fireEvent.click(startBtn);
      expect(onStartPreparation).toHaveBeenCalledTimes(1);
      expect(onStartPreparation).toHaveBeenCalledWith(reservedOrder);

      // Click reject supplies
      fireEvent.click(rejectBtn);
      expect(onRejectSupplies).toHaveBeenCalledTimes(1);
      expect(onRejectSupplies).toHaveBeenCalledWith(reservedOrder);

      // Does NOT render buttons when status is NOT RESERVED
      const inPrepOrder: Order = {
        ...reservedOrder,
        status: OrderStatus.IN_PREPARATION,
      };
      rerender(
        <OrderCard
          order={inPrepOrder}
          onStartPreparation={onStartPreparation}
          onRejectSupplies={onRejectSupplies}
        />,
      );

      expect(screen.queryByTestId('order-action-start-ord-res-act')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-action-reject-ord-res-act')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-actions-ord-res-act')).not.toBeInTheDocument();
    });

    it('safely handles action clicks when handlers are omitted', () => {
      const reservedOrder: Order = {
        id: 'ord-res-no-handlers',
        tableNumber: 23,
        status: OrderStatus.RESERVED,
        version: 1,
        items: [{ name: 'Sushi', quantity: 1, unitPrice: 210, status: ItemStatus.PENDING }],
      };

      render(<OrderCard order={reservedOrder} />);

      const startBtn = screen.getByTestId('order-action-start-ord-res-no-handlers');
      const rejectBtn = screen.getByTestId('order-action-reject-ord-res-no-handlers');

      expect(() => fireEvent.click(startBtn)).not.toThrow();
      expect(() => fireEvent.click(rejectBtn)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-08: Rendering of items, table, modifiers, and dirty-hands interaction
  // -------------------------------------------------------------------------
  describe('UT-FE-08: Renderizado de ítems y mesa', () => {
    const fullOrder: Order = {
      id: 'ord-full-1',
      orderId: 'ord-full-1',
      tableNumber: 42,
      isTakeaway: false,
      status: OrderStatus.IN_PREPARATION,
      version: 2,
      items: [
        {
          id: 'dish-1',
          name: 'Hamburguesa Doble',
          quantity: 2,
          unitPrice: 180,
          status: ItemStatus.PENDING,
          modifiers: ['Sin cebolla', 'Queso extra'],
          notes: 'Término medio',
          preparationTimeText: 'Prep: 12m',
        },
        {
          id: 'dish-2',
          name: 'Papas Trufadas',
          quantity: 1,
          unitPrice: 90,
          status: ItemStatus.READY,
          preparation_time_text: 'Prep: 5m',
        },
      ],
      in_preparation_at: new Date(baseTimestamp - 120 * 1000).toISOString(),
    };

    it('renders large table number and order ID correctly', () => {
      render(<OrderCard order={fullOrder} />);

      expect(screen.getByTestId('order-table-ord-full-1')).toHaveTextContent('Table 42');
      expect(screen.getByTestId('order-id-ord-full-1')).toHaveTextContent('#ord-full-1');
    });

    it('renders Takeaway badge when tableNumber is null and isTakeaway is true', () => {
      const takeawayOrder: Order = {
        ...fullOrder,
        id: 'ord-takeaway',
        tableNumber: null,
        isTakeaway: true,
      };

      render(<OrderCard order={takeawayOrder} />);
      expect(screen.getByTestId('order-takeaway-ord-takeaway')).toHaveTextContent('Takeaway');
      expect(screen.queryByTestId('order-table-ord-takeaway')).not.toBeInTheDocument();
    });

    it('omits table header when tableNumber is null and isTakeaway is false', () => {
      const plainOrder: Order = {
        ...fullOrder,
        id: 'ord-plain',
        tableNumber: null,
        isTakeaway: false,
      };

      render(<OrderCard order={plainOrder} />);
      expect(screen.queryByTestId('order-table-ord-plain')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-takeaway-ord-plain')).not.toBeInTheDocument();
    });

    it('iterates dishes displaying quantities, names, modifiers, notes, and prep times', () => {
      render(<OrderCard order={fullOrder} />);

      // Item 1
      expect(screen.getByTestId('order-item-qty-dish-1')).toHaveTextContent('2x');
      expect(screen.getByTestId('order-item-name-dish-1')).toHaveTextContent('Hamburguesa Doble');
      expect(screen.getByTestId('order-item-modifier-dish-1-0')).toHaveTextContent('+ Sin cebolla');
      expect(screen.getByTestId('order-item-modifier-dish-1-1')).toHaveTextContent('+ Queso extra');
      expect(screen.getByTestId('order-item-notes-dish-1')).toHaveTextContent('Note:Término medio');
      expect(screen.getByTestId('order-item-prep-time-dish-1')).toHaveTextContent('Prep: 12m');

      // Item 2
      expect(screen.getByTestId('order-item-qty-dish-2')).toHaveTextContent('1x');
      expect(screen.getByTestId('order-item-name-dish-2')).toHaveTextContent('Papas Trufadas');
      expect(screen.getByTestId('order-item-prep-time-dish-2')).toHaveTextContent('Prep: 5m');
      expect(screen.queryByTestId('order-item-notes-dish-2')).not.toBeInTheDocument();
    });

    it('supports mouse click activation on dirty-hands touch button target', () => {
      const onClick = vi.fn();
      render(<OrderCard order={fullOrder} onClick={onClick} />);

      const touchTarget = screen.getByTestId('order-card-stub-ord-full-1');
      fireEvent.click(touchTarget);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(fullOrder);
    });

    it('supports keyboard navigation via Enter and Space keys', () => {
      const onClick = vi.fn();
      render(<OrderCard order={fullOrder} onClick={onClick} />);

      const touchTarget = screen.getByTestId('order-card-stub-ord-full-1');

      // Enter activates
      fireEvent.keyDown(touchTarget, { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);

      // Space activates
      fireEvent.keyDown(touchTarget, { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(2);

      // Other keys do not activate
      fireEvent.keyDown(touchTarget, { key: 'Tab' });
      fireEvent.keyDown(touchTarget, { key: 'ArrowDown' });
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('applies high-contrast focus ring styling when isFocused is true', () => {
      const { rerender } = render(<OrderCard order={fullOrder} isFocused={false} />);
      const card = screen.getByTestId('order-card-stub-ord-full-1');
      expect(card).not.toHaveClass('ring-2 ring-fmat-primary');

      rerender(<OrderCard order={fullOrder} isFocused={true} />);
      expect(card).toHaveClass('ring-2 ring-fmat-primary');
    });
  });

  // -------------------------------------------------------------------------
  // TASK-40a: Touch interactions, action buttons and keyboard parity
  // -------------------------------------------------------------------------
  describe('TASK-40a: KDS Touch Actions & Keyboard Parity', () => {
    const reservedOrder: Order = {
      id: 'ord-reserved-1',
      orderId: 'ord-reserved-1',
      tableNumber: 42,
      isTakeaway: false,
      status: OrderStatus.RESERVED,
      version: 2,
      items: [
        {
          id: 'dish-1',
          name: 'Hamburguesa Doble',
          quantity: 2,
          unitPrice: 180,
          status: ItemStatus.PENDING,
          modifiers: ['Sin cebolla', 'Queso extra'],
          notes: 'Término medio',
          preparationTimeText: 'Prep: 12m',
        },
        {
          id: 'dish-2',
          name: 'Papas Trufadas',
          quantity: 1,
          unitPrice: 90,
          status: ItemStatus.READY,
          preparation_time_text: 'Prep: 5m',
        },
      ],
      stock_reserved_at: new Date(baseTimestamp - 60 * 1000).toISOString(),
    };

    it('renders "Iniciar preparación" and "Rechazar insumo" buttons for RESERVED orders', () => {
      const onStart = vi.fn();
      const onReject = vi.fn();
      render(
        <OrderCard
          order={reservedOrder}
          onStartPreparation={onStart}
          onRejectSupplies={onReject}
        />,
      );

      const startBtn = screen.getByTestId('order-action-start-ord-reserved-1');
      const rejectBtn = screen.getByTestId('order-action-reject-ord-reserved-1');

      expect(startBtn).toBeInTheDocument();
      expect(rejectBtn).toBeInTheDocument();

      fireEvent.click(startBtn);
      expect(onStart).toHaveBeenCalledWith(reservedOrder);

      fireEvent.click(rejectBtn);
      expect(onReject).toHaveBeenCalledWith(reservedOrder);
    });

    it('handles keyboard navigation (Enter, Space) on start and reject buttons', () => {
      const onStart = vi.fn();
      const onReject = vi.fn();
      render(
        <OrderCard
          order={reservedOrder}
          onStartPreparation={onStart}
          onRejectSupplies={onReject}
        />,
      );

      const startBtn = screen.getByTestId('order-action-start-ord-reserved-1');
      const rejectBtn = screen.getByTestId('order-action-reject-ord-reserved-1');

      fireEvent.keyDown(startBtn, { key: 'Enter' });
      expect(onStart).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(startBtn, { key: ' ' });
      expect(onStart).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(startBtn, { key: 'Tab' });
      expect(onStart).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(rejectBtn, { key: 'Enter' });
      expect(onReject).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(rejectBtn, { key: ' ' });
      expect(onReject).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(rejectBtn, { key: 'Escape' });
      expect(onReject).toHaveBeenCalledTimes(2);
    });

    it('disables action buttons according to pendingAction state', () => {
      const { rerender } = render(
        <OrderCard order={reservedOrder} pendingAction="start" />,
      );
      expect(screen.getByTestId('order-action-start-ord-reserved-1')).toBeDisabled();
      expect(screen.getByTestId('order-action-reject-ord-reserved-1')).not.toBeDisabled();

      rerender(<OrderCard order={reservedOrder} pendingAction="reject" />);
      expect(screen.getByTestId('order-action-start-ord-reserved-1')).not.toBeDisabled();
      expect(screen.getByTestId('order-action-reject-ord-reserved-1')).toBeDisabled();
    });

    it('handles "Orden lista" button click, keyboard, and disabled states on IN_PREPARATION order', () => {
      const onReady = vi.fn();
      const inPrepOrder: Order = {
        ...reservedOrder,
        id: 'ord-inprep-ready-1',
        orderId: 'ord-inprep-ready-1',
        status: OrderStatus.IN_PREPARATION,
      };
      const { rerender } = render(
        <OrderCard order={inPrepOrder} onMarkOrderReady={onReady} />,
      );

      const readyBtn = screen.getByTestId('order-action-ready-ord-inprep-ready-1');
      expect(readyBtn).toBeInTheDocument();

      fireEvent.click(readyBtn);
      expect(onReady).toHaveBeenCalledWith(inPrepOrder);

      fireEvent.keyDown(readyBtn, { key: 'Enter' });
      expect(onReady).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(readyBtn, { key: ' ' });
      expect(onReady).toHaveBeenCalledTimes(3);
      fireEvent.keyDown(readyBtn, { key: 'ArrowRight' });
      expect(onReady).toHaveBeenCalledTimes(3);

      rerender(<OrderCard order={inPrepOrder} pendingAction="order-ready" />);
      expect(screen.getByTestId('order-action-ready-ord-inprep-ready-1')).toBeDisabled();
    });

    it('does not render "Comanda lista" button on RESERVED orders (anti-pattern prevention)', () => {
      render(<OrderCard order={reservedOrder} onMarkOrderReady={vi.fn()} />);
      expect(screen.queryByTestId('order-action-ready-ord-reserved-1')).not.toBeInTheDocument();
    });

    it('hides "Orden lista" button when order is DELIVERED, PAID, or CANCELLED', () => {
      const deliveredOrder: Order = { ...reservedOrder, status: OrderStatus.DELIVERED };
      const paidOrder: Order = { ...reservedOrder, status: OrderStatus.PAID };
      const cancelledOrder: Order = { ...reservedOrder, status: OrderStatus.CANCELLED };

      const { rerender } = render(<OrderCard order={deliveredOrder} />);
      expect(screen.queryByTestId('order-action-ready-ord-reserved-1')).not.toBeInTheDocument();

      rerender(<OrderCard order={paidOrder} />);
      expect(screen.queryByTestId('order-action-ready-ord-reserved-1')).not.toBeInTheDocument();

      rerender(<OrderCard order={cancelledOrder} />);
      expect(screen.queryByTestId('order-action-ready-ord-reserved-1')).not.toBeInTheDocument();
    });

    it('highlights redone item with amber alert and enables item action when order is DELIVERED (TASK-23, OP-12)', () => {
      const onItemReady = vi.fn();
      const deliveredRedoOrder: Order = {
        ...reservedOrder,
        status: OrderStatus.DELIVERED,
        items: [
          {
            id: 'dish-redo-1',
            name: 'Corte Asado',
            quantity: 1,
            unitPrice: 250,
            status: ItemStatus.PENDING,
          },
          {
            id: 'dish-delivered-2',
            name: 'Vino Tinto',
            quantity: 1,
            unitPrice: 120,
            status: ItemStatus.DELIVERED,
          },
        ],
      };

      render(<OrderCard order={deliveredRedoOrder} onItemReady={onItemReady} />);

      // Redone item is highlighted with alert badge and container styling
      const redoItem = screen.getByTestId('order-item-dish-redo-1');
      expect(redoItem).toHaveAttribute('data-redo-pending', 'true');
      expect(redoItem).toHaveClass('border-amber-400/70');
      expect(screen.getByTestId('redo-pending-dish-redo-1')).toHaveTextContent('Rehacer pendiente');

      // The redone PENDING item action is clickable to mark ready
      const redoBtn = screen.getByTestId('order-item-action-dish-redo-1');
      expect(redoBtn).toBeEnabled();
      fireEvent.click(redoBtn);
      expect(onItemReady).toHaveBeenCalledWith(deliveredRedoOrder, deliveredRedoOrder.items[0]);

      // The DELIVERED item action is disabled
      const deliveredBtn = screen.getByTestId('order-item-action-dish-delivered-2');
      expect(deliveredBtn).toBeDisabled();
    });

    it('handles item ready action on click and keyboard', () => {
      const onItemReady = vi.fn();
      render(<OrderCard order={reservedOrder} onItemReady={onItemReady} />);

      // Dish 1 is PENDING
      const item1Btn = screen.getByTestId('order-item-action-dish-1');
      fireEvent.click(item1Btn);
      expect(onItemReady).toHaveBeenCalledTimes(1);
      expect(onItemReady).toHaveBeenCalledWith(reservedOrder, reservedOrder.items[0]);

      fireEvent.keyDown(item1Btn, { key: 'Enter' });
      expect(onItemReady).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(item1Btn, { key: ' ' });
      expect(onItemReady).toHaveBeenCalledTimes(3);
      fireEvent.keyDown(item1Btn, { key: 'Tab' });
      expect(onItemReady).toHaveBeenCalledTimes(3);

      // Dish 2 is READY - should not trigger onItemReady
      const item2Btn = screen.getByTestId('order-item-action-dish-2');
      fireEvent.click(item2Btn);
      fireEvent.keyDown(item2Btn, { key: 'Enter' });
      fireEvent.keyDown(item2Btn, { key: ' ' });
      expect(onItemReady).toHaveBeenCalledTimes(3);
    });

    it('does not trigger onItemReady when clicking on dish notes, modifiers or name (User Requirement 4)', () => {
      const onItemReady = vi.fn();
      render(<OrderCard order={reservedOrder} onItemReady={onItemReady} />);

      const notesElement = screen.getByTestId('order-item-notes-dish-1');
      fireEvent.click(notesElement);
      expect(onItemReady).not.toHaveBeenCalled();

      const nameElement = screen.getByTestId('order-item-name-dish-1');
      fireEvent.click(nameElement);
      expect(onItemReady).not.toHaveBeenCalled();

      const modElement = screen.getByTestId('order-item-modifier-dish-1-0');
      fireEvent.click(modElement);
      expect(onItemReady).not.toHaveBeenCalled();
    });

    it('renders item safely when optional fields are omitted or pendingAction matches', () => {
      const minimalOrder: Order = {
        ...reservedOrder,
        id: undefined,
        orderId: undefined,
        publicId: undefined,
        items: [
          {
            id: undefined,
            itemId: undefined,
            publicId: undefined,
            name: 'Basic Bread',
            quantity: 1,
            unitPrice: 20,
            status: ItemStatus.PENDING,
          },
        ],
      };

      render(
        <OrderCard
          order={minimalOrder}
          pendingAction="item:0"
        />,
      );

      expect(screen.getByTestId('order-id-unknown')).toBeInTheDocument();
      expect(screen.getByTestId('order-item-item-0')).toBeInTheDocument();
    });

    it('does not throw when action callbacks are undefined and buttons are triggered', () => {
      const inPrepOrder: Order = { ...reservedOrder, status: OrderStatus.IN_PREPARATION };
      const { rerender } = render(<OrderCard order={reservedOrder} />);
      const startBtn = screen.getByTestId('order-action-start-ord-reserved-1');
      const rejectBtn = screen.getByTestId('order-action-reject-ord-reserved-1');
      const itemBtn = screen.getByTestId('order-item-action-dish-1');

      expect(() => {
        fireEvent.click(startBtn);
        fireEvent.keyDown(startBtn, { key: 'Enter' });
        fireEvent.click(rejectBtn);
        fireEvent.keyDown(rejectBtn, { key: 'Enter' });
        fireEvent.click(itemBtn);
        fireEvent.keyDown(itemBtn, { key: 'Enter' });
      }).not.toThrow();

      rerender(<OrderCard order={inPrepOrder} />);
      const readyBtn = screen.getByTestId('order-action-ready-ord-reserved-1');
      expect(() => {
        fireEvent.click(readyBtn);
        fireEvent.keyDown(readyBtn, { key: 'Enter' });
      }).not.toThrow();
    });

    it('renders orders with 10+ dishes compactly and toggles compact/expanded details per dish', () => {
      const manyItems = Array.from({ length: 10 }, (_, i) => ({
        id: `dish-id-${i}`,
        itemId: `dish-id-${i}`,
        name: `Platillo ${i + 1}`,
        quantity: 1,
        unitPrice: 100,
        status: ItemStatus.PENDING,
        modifiers: [`Extra ${i}`],
        notes: `Nota ${i}`,
        station: 'parrilla',
        version: 1,
      }));

      const largeOrder: Order = {
        ...reservedOrder,
        id: 'ord-large-10',
        orderId: 'ord-large-10',
        items: manyItems,
      };

      render(<OrderCard order={largeOrder} />);

      // On >= 5 dishes, dish notes are collapsed by default with per-dish toggle button
      const dish0Toggle = screen.getByTestId('order-item-toggle-details-dish-id-0');
      expect(dish0Toggle).toBeInTheDocument();
      expect(dish0Toggle).toHaveTextContent('Ver detalles');
      expect(screen.queryByTestId('order-item-notes-dish-id-0')).not.toBeInTheDocument();

      // Toggle to expanded view for dish 0
      fireEvent.click(dish0Toggle);
      expect(dish0Toggle).toHaveTextContent('Ocultar detalles');
      expect(screen.getByTestId('order-item-notes-dish-id-0')).toBeInTheDocument();

      // Toggle back to collapsed view
      fireEvent.click(dish0Toggle);
      expect(dish0Toggle).toHaveTextContent('Ver detalles');
      expect(screen.queryByTestId('order-item-notes-dish-id-0')).not.toBeInTheDocument();

      // All 10 items are rendered and reachable
      for (let i = 0; i < 10; i++) {
        expect(screen.getByTestId(`order-item-dish-id-${i}`)).toBeInTheDocument();
      }
    });

    it('handles admin and chef void button clicks and keyboard navigation (Enter/Space)', () => {
      const onAdminVoid = vi.fn();
      const onChefVoid = vi.fn();
      const inPrepOrder: Order = { ...reservedOrder, status: OrderStatus.IN_PREPARATION };

      const { rerender } = render(
        <OrderCard
          order={inPrepOrder}
          userRole="admin"
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );

      const adminBtn = screen.getByTestId('order-action-admin-void-ord-reserved-1');
      const chefBtn = screen.getByTestId('order-action-chef-void-ord-reserved-1');

      fireEvent.click(adminBtn);
      expect(onAdminVoid).toHaveBeenCalledWith(inPrepOrder);

      fireEvent.keyDown(adminBtn, { key: 'Enter' });
      expect(onAdminVoid).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(adminBtn, { key: ' ' });
      expect(onAdminVoid).toHaveBeenCalledTimes(3);

      fireEvent.click(chefBtn);
      expect(onChefVoid).toHaveBeenCalledWith(inPrepOrder);

      fireEvent.keyDown(chefBtn, { key: 'Enter' });
      expect(onChefVoid).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(chefBtn, { key: ' ' });
      expect(onChefVoid).toHaveBeenCalledTimes(3);

      // Verify disabled state with pendingAction
      rerender(
        <OrderCard
          order={inPrepOrder}
          userRole="admin"
          pendingAction="void-admin"
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.getByTestId('order-action-admin-void-ord-reserved-1')).toBeDisabled();
    });

    it('controls void button visibility by userRole', () => {
      const inPrepOrder: Order = { ...reservedOrder, status: OrderStatus.IN_PREPARATION };
      const onAdminVoid = vi.fn();
      const onChefVoid = vi.fn();

      // Chef role: sees chef void, not admin void
      const { rerender } = render(
        <OrderCard
          order={inPrepOrder}
          userRole="chef"
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.queryByTestId('order-action-admin-void-ord-reserved-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('order-action-chef-void-ord-reserved-1')).toBeInTheDocument();

      // Waiter role: sees neither
      rerender(
        <OrderCard
          order={inPrepOrder}
          userRole="waiter"
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.queryByTestId('order-action-admin-void-ord-reserved-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-action-chef-void-ord-reserved-1')).not.toBeInTheDocument();
    });

    it('triggers onStartPreparation when pressing Enter on header of a RESERVED order', () => {
      const onStartPrep = vi.fn();
      const onClick = vi.fn();

      render(
        <OrderCard
          order={reservedOrder}
          onStartPreparation={onStartPrep}
          onClick={onClick}
        />,
      );

      const headerStub = screen.getByTestId('order-card-stub-ord-reserved-1');
      fireEvent.keyDown(headerStub, { key: 'Enter' });
      expect(onStartPrep).toHaveBeenCalledWith(reservedOrder);
      expect(onClick).not.toHaveBeenCalled();

      // Non-reserved order triggers onClick
      fireEvent.click(headerStub);
      expect(onClick).toHaveBeenCalledWith(reservedOrder);
    });

    it('renders delivered order with frozen time when order.updatedAt is provided', () => {
      const deliveredWithTime: Order = {
        ...reservedOrder,
        status: OrderStatus.DELIVERED,
        items: reservedOrder.items.map((item) => ({ ...item, status: ItemStatus.READY })),
        updatedAt: new Date(Date.now() - 120 * 1000).toISOString(),
      };

      render(<OrderCard order={deliveredWithTime} />);
      const stopwatch = screen.getByTestId('order-stopwatch-ord-reserved-1');
      expect(stopwatch).toHaveAttribute('data-delay-status', 'on_time');
      expect(screen.getByTestId('order-delay-label-ord-reserved-1')).toHaveTextContent('Entregada');
    });
  });
});
