import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUMP_BAR_KEY_MAP } from '../constants/bumpBarKeyMap';
import { useBumpBar } from './useBumpBar';

describe('useBumpBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Isolated Enter vs NumpadEnter actions (CRITICAL)', () => {
    it('dispatches MARK_FOCUSED_ITEM_READY for Enter and NOT MARK_FOCUSED_ORDER_READY', () => {
      const onAction = vi.fn();
      renderHook(() => useBumpBar(onAction));

      const event = new KeyboardEvent('keydown', { code: 'Enter', cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('MARK_FOCUSED_ITEM_READY');
      expect(onAction).not.toHaveBeenCalledWith('MARK_FOCUSED_ORDER_READY');
      expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches MARK_FOCUSED_ORDER_READY for NumpadEnter and NOT MARK_FOCUSED_ITEM_READY', () => {
      const onAction = vi.fn();
      renderHook(() => useBumpBar(onAction));

      const event = new KeyboardEvent('keydown', { code: 'NumpadEnter', cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      window.dispatchEvent(event);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('MARK_FOCUSED_ORDER_READY');
      expect(onAction).not.toHaveBeenCalledWith('MARK_FOCUSED_ITEM_READY');
      expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    });

    it('proves that Enter and NumpadEnter trigger distinctly different actions', () => {
      const actionsDispatched: string[] = [];
      const onAction = vi.fn((action: string) => {
        actionsDispatched.push(action);
      });

      renderHook(() => useBumpBar(onAction));

      fireEvent.keyDown(window, { code: 'Enter' });
      fireEvent.keyDown(window, { code: 'NumpadEnter' });

      expect(actionsDispatched).toHaveLength(2);
      expect(actionsDispatched[0]).toBe('MARK_FOCUSED_ITEM_READY');
      expect(actionsDispatched[1]).toBe('MARK_FOCUSED_ORDER_READY');
      expect(actionsDispatched[0]).not.toBe(actionsDispatched[1]);
    });
  });

  describe('Complete BUMP_BAR_KEY_MAP entries iteration', () => {
    it('dispatches correct action and calls preventDefault for every key in BUMP_BAR_KEY_MAP', () => {
      const onAction = vi.fn();
      renderHook(() => useBumpBar(onAction));

      const entries = Object.entries(BUMP_BAR_KEY_MAP);
      expect(entries.length).toBeGreaterThan(0);

      entries.forEach(([key, expectedAction], index) => {
        const wasAllowed = fireEvent.keyDown(window, { code: key });

        // fireEvent returns false when event.preventDefault() was invoked on a cancelable event
        expect(wasAllowed).toBe(false);
        expect(onAction).toHaveBeenCalledTimes(index + 1);
        expect(onAction).toHaveBeenLastCalledWith(expectedAction);
      });
    });
  });

  describe('Unmapped keys and branch coverage', () => {
    it('ignores keys that are not registered in BUMP_BAR_KEY_MAP', () => {
      const onAction = vi.fn();
      renderHook(() => useBumpBar(onAction));

      const unmappedCodes = ['KeyA', 'Space', 'Escape', 'Tab', 'ShiftLeft', ''];

      unmappedCodes.forEach((code) => {
        const wasAllowed = fireEvent.keyDown(window, { code });
        expect(wasAllowed).toBe(true);
      });

      expect(onAction).not.toHaveBeenCalled();
    });

    it('strictly evaluates event.code and ignores event.key', () => {
      const onAction = vi.fn();
      renderHook(() => useBumpBar(onAction));

      // 1. event.key is 'Enter' but event.code is 'KeyA' (unmapped) -> must be ignored
      const ignoredAllowed = fireEvent.keyDown(window, { key: 'Enter', code: 'KeyA' });
      expect(ignoredAllowed).toBe(true);
      expect(onAction).not.toHaveBeenCalled();

      // 2. event.key is something else, but event.code is 'Enter' -> must be dispatched
      const handledAllowed = fireEvent.keyDown(window, { key: 'CustomLabel', code: 'Enter' });
      expect(handledAllowed).toBe(false);
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('MARK_FOCUSED_ITEM_READY');
    });

    it('unregisters keydown listener when unmounted to prevent leaks', () => {
      const onAction = vi.fn();
      const { unmount } = renderHook(() => useBumpBar(onAction));

      unmount();

      fireEvent.keyDown(window, { code: 'Enter' });
      fireEvent.keyDown(window, { code: 'NumpadEnter' });

      expect(onAction).not.toHaveBeenCalled();
    });

    it('invokes updated callback without re-binding listener when callback identity changes', () => {
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();

      const { rerender } = renderHook(
        ({ callback }) => useBumpBar(callback),
        { initialProps: { callback: firstCallback } },
      );

      fireEvent.keyDown(window, { code: 'ArrowLeft' });
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(firstCallback).toHaveBeenCalledWith('FOCUS_PREVIOUS_ORDER');
      expect(secondCallback).not.toHaveBeenCalled();

      rerender({ callback: secondCallback });

      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledWith('FOCUS_NEXT_ORDER');
    });
  });
});
