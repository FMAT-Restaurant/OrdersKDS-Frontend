import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playReadyAlertChime } from '../../src/features/ready-orders-alert/chime.ts';

describe('playReadyAlertChime', () => {
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.AudioContext = originalAudioContext;
  });

  it('silently returns when AudioContext is unavailable in the environment', () => {
    // @ts-expect-error test environment override
    window.AudioContext = undefined;

    expect(() => playReadyAlertChime()).not.toThrow();
  });

  it('synthesizes two-tone chime when AudioContext is available', () => {
    const setValueAtTimeMock = vi.fn();
    const exponentialRampToValueAtTimeMock = vi.fn();
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const connectMock = vi.fn();

    const mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: setValueAtTimeMock,
      },
      connect: connectMock,
      start: startMock,
      stop: stopMock,
    };

    const mockGain = {
      gain: {
        setValueAtTime: setValueAtTimeMock,
        exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
      },
      connect: connectMock,
    };

    const mockAudioContextInstance = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
    };

    const MockAudioContext = vi.fn(function () {
      return mockAudioContextInstance;
    });

    // @ts-expect-error test mock
    window.AudioContext = MockAudioContext;

    playReadyAlertChime();

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
    expect(mockAudioContextInstance.createOscillator).toHaveBeenCalledTimes(1);
    expect(mockAudioContextInstance.createGain).toHaveBeenCalledTimes(1);
    expect(setValueAtTimeMock).toHaveBeenCalledWith(698.46, 10);
    expect(setValueAtTimeMock).toHaveBeenCalledWith(880.0, 10.1);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledWith(10.35);
  });

  it('catches and suppresses any audio context instantiation errors', () => {
    const FailingAudioContext = vi.fn(function () {
      throw new Error('NotAllowedError: play() failed because the user didn\'t interact');
    });

    // @ts-expect-error test mock
    window.AudioContext = FailingAudioContext;

    expect(() => playReadyAlertChime()).not.toThrow();
  });
});

