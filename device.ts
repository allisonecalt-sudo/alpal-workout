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

/** One soft tone. Everything is created from the first tap (unlockAudio), as iOS needs. */
function tone(freq: number, startAfter: number, length: number, volume: number): void {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + startAfter;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  } catch {
    /* no audio */
  }
}

/** The count beep: the last 3 seconds of a get-ready or a hold. */
export const TICK_HZ = 660;
/** The go beep: the hold begins. */
export const GO_HZ = 990;
/** The finish chime: two soft notes. */
export const CHIME_HZ = 523;

export function tick(): void {
  tone(TICK_HZ, 0, 0.12, 0.12);
}

export function goBeep(): void {
  tone(GO_HZ, 0, 0.3, 0.15);
}

export function chime(): void {
  tone(CHIME_HZ, 0, 0.25, 0.15);
  tone(CHIME_HZ * 1.5, 0.28, 0.4, 0.15);
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
