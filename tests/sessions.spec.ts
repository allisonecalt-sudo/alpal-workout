import {
  CODE,
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  PHONE,
  startWorkout,
  test,
  type FakeSession,
  type Net,
} from './fixtures';

const day = (d: number, h = 9, m = 4): string => new Date(2026, 9, d, h, m, 0).toISOString();

const S1: FakeSession = {
  client_id: 'sess-1',
  done_at: day(12),
  started_at: day(12, 8, 30),
  duration_sec: 31 * 60,
  lite: false,
  readings: {
    before: { body: 6, mood: 7, check: 1 },
    after: { body: 5, mood: 8 },
    holds: { 'Hold one': [18, 20] },
    move_feel: { 'Main one': 'hard' },
  },
  moves: [
    { name: 'Warm one', part: 'warmup', round: 1, status: 'done' },
    { name: 'Main one', part: 'main', round: 1, status: 'skipped' },
    { name: 'Main two', part: 'main', round: 2, status: 'hurt' },
  ],
  note: 'First line of the note\nSecond line',
  week: 1,
  workout: 'A',
  feel: 'right',
  check_0_10: 2,
};
const S2: FakeSession = {
  client_id: 'sess-2',
  done_at: day(14),
  started_at: day(14, 8, 50),
  duration_sec: 22 * 60,
  lite: true,
  readings: { stopped_at: { part: 'main', round: 1, move: 'Main two' } },
  moves: [{ name: 'Main one', part: 'main', round: 1, status: 'done' }],
  note: null,
  week: 1,
  workout: 'B',
  feel: 'easy',
  check_0_10: 0,
};
const WALK: FakeSession = {
  client_id: 'sess-3',
  done_at: day(15, 17, 0),
  duration_sec: 20 * 60,
  week: 1,
  workout: 'walk',
  feel: null,
  check_0_10: null,
};

function setup(net: Net, sessions: FakeSession[] = [S1, S2, WALK]): void {
  net.guest = makeGuest({
    program: makeRoundsProgram({ checkLabel: 'Test check' }),
    sessions,
  });
}

const open = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByRole('button', { name: /Your sessions/ }).click();
  await expect(page.getByRole('heading', { name: 'Your sessions' })).toBeVisible();
};

test('Home has a Your sessions door; with nothing saved the list says so gently', async ({
  page,
  net,
}) => {
  setup(net, []);
  await openUnlocked(page);
  await open(page);
  await expect(page.locator('#sessions-empty')).toHaveText(
    'Nothing here yet. Your workouts will show up here.'
  );
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
});

test('the list is newest first, with letter badge, date and time, length, Lite, feel, check and the first note line', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await open(page);
  const rows = page.locator('.session-row');
  await expect(rows).toHaveCount(3);
  // newest first: the walk, then B, then A
  await expect(rows.nth(0).locator('.s-badge')).toHaveText('🚶');
  await expect(rows.nth(1).locator('.s-badge')).toHaveText('B');
  await expect(rows.nth(2).locator('.s-badge')).toHaveText('A');
  // A: date, time, length, feel, the check label and number, the first note line
  await expect(rows.nth(2).locator('.s-when')).toHaveText('Mon, Oct 12 · 9:04');
  await expect(rows.nth(2).locator('.s-bits')).toHaveText('31 min · Just right · Test check 2');
  await expect(rows.nth(2).locator('.s-note')).toHaveText('First line of the note');
  // B: the Lite tag, and a zero is shown plainly
  await expect(rows.nth(1).locator('.s-bits')).toHaveText('22 min · Lite · Easy · Test check 0');
  await expect(rows.nth(1).locator('.s-note')).toHaveCount(0);
  // the walk: length only
  await expect(rows.nth(0).locator('.s-bits')).toHaveText('20 min');
});

