import { expect, test } from '@playwright/test';
import { dequeue, enqueue, flushQueue } from '../queue';
import { isAnswer, type QueueItem, type SessionPayload } from '../types';

function session(id: string): SessionPayload {
  return {
    client_id: id,
    done_at: '2026-10-18T10:00:00.000Z',
    week: 1,
    workout: 'A',
    moves: [{ name: 'Move one', part: 'main', round: 1, status: 'done' }],
    feel: null,
    check_0_10: null,
    note: null,
  };
}

test('enqueue never adds the same client_id twice', () => {
  const q = enqueue(enqueue([], session('a')), session('a'));
  expect(q.map((s) => s.client_id)).toEqual(['a']);
});

test('a session and an answer can wait in the same queue', () => {
  const answer = { client_id: 'q', question_id: 'q1', answer: 'text' };
  const q = enqueue([session('a')], answer);
  expect(q).toHaveLength(2);
  expect(isAnswer(q[1])).toBe(true);
  expect(isAnswer(q[0])).toBe(false);
});

test('dequeue removes one', () => {
  const q = dequeue([session('a'), session('b')], 'a');
  expect(q.map((s) => s.client_id)).toEqual(['b']);
});

/** An in-memory stand-in for the phone's storage. */
function store(initial: QueueItem[]) {
  let q = initial;
  return {
    read: () => q,
    write: (next: QueueItem[]) => {
      q = next;
    },
    get now() {
      return q;
    },
  };
}

test('flush sends oldest first and empties the queue', async () => {
  const sent: string[] = [];
  const st = store([session('a'), session('b')]);
  const res = await flushQueue(st.read, st.write, async (s) => {
    sent.push(s.client_id);
    return { ok: true };
  });
  expect(sent).toEqual(['a', 'b']);
  expect(res).toEqual({ sent: 2, dropped: 0 });
  expect(st.now).toEqual([]);
});

test('flush stops at a network error and keeps the rest', async () => {
  const seen: string[] = [];
  const st = store([session('a'), session('b'), session('c')]);
  const res = await flushQueue(st.read, st.write, async (s) => {
    seen.push(s.client_id);
    if (s.client_id === 'b') throw new Error('offline');
    return { ok: true };
  });
  expect(seen).toEqual(['a', 'b']);
  expect(res.sent).toBe(1);
  expect(st.now.map((s) => s.client_id)).toEqual(['b', 'c']);
});

test('flush drops a session the store refused (ok:false) and goes on', async () => {
  const st = store([session('a'), session('b')]);
  const res = await flushQueue(st.read, st.write, async (s) =>
    s.client_id === 'a' ? { ok: false, reason: 'bad code' } : { ok: true }
  );
  expect(res).toEqual({ sent: 1, dropped: 1 });
  expect(st.now).toEqual([]);
});

test('a locked reply keeps the item queued and stops (it retries later)', async () => {
  const seen: string[] = [];
  const st = store([session('a'), session('b')]);
  const res = await flushQueue(st.read, st.write, async (s) => {
    seen.push(s.client_id);
    return { ok: false, reason: 'locked' };
  });
  expect(seen).toEqual(['a']);
  expect(res).toEqual({ sent: 0, dropped: 0 });
  expect(st.now.map((s) => s.client_id)).toEqual(['a', 'b']);
});

test('an item queued while a send is in flight is never lost', async () => {
  const st = store([session('a')]);
  const answer = { client_id: 'q', question_id: 'q1', answer: 'text' };
  const res = await flushQueue(st.read, st.write, async (s) => {
    if (s.client_id === 'a') {
      // the person answers a question while this slow send is still going
      st.write(enqueue(st.read(), answer));
      await new Promise((r) => setTimeout(r, 20));
    }
    return { ok: true };
  });
  // both went through, and nothing was wiped by a stale copy
  expect(res.sent).toBe(2);
  expect(st.now).toEqual([]);
});

test('an item queued mid-flush survives when the send then fails', async () => {
  const st = store([session('a')]);
  const answer = { client_id: 'q', question_id: 'q1', answer: 'text' };
  await flushQueue(st.read, st.write, async () => {
    st.write(enqueue(st.read(), answer));
    throw new Error('offline');
  });
  expect(st.now.map((s) => s.client_id)).toEqual(['a', 'q']);
});
