import type { MouseEvent, PointerEvent } from 'react';

let lastPointerHandledTime = 0;

export function resetPointerActionForTest() {
  lastPointerHandledTime = 0;
}

export function pointerAction(action: () => void) {
  return {
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.currentTarget.dataset.pointerHandled = 'true';
      lastPointerHandledTime = Date.now();
      action();
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const wasLocalHandled = event.currentTarget.dataset.pointerHandled === 'true';
      delete event.currentTarget.dataset.pointerHandled;
      // Suppress ghost click dispatched after pointerup on an element that unmounted/swapped
      if (
        wasLocalHandled ||
        (lastPointerHandledTime > 0 && Date.now() - lastPointerHandledTime < 400)
      ) {
        return;
      }
      action();
    },
  };
}
