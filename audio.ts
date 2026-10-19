// One sound at a time: the one audio element the app ever plays (a recording being checked, or
// an explanation of a move). Starting a new one stops the old one.

let current: HTMLAudioElement | null = null;

/** Make the element for a new sound, stopping whatever played before. The caller plays it. */
export function startAudio(url: string): HTMLAudioElement {
  stopAudio();
  const el = new Audio(url);
  el.preload = 'auto';
  current = el;
  return el;
}

/**
 * A real clip of silence: 0.3 s, mono, 22 kHz MP3 (591 bytes), made with ffmpeg. It is played
 * inside the tap so the phone lets this element play the real explanation once it has arrived.
 */
export const SILENT_CLIP =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYyLjEyLjEwMQAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAADgAAAiIAYWFhYWFhYW1tbW1tbW15eXl5eXl5hoaGhoaGhpKSkpKSkpKenp6enp6eqqqqqqqqqra2tra2tra2w8PDw8PDw8/Pz8/Pz8/b29vb29vb5+fn5+fn5/Pz8/Pz8/P/////////AAAAAExhdmM2Mi4yOAAAAAAAAAAAAAAAACQDaQAAAAAAAAIiRvTq9AAAAAAAAAAAAAAAAAD/8xDEAAAAA0gAAAAATEFNRTMuMTAwVVVVVf/zEMQNAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxBoAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEJwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMQ0AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxEEAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDETgAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMRbAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxGgAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEdQAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSCAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxI8AAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEnAAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSpAAADSAAAAABVVVVVVVVVVVVVVVVV';

/** Is this still the sound the app is playing (not stopped or replaced meanwhile)? */
export function isCurrentAudio(el: HTMLAudioElement): boolean {
  return current === el;
}

/** Stop and let go of the current sound (leaving a move, closing a sheet). */
export function stopAudio(): void {
  const el = current;
  current = null;
  if (!el) return;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch {
    /* already gone */
  }
}

/** Stop this sound, but only if it is still the one playing. */
export function stopAudioIf(el: HTMLAudioElement): void {
  if (current === el) stopAudio();
}

/** Pause only (starting a recording): it can be played again. */
export function pauseAudio(): void {
  try {
    current?.pause();
  } catch {
    /* nothing to pause */
  }
}
