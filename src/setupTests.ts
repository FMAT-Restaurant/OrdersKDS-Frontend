import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetPointerActionForTest } from './features/kds-board/pointerAction.ts';

beforeEach(() => {
  resetPointerActionForTest();
});
