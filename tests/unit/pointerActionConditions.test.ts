import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent, PointerEvent } from 'react';
import {
  pointerAction,
  resetPointerActionForTest,
} from '../../src/features/kds-board/pointerAction.ts';
import { getItemKey } from '../../src/features/kds-board/orderNumberDisplay.ts';

describe('pointerAction and orderNumberDisplay branch coverage', () => {
  beforeEach(() => {
    resetPointerActionForTest();
  });

  describe('pointerAction edge cases', () => {
    it('ignores onPointerUp for mouse events with secondary/tertiary buttons', () => {
      const action = vi.fn();
      const handlers = pointerAction(action);
      const target = document.createElement('button');

      const mockRightClick = {
        button: 2,
        pointerType: 'mouse',
        currentTarget: target,
      } as unknown as PointerEvent<HTMLElement>;

      handlers.onPointerUp(mockRightClick);

      expect(action).not.toHaveBeenCalled();
      expect(target.dataset.pointerHandled).toBeUndefined();
    });

    it('processes onPointerUp for non-mouse events even with non-zero button', () => {
      const action = vi.fn();
      const handlers = pointerAction(action);
      const target = document.createElement('button');

      const mockTouchPointer = {
        button: 1,
        pointerType: 'touch',
        currentTarget: target,
      } as unknown as PointerEvent<HTMLElement>;

      handlers.onPointerUp(mockTouchPointer);

      expect(action).toHaveBeenCalledTimes(1);
      expect(target.dataset.pointerHandled).toBe('true');
    });

    it('triggers onClick if more than 400ms have elapsed since last pointer event', () => {
      vi.useFakeTimers();
      const actionA = vi.fn();
      const handlersA = pointerAction(actionA);
      const targetA = document.createElement('button');

      handlersA.onPointerUp({
        button: 0,
        pointerType: 'mouse',
        currentTarget: targetA,
      } as unknown as PointerEvent<HTMLElement>);

      expect(actionA).toHaveBeenCalledTimes(1);

      // Fast-forward past the 400ms debounce threshold
      vi.advanceTimersByTime(450);

      const actionB = vi.fn();
      const handlersB = pointerAction(actionB);
      const targetB = document.createElement('button');

      handlersB.onClick({
        currentTarget: targetB,
      } as unknown as MouseEvent<HTMLElement>);

      expect(actionB).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('getItemKey fallbacks', () => {
    it('returns fallback indexed item key when id, itemId, and publicId are absent', () => {
      const emptyItem = {} as unknown as Parameters<typeof getItemKey>[0];
      expect(getItemKey(emptyItem, 4)).toBe('item-4');
    });

    it('returns empty string when id is absent and fallbackIndex is omitted', () => {
      const emptyItem = {} as unknown as Parameters<typeof getItemKey>[0];
      expect(getItemKey(emptyItem)).toBe('');
    });
  });
});

