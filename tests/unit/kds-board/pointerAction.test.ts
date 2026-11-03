import { describe, expect, it, vi } from 'vitest';
import type { MouseEvent, PointerEvent } from 'react';
import { pointerAction } from '../../../src/features/kds-board/pointerAction.ts';

describe('pointerAction helper', () => {
  it('triggers action on onPointerUp and sets dataset flag', () => {
    const action = vi.fn();
    const handlers = pointerAction(action);

    const target = document.createElement('button');
    const mockPointerEvent = {
      currentTarget: target,
    } as unknown as PointerEvent<HTMLElement>;

    handlers.onPointerUp(mockPointerEvent);

    expect(action).toHaveBeenCalledTimes(1);
    expect(target.dataset.pointerHandled).toBe('true');
  });

  it('prevents duplicate action on onClick if pointer was already handled', () => {
    const action = vi.fn();
    const handlers = pointerAction(action);

    const target = document.createElement('button');
    target.dataset.pointerHandled = 'true';

    const mockMouseEvent = {
      currentTarget: target,
    } as unknown as MouseEvent<HTMLElement>;

    handlers.onClick(mockMouseEvent);

    expect(action).not.toHaveBeenCalled();
    expect(target.dataset.pointerHandled).toBeUndefined();
  });

  it('triggers action on onClick if pointer was not handled (e.g. desktop mouse click)', () => {
    const action = vi.fn();
    const handlers = pointerAction(action);

    const target = document.createElement('button');

    const mockMouseEvent = {
      currentTarget: target,
    } as unknown as MouseEvent<HTMLElement>;

    handlers.onClick(mockMouseEvent);

    expect(action).toHaveBeenCalledTimes(1);
  });
});
