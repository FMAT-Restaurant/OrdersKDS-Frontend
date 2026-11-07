/**
 * Emits an audible chime (two-tone sine wave) when an order transitions to DELIVERED.
 * Fails gracefully if Web Audio API is unavailable, disabled, or blocked by autoplay policies.
 */
export function playReadyAlertChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    // Two-tone chime: F5 (698.46 Hz) transitioning to A5 (880.00 Hz)
    osc.frequency.setValueAtTime(698.46, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880.0, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch {
    // Gracefully ignore audio errors (e.g. autoplay policies or headless test environments)
  }
}

