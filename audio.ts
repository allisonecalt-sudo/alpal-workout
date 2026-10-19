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

/** Pause only (starting a recording): it can be played again. */
export function pauseAudio(): void {
  try {
    current?.pause();
  } catch {
    /* nothing to pause */
  }
}
