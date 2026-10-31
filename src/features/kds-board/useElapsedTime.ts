import { useEffect, useState } from 'react';

/**
 * Semáforo delay states according to TASK-15 specifications.
 */
export type DelayStatus = 'on_time' | 'warning' | 'late';

export interface DelayInfo {
  readonly delayStatus: DelayStatus;
  readonly delayLabel: 'En tiempo' | 'Por atrasarse' | 'Atrasada';
  readonly delayColorToken: 'var(--color-success)' | 'var(--color-warning)' | 'var(--color-error)';
}

export interface ElapsedTimeResult extends DelayInfo {
  readonly elapsedSeconds: number;
  readonly formattedTime: string;
}

export interface UseElapsedTimeOptions {
  readonly warningAfterSeconds?: number;
  readonly lateAfterSeconds?: number;
}

/**
 * Resolves warning and late threshold seconds from env vars or custom parameters.
 * Defaults: warning = 600s (10 min), late = 900s (15 min).
 */
export function getDelayThresholds(
  customWarning?: number,
  customLate?: number,
): { readonly warningSeconds: number; readonly lateSeconds: number } {
  const envWarning = Number(import.meta.env?.VITE_KDS_WARNING_AFTER_SECONDS);
  const envLate = Number(import.meta.env?.VITE_KDS_LATE_AFTER_SECONDS);

  let warningSeconds = 600;
  if (customWarning !== undefined && Number.isFinite(customWarning) && customWarning > 0) {
    warningSeconds = customWarning;
  } else if (Number.isFinite(envWarning) && envWarning > 0) {
    warningSeconds = envWarning;
  }

  let lateSeconds = 900;
  if (customLate !== undefined && Number.isFinite(customLate) && customLate > 0) {
    lateSeconds = customLate;
  } else if (Number.isFinite(envLate) && envLate > 0) {
    lateSeconds = envLate;
  }

  return { warningSeconds, lateSeconds };
}

/**
 * Formats seconds into mm:ss or hh:mm:ss string.
 */
export function formatElapsedTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (val: number) => val.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Maps elapsed seconds to 3 visual states (En tiempo, Por atrasarse, Atrasada)
 * and semantic color tokens (TASK-C08).
 */
export function computeDelayInfo(
  elapsedSeconds: number,
  warningThreshold = 600,
  lateThreshold = 900,
): DelayInfo {
  if (elapsedSeconds < warningThreshold) {
    return {
      delayStatus: 'on_time',
      delayLabel: 'En tiempo',
      delayColorToken: 'var(--color-success)',
    };
  }

  if (elapsedSeconds < lateThreshold) {
    return {
      delayStatus: 'warning',
      delayLabel: 'Por atrasarse',
      delayColorToken: 'var(--color-warning)',
    };
  }

  return {
    delayStatus: 'late',
    delayLabel: 'Atrasada',
    delayColorToken: 'var(--color-error)',
  };
}

/**
 * Hook to manage live elapsed time calculation starting strictly from `in_preparation_at` (OP-11).
 * Never uses `createdAt`.
 * Updates every 1000ms.
 */
export function useElapsedTime(
  inPreparationAt?: string | null,
  options?: Readonly<UseElapsedTimeOptions>,
): ElapsedTimeResult {
  const { warningSeconds, lateSeconds } = getDelayThresholds(
    options?.warningAfterSeconds,
    options?.lateAfterSeconds,
  );

  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!inPreparationAt) {
      return;
    }

    const timerId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [inPreparationAt]);

  const prepTimeMs = inPreparationAt ? new Date(inPreparationAt).getTime() : Number.NaN;
  const isInvalidPrep = !inPreparationAt || Number.isNaN(prepTimeMs);

  const elapsedSeconds = isInvalidPrep
    ? 0
    : Math.max(0, Math.floor((currentTime - prepTimeMs) / 1000));

  const formattedTime = formatElapsedTime(elapsedSeconds);
  const delayInfo = computeDelayInfo(elapsedSeconds, warningSeconds, lateSeconds);

  return {
    elapsedSeconds,
    formattedTime,
    ...delayInfo,
  };
}
