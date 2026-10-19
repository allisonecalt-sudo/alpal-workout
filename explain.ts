// The spoken explanation of a move ("Hear how"): fetched once, kept in IndexedDB, so it plays
// offline after the first time. The cache key is the move name plus the program's audioVersion.
import { STORE_AUDIO, idbGet, idbPut } from './idb';
import { guestGetAudio } from './store';

export type ExplainResult = { kind: 'ok'; url: string } | { kind: 'missing' } | { kind: 'offline' };

interface Cached {
  mime: string;
  b64: string;
}

/** Moves the store said have no audio: their button is hidden for the rest of this visit. */
const missing = new Set<string>();

export function isMissing(name: string): boolean {
  return missing.has(name);
}

/** Forget what this visit learned (a different code). */
export function forgetMissing(): void {
  missing.clear();
}

let lastUrl: string | null = null;

function urlOf(c: Cached): string {
  const bytes = atob(c.b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  if (lastUrl !== null) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(new Blob([arr], { type: c.mime }));
  return lastUrl;
}

/** The sound of one move: from the phone if it is there, else from the store (then kept). */
export async function loadExplanation(
  code: string,
  name: string,
  version: string
): Promise<ExplainResult> {
  const key = `${name}|${version}`;
  const hit = await idbGet<Cached>(STORE_AUDIO, key);
  if (hit) return { kind: 'ok', url: urlOf(hit) };
  const reply = await guestGetAudio(code, name).catch(() => null);
  if (reply === null || reply.kind === 'locked' || reply.kind === 'unknown') {
    return { kind: 'offline' };
  }
  if (reply.kind === 'missing') {
    missing.add(name);
    return { kind: 'missing' };
  }
  const cached: Cached = { mime: reply.mime, b64: reply.b64 };
  await idbPut(STORE_AUDIO, cached, key);
  return { kind: 'ok', url: urlOf(cached) };
}

/** Where the code and the audio version come from (set by the app shell). */
let source: () => { code: string; version: string } = () => ({ code: '', version: '' });

export function setExplainSource(fn: () => { code: string; version: string }): void {
  source = fn;
}

export function explainSource(): { code: string; version: string } {
  return source();
}
