import { useEffect, useRef } from 'react';
import { BUMP_BAR_KEY_MAP } from '../constants/bumpBarKeyMap';

export type BumpBarActionHandler = (action: string) => void;

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  ) {
    return true;
  }
  return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}

/**
 * Custom hook to listen for global Bump Bar keydown events on `window`.
 *
 * Evaluates `event.code` (never `event.key`) against `BUMP_BAR_KEY_MAP`.
 * Ignores keystrokes originating from editable form fields so native keys
 * such as Backspace, Enter, and digits work normally while typing.
 *
 * @param onAction - Callback dispatched with the mapped action when a recognized key is pressed.
 */
export function useBumpBar(onAction: BumpBarActionHandler): void {
  const onActionRef = useRef<BumpBarActionHandler>(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableEventTarget(event.target)) {
        return;
      }
      const action = BUMP_BAR_KEY_MAP[event.code];
      if (action) {
        event.preventDefault();
        onActionRef.current(action);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
