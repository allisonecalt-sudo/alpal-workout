// THE ONLY FILE THAT TALKS TO THE STORE. The phone never reads a table: it calls two
// functions over /rest/v1/rpc/ with the public anon key, and the functions check the code.
// If the privacy design changes, this is the one file to change.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { parseGuest } from './program';
import { getCache, setCache } from './storage';
import type { GuestData, SaveResult, SessionPayload } from './types';

// The schema the two functions live in. Sent as a profile header only when it is not public.
const SCHEMA = 'public';

export class StoreError extends Error {}

// POST only, with the code in the JSON body: it must never appear in a URL (gateways log URLs).
async function rpc(fn: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  if (SCHEMA !== 'public') {
    headers['Content-Profile'] = SCHEMA;
    headers['Accept-Profile'] = SCHEMA;
  }
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new StoreError('network');
  }
  if (!res.ok) throw new StoreError(`status ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new StoreError('bad response');
  }
}

/**
 * Load everything for a code. Returns null when the store does not know the code.
 * Network-first: if the store cannot be reached, the last good copy is used (so the app
 * opens offline); with no copy it throws StoreError.
 */
export async function guestLoad(code: string): Promise<GuestData | null> {
  let raw: unknown;
  try {
    raw = await rpc('guest_load', { p_code: code });
  } catch (e) {
    const cached = getCache(code);
    if (cached) return parseGuest(cached);
    throw e;
  }
  if (raw === null || raw === undefined) return null;
  setCache(code, raw);
  return parseGuest(raw);
}

/** Send one finished session. Throws StoreError when offline (the caller queues it). */
export async function guestSaveSession(code: string, session: SessionPayload): Promise<SaveResult> {
  const raw = await rpc('guest_save_session', { p_code: code, p_session: session });
  if (typeof raw === 'object' && raw !== null && 'ok' in raw) {
    const r = raw as { ok: unknown; reason?: unknown };
    return { ok: r.ok === true, reason: typeof r.reason === 'string' ? r.reason : undefined };
  }
  return { ok: false, reason: 'bad response' };
}
