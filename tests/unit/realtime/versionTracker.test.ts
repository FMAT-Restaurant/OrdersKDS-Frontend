import { beforeEach, describe, expect, it } from 'vitest';
import { VersionTracker, versionTracker } from '../../../src/shared/realtime/versionTracker.ts';

describe('UT-FE-24: VersionTracker Monotonic Concurrency Control', () => {
  let tracker: VersionTracker;

  beforeEach(() => {
    tracker = new VersionTracker();
  });

  it('exports a default singleton instance', () => {
    expect(versionTracker).toBeInstanceOf(VersionTracker);
  });

  it('accepts initial event and stores the version', () => {
    expect(tracker.shouldApply('order-1', 1)).toBe(true);
    expect(tracker.getVersion('order-1')).toBe(1);
  });

  it('accepts strictly monotonically increasing versions', () => {
    expect(tracker.shouldApply('order-1', 1)).toBe(true);
    expect(tracker.shouldApply('order-1', 2)).toBe(true);
    expect(tracker.shouldApply('order-1', 5)).toBe(true);
    expect(tracker.getVersion('order-1')).toBe(5);
  });

  it('discards duplicate versions (version <= knownVersion)', () => {
    expect(tracker.shouldApply('order-1', 2)).toBe(true);
    expect(tracker.shouldApply('order-1', 2)).toBe(false);
    expect(tracker.getVersion('order-1')).toBe(2);
  });

  it('discards out-of-order / late messages (version < knownVersion)', () => {
    expect(tracker.shouldApply('order-1', 4)).toBe(true);
    // Late arrival of version 2 or 3
    expect(tracker.shouldApply('order-1', 2)).toBe(false);
    expect(tracker.shouldApply('order-1', 3)).toBe(false);
    // Subsequent version 5 arrives and is accepted
    expect(tracker.shouldApply('order-1', 5)).toBe(true);
  });

  it('maintains isolated versions across different orders', () => {
    expect(tracker.shouldApply('order-A', 10)).toBe(true);
    expect(tracker.shouldApply('order-B', 2)).toBe(true);

    expect(tracker.shouldApply('order-A', 5)).toBe(false); // lower for A
    expect(tracker.shouldApply('order-B', 3)).toBe(true); // higher for B

    expect(tracker.getVersion('order-A')).toBe(10);
    expect(tracker.getVersion('order-B')).toBe(3);
  });

  it('updates version using setVersion only if greater than current', () => {
    tracker.setVersion('order-1', 3);
    expect(tracker.getVersion('order-1')).toBe(3);

    // Calling setVersion with lower or equal version does not overwrite
    tracker.setVersion('order-1', 2);
    expect(tracker.getVersion('order-1')).toBe(3);

    tracker.setVersion('order-1', 3);
    expect(tracker.getVersion('order-1')).toBe(3);

    tracker.setVersion('order-1', 7);
    expect(tracker.getVersion('order-1')).toBe(7);
  });

  it('evicts order from memory via remove()', () => {
    tracker.shouldApply('order-1', 3);
    expect(tracker.size).toBe(1);

    expect(tracker.remove('order-1')).toBe(true);
    expect(tracker.size).toBe(0);
    expect(tracker.getVersion('order-1')).toBeUndefined();

    // After removal, order-1 can be tracked anew
    expect(tracker.shouldApply('order-1', 1)).toBe(true);
  });

  it('clears all tracked versions via clear()', () => {
    tracker.shouldApply('order-1', 1);
    tracker.shouldApply('order-2', 2);
    expect(tracker.size).toBe(2);

    tracker.clear();
    expect(tracker.size).toBe(0);
  });
});
