// Notes to Allison, the logic without any screen: what is waiting to be sent (kept in
// IndexedDB, because audio is too big for localStorage), sending, and the merged list.
import { idbAll, idbDelete, idbPut, STORE_NOTES } from './idb';
import { StoreError, guestSaveMessage } from './store';
import type { MessagePayload, NoteRow } from './types';

/** A note waiting on the phone: the payload plus when it was made. */
export interface QueuedNote extends MessagePayload {
  created_at: string;
}

/** A row of the "Your notes" list. */
export interface ListedNote {
  client_id: string;
  kind: 'voice' | 'text';
  created_at: string;
  duration_sec: number | null;
  text: string | null;
  status: 'got' | 'sent' | 'waiting';
}

/** What a send came to. */
export type SendOutcome = 'sent' | 'kept' | 'refused' | 'unsaved';

/** Waiting notes, light copies (no audio) for the screens, which draw synchronously. */
let waiting: ListedNote[] = [];
/** Notes sent during this visit, until the store's own list shows them. */
let sentHere: ListedNote[] = [];

function lite(n: QueuedNote | (MessagePayload & { created_at: string })): ListedNote {
  return {
    client_id: n.client_id,
    kind: n.kind,
    created_at: n.created_at,
    duration_sec: n.duration_sec ?? null,
    text: n.text ?? null,
    status: 'waiting',
  };
}

export function waitingCount(): number {
  return waiting.length;
}

/** Read the queue from IndexedDB into the light copy. */
export async function refreshWaiting(): Promise<number> {
  const all = await idbAll<QueuedNote>(STORE_NOTES);
  all.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  waiting = all.map(lite);
  return waiting.length;
}

export function forgetNotes(): void {
  waiting = [];
  sentHere = [];
}

function payloadOf(n: QueuedNote): MessagePayload {
  const rest: MessagePayload & { created_at?: string } = { ...n };
  delete rest.created_at;
  return rest;
}

/**
 * Send one note. 'sent' = the store took it; 'kept' = it could not be reached (or the store is
 * throttling), so it waits on the phone; 'refused' = the store said no and retrying cannot help;
 * 'unsaved' = it could not be sent AND the phone could not keep it (the caller keeps it open).
 */
export async function sendNote(code: string, note: QueuedNote): Promise<SendOutcome> {
  let outcome: SendOutcome;
  try {
    const res = await guestSaveMessage(code, payloadOf(note));
    if (res.ok) outcome = 'sent';
    else outcome = res.reason === 'locked' ? 'kept' : 'refused';
  } catch (e) {
    if (!(e instanceof StoreError)) throw e;
    outcome = 'kept';
  }
  if (outcome === 'sent') {
    sentHere = [{ ...lite(note), status: 'sent' }, ...sentHere];
    return 'sent';
  }
  if (outcome === 'refused') return 'refused';
  if (!(await idbPut(STORE_NOTES, note))) return 'unsaved';
  waiting = [...waiting.filter((w) => w.client_id !== note.client_id), lite(note)];
  return 'kept';
}

/**
 * Send what is waiting, oldest first. Stops at the first note that could not be reached or is
 * held back by the throttle (it stays). A note the store refuses is dropped.
 */
export async function flushNotes(code: string): Promise<{ sent: number; dropped: number }> {
  const all = await idbAll<QueuedNote>(STORE_NOTES);
  all.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let sent = 0;
  let dropped = 0;
  for (const note of all) {
    let res;
    try {
      res = await guestSaveMessage(code, payloadOf(note));
    } catch {
      break;
    }
    if (!res.ok && res.reason === 'locked') break;
    await idbDelete(STORE_NOTES, note.client_id);
    waiting = waiting.filter((w) => w.client_id !== note.client_id);
    if (res.ok) {
      sent += 1;
      sentHere = [{ ...lite(note), status: 'sent' }, ...sentHere];
    } else dropped += 1;
  }
  return { sent, dropped };
}

/** The list: waiting ones, then what the store has (plus this visit's), newest first. */
export function listNotes(stored: NoteRow[]): ListedNote[] {
  const have = new Set(stored.map((m) => m.client_id));
  const fromStore: ListedNote[] = stored.map((m) => ({
    client_id: m.client_id,
    kind: m.kind,
    created_at: m.created_at,
    duration_sec: m.duration_sec,
    text: m.text,
    status: m.read ? 'got' : 'sent',
  }));
  const here = sentHere.filter((s) => !have.has(s.client_id));
  const queued = waiting.filter((w) => !have.has(w.client_id));
  return [...queued, ...here, ...fromStore].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

/** Seconds as 1:12. */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The base64 of a recording, without the data: prefix. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result);
      resolve(text.slice(text.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
