import { expect, test } from '@playwright/test';
import { dequeue, enqueue, flushQueue } from '../queue';
import { isAnswer, type SessionPayload } from '../types';

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

test('flush sends oldest first and empties the queue', async () => {
  const sent: string[] = [];
  const res = await flushQueue([session('a'), session('b')], async (s) => {
    sent.push(s.client_id);
    return { ok: true };
  });
  expect(sent).toEqual(['a', 'b']);
  expect(res.sent).toBe(2);
  expect(res.remaining).toEqual([]);
});

test('flush stops at the first failure and keeps the rest', async () => {
  const seen: string[] = [];
  const res = await flushQueue([session('a'), session('b'), session('c')], async (s) => {
    seen.push(s.client_id);
    if (s.client_id === 'b') throw new Error('offline');
    return { ok: true };
  });
  expect(seen).toEqual(['a', 'b']);
  expect(res.sent).toBe(1);
  expect(res.remaining.map((s) => s.client_id)).toEqual(['b', 'c']);
});

test('flush drops a session the store refused (ok:false) and goes on', async () => {
  const res = await flushQueue([session('a'), session('b')], async (s) =>
    s.client_id === 'a' ? { ok: false, reason: 'bad_code' } : { ok: true }
  );
  expect(res.sent).toBe(1);
  expect(res.dropped).toBe(1);
  expect(res.remaining).toEqual([]);
});

test('flush reports each removal so storage can follow', async () => {
  const states: number[] = [];
  await flushQueue(
    [session('a'), session('b')],
    async () => ({ ok: true }),
    (rest) => states.push(rest.length)
  );
  expect(states).toEqual([1, 0]);
});
