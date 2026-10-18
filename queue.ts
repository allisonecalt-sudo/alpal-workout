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
 * Try to send every queued item, oldest first. It reads the CURRENT queue before each send and
 * removes only the item it just dealt with, so anything queued while a send is in flight is
 * kept (never write back a snapshot). It also picks up items queued during the flush.
 *  - network error: stop, the item stays queued;
 *  - ok:false with reason "locked" (the store's throttle): stop, the item stays queued;
 *  - any other ok:false: the store looked and said no, so drop it (retrying cannot help).
 */
export async function flushQueue(
  read: () => QueueItem[],
  write: (queue: QueueItem[]) => void,
  send: (item: QueueItem) => Promise<SaveResult>
): Promise<{ sent: number; dropped: number }> {
  const tried = new Set<string>();
  let sent = 0;
  let dropped = 0;
  for (;;) {
    const item = read().find((q) => !tried.has(q.client_id));
    if (!item) break;
    tried.add(item.client_id);
    let res: SaveResult;
    try {
      res = await send(item);
    } catch {
      break;
    }
    if (!res.ok && res.reason === 'locked') break;
    write(dequeue(read(), item.client_id));
    if (res.ok) sent += 1;
    else dropped += 1;
  }
  return { sent, dropped };
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
