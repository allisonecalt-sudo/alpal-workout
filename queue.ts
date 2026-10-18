// Offline queue of finished sessions and answered questions. Each has a client_id made on the phone, so a retry
// never duplicates (the store ignores a client_id it already has).
import type { QueueItem, SaveResult } from './types';

export function enqueue(queue: QueueItem[], s: QueueItem): QueueItem[] {
  return queue.some((q) => q.client_id === s.client_id) ? queue : [...queue, s];
}

export function dequeue(queue: QueueItem[], clientId: string): QueueItem[] {
  return queue.filter((q) => q.client_id !== clientId);
}

/**
 * Try to send every queued item, oldest first. Stops at the first failure so order is
 * kept. A network error keeps the item queued. An answer of ok:false (the store looked
 * and said no) drops it, because retrying cannot help; those are counted in `dropped`.
 */
export async function flushQueue(
  queue: QueueItem[],
  send: (s: QueueItem) => Promise<SaveResult>,
  onChange?: (remaining: QueueItem[]) => void
): Promise<{ remaining: QueueItem[]; sent: number; dropped: number }> {
  let remaining = queue;
  let sent = 0;
  let dropped = 0;
  for (const s of queue) {
    let res: SaveResult;
    try {
      res = await send(s);
    } catch {
      break;
    }
    remaining = dequeue(remaining, s.client_id);
    if (res.ok) sent += 1;
    else dropped += 1;
    onChange?.(remaining);
  }
  return { remaining, sent, dropped };
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
