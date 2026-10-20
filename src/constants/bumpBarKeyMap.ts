/**
 * Mapping of Bump Bar physical keys (represented by KeyboardEvent.code)
 * to domain actions in the Kitchen Display System (KDS).
 *
 * Using `KeyboardEvent.code` ensures consistency across physical keyboards,
 * numeric keypads, and specialized hardware bump bars regardless of layout
 * or modifier state.
 */
export const BUMP_BAR_KEY_MAP: Record<string, string> = {
  ArrowLeft: 'FOCUS_PREVIOUS_ORDER',
  ArrowRight: 'FOCUS_NEXT_ORDER',
  ArrowUp: 'FOCUS_PREVIOUS_ITEM',
  ArrowDown: 'FOCUS_NEXT_ITEM',
  Enter: 'MARK_FOCUSED_ITEM_READY',
  NumpadEnter: 'MARK_FOCUSED_ORDER_READY',
  Backspace: 'UNDO_LAST_READY',
  PageUp: 'PREVIOUS_STATION',
  PageDown: 'NEXT_STATION',
  Digit1: 'FOCUS_ORDER_BY_POSITION_1',
  Digit2: 'FOCUS_ORDER_BY_POSITION_2',
  Digit3: 'FOCUS_ORDER_BY_POSITION_3',
  Digit4: 'FOCUS_ORDER_BY_POSITION_4',
  Digit5: 'FOCUS_ORDER_BY_POSITION_5',
  Digit6: 'FOCUS_ORDER_BY_POSITION_6',
  Digit7: 'FOCUS_ORDER_BY_POSITION_7',
  Digit8: 'FOCUS_ORDER_BY_POSITION_8',
  Digit9: 'FOCUS_ORDER_BY_POSITION_9',
};
