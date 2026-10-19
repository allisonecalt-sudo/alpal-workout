// Bigger things kept on the phone (voice notes waiting to be sent, audio explanations already
// played) live in IndexedDB, because localStorage is too small for audio. Every call is wrapped:
// IndexedDB can be missing or blocked (private windows), and the app must still run without it.

const DB_NAME = 'alpal';
const DB_VERSION = 1;
export const STORE_NOTES = 'notes';
export const STORE_AUDIO = 'audio';

let opened: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opened ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NOTES)) {
          db.createObjectStore(STORE_NOTES, { keyPath: 'client_id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO)) db.createObjectStore(STORE_AUDIO);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run one request against one store; null when IndexedDB is unavailable or the call fails. */
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  make: (s: IDBObjectStore) => IDBRequest<T>
): Promise<{ value: T } | null> {
  const db = await open();
  if (!db) return null;
  try {
    const tx = db.transaction(store, mode);
    const value = await done(make(tx.objectStore(store)));
    return { value };
  } catch {
    return null;
  }
}

/** True when the value was stored. */
export async function idbPut(store: string, value: unknown, key?: string): Promise<boolean> {
  const r = await run(store, 'readwrite', (s) =>
    key === undefined ? s.put(value) : s.put(value, key)
  );
  return r !== null;
}

export async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const r = await run<unknown>(store, 'readonly', (s) => s.get(key));
  return r && r.value !== undefined ? (r.value as T) : null;
}

export async function idbAll<T>(store: string): Promise<T[]> {
  const r = await run<unknown[]>(store, 'readonly', (s) => s.getAll());
  return r ? (r.value as T[]) : [];
}

export async function idbDelete(store: string, key: string): Promise<void> {
  await run(store, 'readwrite', (s) => s.delete(key));
}

/** "Use a different code": nothing of the old person stays. */
export async function idbClearAll(): Promise<void> {
  await run(STORE_NOTES, 'readwrite', (s) => s.clear());
  await run(STORE_AUDIO, 'readwrite', (s) => s.clear());
}
