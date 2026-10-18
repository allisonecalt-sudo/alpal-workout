// Phone features that may or may not exist: beep, voice, keep-awake. Each one is silently
// skipped when unsupported or blocked.

let audioCtx: AudioContext | null = null;

/** Call from a tap, so iOS lets the beep play later. */
export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* no audio */
  }
}

/** A soft double beep. */
export function beep(): void {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (const offset of [0, 0.25]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.22);
    }
  } catch {
    /* no audio */
  }
}

export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* no voice */
  }
}

export function stopSpeaking(): void {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    /* no voice */
  }
}

let lock: WakeLockSentinel | null = null;
let wantLock = false;

async function requestLock(): Promise<void> {
  try {
    if (!wantLock || lock || !navigator.wakeLock) return;
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    /* not available: skip quietly */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void requestLock();
});

export function keepAwake(): void {
  wantLock = true;
  void requestLock();
}

export function releaseAwake(): void {
  wantLock = false;
  const l = lock;
  lock = null;
  try {
    void l?.release();
  } catch {
    /* already released */
  }
}
