import type { MouseEvent, PointerEvent } from 'react';

export function pointerAction(action: () => void) {
  return {
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.dataset.pointerHandled = 'true';
      action();
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (event.currentTarget.dataset.pointerHandled === 'true') {
        delete event.currentTarget.dataset.pointerHandled;
        return;
      }
      action();
    },
  };
}