test('a session waiting to be sent is in the list, marked Not sent yet, at its place by date', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await open(page);
  const first = page.locator('.session-row').first();
  await expect(first.locator('.s-bits')).toContainText('Not sent yet');
  await expect(first.locator('.s-badge')).toHaveText('C'); // A and B are done: C was up next
  await expect(page.locator('.session-row')).toHaveCount(4);
});

test('the detail shows every reading: times, before and after, holds, moves, stopped early, the note', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(2).click(); // A
  await expect(page.locator('#detail-title')).toHaveText('Workout A · Mon, Oct 12 · 9:04');
  const lines = page.locator('.d-line');
  await expect(lines.nth(0)).toHaveText('Started 8:30 · Finished 9:04 · 31 min');
  await expect(page.locator('.session-detail')).toContainText(
    'Before: body 6 · mood 7 · Test check 1'
  );
  await expect(page.locator('.session-detail')).toContainText('After: body 5 · mood 8');
  await expect(page.locator('.session-detail')).toContainText('Test check 2');
  await expect(page.locator('.session-detail')).toContainText('How it was: Just right');
  await expect(page.locator('#detail-holds li')).toHaveText(['Hold one: 18 s · 20 s']);
  await expect(page.locator('#detail-feels li')).toHaveText(['Main one: Hard']);
  await expect(page.locator('#detail-moves li')).toHaveText([
    '✓Warm one warm-up',
    '↷Main one round 1',
    '⚠Main two round 2',
  ]);
  await expect(page.locator('#detail-note')).toHaveText('First line of the note Second line');
});

test('the detail of a stopped, lite session says where; a walk shows its length', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(1).click(); // B
  await expect(page.locator('.session-detail')).toContainText('Lite day');
  await expect(page.locator('.session-detail')).toContainText(
    'Stopped early at Main two (main, round 1)'
  );
  await expect(page.locator('#detail-note')).toHaveText('No note');
  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.locator('.session-row').nth(0).click(); // the walk
  await expect(page.locator('#detail-title')).toContainText('Walk');
  await expect(page.locator('.d-line').first()).toHaveText('Finished 17:00 · 20 min');
});

test('Edit note online: the exact request, the detail and the list show the new note', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(2).click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await expect(page.locator('#note-edit')).toHaveValue('First line of the note\nSecond line');
  await page.locator('#note-edit').fill('A new note, with "quotes"');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#detail-note')).toHaveText('A new note, with "quotes"');
  expect(net.notes).toEqual([
    { p_code: CODE, p_client_id: 'sess-1', p_note: 'A new note, with "quotes"' },
  ]);
  const posts = net.requests.filter((r) => r.url.endsWith('/rpc/guest_update_note'));
  expect(posts).toHaveLength(1);
  expect(posts[0].method).toBe('POST');
  expect(posts[0].url).not.toContain(CODE);
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.locator('.session-row').nth(2).locator('.s-note')).toHaveText(
    'A new note, with "quotes"'
  );
});

test('Edit note: Cancel changes nothing; clearing the note sends an empty one', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(2).click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('changed');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#detail-note')).toHaveText('First line of the note Second line');
  expect(net.notes).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#detail-note')).toHaveText('No note');
  expect(net.notes[0].p_note).toBe('');
});

test('Edit note offline: kept on the phone, shown at once, sent once when online', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await open(page);
  await page.locator('.session-row').nth(2).click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('Offline note');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#toast')).toHaveText(
    "Saved on your phone. It'll send when you're online."
  );
  await expect(page.locator('#detail-note')).toHaveText('Offline note');
  expect(net.notes).toHaveLength(0);
  const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string));
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({ target: 'sess-1', note: 'Offline note' });
  // a second edit replaces the first in the queue
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('Offline note, second');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#detail-note')).toHaveText('Offline note, second');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string))
  ).toHaveLength(1);
  // Home says so
  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.getByRole('button', { name: '‹ Home' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 note change not sent yet — it'll send when you're online."
  );
  // still offline on the next open: the list shows the edited note
  await page.reload();
  await open(page);
  await expect(page.locator('.session-row').nth(2).locator('.s-note')).toHaveText(
    'Offline note, second'
  );
  // online: sent once, with the last text
  net.online = true;
  await page.reload();
  await expect.poll(() => net.notes.length).toBe(1);
  expect(net.notes[0]).toEqual({
    p_code: CODE,
    p_client_id: 'sess-1',
    p_note: 'Offline note, second',
  });
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
});

