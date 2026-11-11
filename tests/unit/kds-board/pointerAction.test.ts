import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent, PointerEvent } from 'react';
import {
  pointerAction,
  resetPointerActionForTest,
} from '../../../src/features/kds-board/pointerAction.ts';

describe('pointerAction helper', () => {
  beforeEach(() => {
    resetPointerActionForTest();
  });

  it('triggers action on onPointerUp and sets dataset flag', () => {
    const action = vi.fn();
    const handlers = pointerAction(action);

    const target = document.createElement('button');
    const mockPointerEvent = {
      button: 0,
      pointerType: 'touch',
      currentTarget: target,
    } as unknown as PointerEvent<HTMLElement>;

    handlers.onPointerUp(mockPointerEvent);

    expect(action).toHaveBeenCalledTimes(1);
    expect(target.dataset.pointerHandled).toBe('true');
  });

  it('prevents duplicate action on onClick if pointer was already handled on the same element', () => {
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

  it('suppresses ghost click on a newly mounted element when pointer was handled recently (< 400ms)', () => {
    const actionA = vi.fn();
    const handlersA = pointerAction(actionA);
    const targetA = document.createElement('button');
    const mockPointerEventA = {
      button: 0,
      pointerType: 'mouse',
      currentTarget: targetA,
    } as unknown as PointerEvent<HTMLElement>;

    // Button A handled pointerup (e.g. "Comanda lista")
    handlersA.onPointerUp(mockPointerEventA);
    expect(actionA).toHaveBeenCalledTimes(1);

    // React swaps to Button B (e.g. "Deshacer"), browser dispatches click onto Button B
    const actionB = vi.fn();
    const handlersB = pointerAction(actionB);
    const targetB = document.createElement('button');
    const mockMouseEventB = {
      currentTarget: targetB,
    } as unknown as MouseEvent<HTMLElement>;

    handlersB.onClick(mockMouseEventB);

    // Button B's onClick must be suppressed to avoid immediate unintended action
    expect(actionB).not.toHaveBeenCalled();
  });

  it('triggers action on onClick if pointer was not handled (e.g. keyboard click or synthetic click)', () => {
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
