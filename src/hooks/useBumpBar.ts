import { useEffect, useRef } from 'react';
import { BUMP_BAR_KEY_MAP } from '../constants/bumpBarKeyMap';

export type BumpBarActionHandler = (action: string) => void;

/**
 * Custom hook to listen for global Bump Bar keydown events on `window`.
 *
 * Evaluates `event.code` (never `event.key`) against `BUMP_BAR_KEY_MAP`.
 * If `event.code` matches an action:
 * - Calls `event.preventDefault()` to prevent default browser behavior
 * - Dispatches the corresponding action via `onAction`
 * Otherwise, the event is ignored.
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