test('Edit note refused (ok:false): the message and the Tell button, the note unchanged, nothing queued', async ({
  page,
  net,
}) => {
  setup(net);
  net.noteReply = { ok: false, reason: 'bad input' };
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(2).click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('Will be refused');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#note-error')).toHaveText("Couldn't save this one. Tell Allison.");
  await expect(page.locator('#note-tell')).toHaveAttribute(
    'href',
    `https://wa.me/${PHONE.replace(/\D/g, '')}?text=About%20my%20workout%20app%3A%20`
  );
  await expect(page.locator('#detail-note')).toHaveText('First line of the note Second line');
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  expect(net.notes).toHaveLength(1); // never retried
});

test('Edit note answered "locked" waits in the queue and retries', async ({ page, net }) => {
  setup(net);
  net.noteReply = { ok: false, reason: 'locked' };
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(2).click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('Held note');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#detail-note')).toHaveText('Held note');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string))
  ).toHaveLength(1);
  net.noteReply = null;
  await page.reload();
  await expect.poll(() => net.notes.length).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
});

test('editing the note of a session that is still waiting changes the waiting copy', async ({
  page,
  net,
}) => {
  setup(net);
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  net.online = false;
  await startWorkout(page);
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('button', { name: 'Log what I did' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await open(page);
  await page.locator('.session-row').first().click();
  await page.getByRole('button', { name: 'Edit note' }).click();
  await page.locator('#note-edit').fill('Noted before sending');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.locator('#detail-note')).toHaveText('Noted before sending');
  const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') as string));
  expect(queue).toHaveLength(1); // still just the session
  expect(queue[0].note).toBe('Noted before sending');
  net.online = true;
  await page.reload();
  await expect.poll(() => net.saves.length).toBe(1);
  expect((net.saves[0].p_session as { note: string }).note).toBe('Noted before sending');
  expect(net.notes).toHaveLength(0);
});

test('Back returns to the same place in a long list', async ({ page, net }) => {
  const many: FakeSession[] = Array.from({ length: 30 }, (_, k) => ({
    client_id: `s-${k}`,
    done_at: day(1 + (k % 28), 9, k),
    duration_sec: 20 * 60,
    week: 1,
    workout: 'A',
    feel: null,
    check_0_10: null,
  }));
  setup(net, many);
  await openUnlocked(page);
  await open(page);
  await page.locator('.session-row').nth(20).scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);
  await page.locator('.session-row').nth(20).click();
  await expect(page.locator('#detail-title')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.locator('.session-row').first()).toBeVisible();
  await expect
    .poll(() => page.evaluate((b) => Math.abs(window.scrollY - b), before))
    .toBeLessThan(4);
});

for (const width of [320, 390, 402, 430]) {
  test(`the list and the detail have no sideways scroll at ${width}px, rows and buttons 44px`, async ({
    page,
    net,
  }) => {
    setup(net, [
      { ...S1, note: 'N'.repeat(200), readings: { holds: { ['H'.repeat(60)]: [18, 20] } } },
      S2,
      WALK,
    ]);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await open(page);
    const over = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    expect(await over()).toBeLessThanOrEqual(0);
    for (const b of await page.locator('.session-row, #sessions-back').all()) {
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.locator('.session-row').nth(2).click();
    expect(await over()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Edit note' }).click();
    expect(await over()).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      if (!(await b.isVisible())) continue;
      expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}
