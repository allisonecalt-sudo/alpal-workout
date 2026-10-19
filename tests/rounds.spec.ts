import {
  CODE,
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  runWorkout,
  test,
  type Net,
  startWorkout,
} from './fixtures';

function roundsGuest(net: Net, sessions: { workout: string | null; week?: number }[] = []): void {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: sessions.map((s, k) => ({
      done_at: `2026-10-1${k}T08:00:00Z`,
      week: s.week ?? 1,
      workout: s.workout,
      feel: null,
      check_0_10: null,
    })),
  });
}

test('Home shows Up next with the three part lines, the minutes and the other workouts', async ({
  page,
  net,
}) => {
  roundsGuest(net);
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout A');
  await expect(page.locator('#minutes')).toHaveText('About 30 min');
  await expect(page.locator('#parts summary')).toHaveText([
    'Warm-up · 2 moves',
    'Main · 2 moves × 2 rounds',
    'Cool-down · 1 move',
  ]);
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.locator('#chips-line')).toContainText('or do:');
  await expect(page.locator('#chips-line .chip')).toHaveText(['B', 'C']);
  await expect(page.locator('#week-words')).toHaveText('0 of 3 this week');
});

test('Up next is the first workout, in the data order, not yet done this week', async ({
  page,
  net,
}) => {
  roundsGuest(net, [{ workout: 'A' }]);
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout B');
  await expect(page.locator('#chips-line .chip')).toHaveText(['A ✓', 'C']);
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
});

test('a workout done in an earlier program week does not count', async ({ page, net }) => {
  roundsGuest(net, [{ workout: 'A', week: 0 }]);
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout A');
  await expect(page.locator('#week-words')).toHaveText('0 of 3 this week');
});

test('only B done: A is still up next, and B shows its tick', async ({ page, net }) => {
  roundsGuest(net, [{ workout: 'B' }]);
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout A');
  await expect(page.locator('#chips-line .chip')).toHaveText(['B ✓', 'C']);
});

test('all done: a gentle message and every workout as a chip', async ({ page, net }) => {
  roundsGuest(net, [{ workout: 'A' }, { workout: 'B' }, { workout: 'C' }]);
  await openUnlocked(page);
  await expect(page.locator('#all-done')).toHaveText('All 3 done this week 🎉');
  await expect(page.locator('#chips-line')).toContainText('Extra one?');
  await expect(page.locator('#chips-line .chip')).toHaveText(['A ✓', 'B ✓', 'C ✓']);
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  // nothing red, nothing about missing
  await expect(page.locator('body')).not.toContainText(/missed|overdue/i);
  // pick one for an extra round of the week
  await page.locator('#chips-line .chip', { hasText: 'B' }).click();
  await expect(page.locator('#up-next')).toHaveText('Extra · Workout B');
  await startWorkout(page);
  await expect(page.locator('#move-name')).toHaveText('Bee one');
});

test('Your weeks lists the letters with ticks, newest first', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeRoundsProgram({ week: 2 }),
    sessions: [
      { done_at: '2026-10-19T08:00:00Z', week: 2, workout: 'A', feel: null, check_0_10: null },
      { done_at: '2026-10-12T08:00:00Z', week: 1, workout: 'A', feel: null, check_0_10: null },
      { done_at: '2026-10-13T08:00:00Z', week: 1, workout: 'B', feel: null, check_0_10: null },
    ],
  });
  await openUnlocked(page);
  await expect(page.locator('#past-weeks li')).toHaveText([
    'Week 2 · A ✓ B C',
    'Week 1 · A ✓ B ✓ C',
  ]);
});

test('a chip picks another workout, and Start runs that one', async ({ page, net }) => {
  roundsGuest(net);
  await openUnlocked(page);
  await page.locator('#chips-line .chip', { hasText: 'C' }).click();
  await expect(page.locator('#up-next')).toHaveText('Your pick · Workout C');
  await expect(page.locator('#minutes')).toHaveText('About 20 min');
  await expect(page.locator('#chips-line .chip')).toHaveText(['A', 'B']);
  await startWorkout(page);
  await expect(page.locator('#progress-line')).toHaveText('Round 1 of 3 · move 1 of 2');
  await expect(page.locator('#move-name')).toHaveText('Sea one');
});

test('the flow: warm-up, rounds with a between screen, cool-down, then After and Save', async ({
  page,
  net,
}) => {
  roundsGuest(net);
  await openUnlocked(page);
  await startWorkout(page);
  const line = page.locator('#progress-line');
  const done = page.locator('#done-btn');

  await expect(line).toHaveText('Warm-up · 1 of 2');
  await expect(page.locator('#move-name')).toHaveText('Warm one');
  await done.click();
  await expect(line).toHaveText('Warm-up · 2 of 2');
  await expect(page.locator('#timer')).toHaveText('20 s');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(line).toHaveText('Round 1 of 2 · move 1 of 2');
  await expect(page.locator('#move-name')).toHaveText('Main one');
  await done.click();
  await expect(line).toHaveText('Round 1 of 2 · move 2 of 2');
  await page.getByRole('button', { name: 'This hurts' }).click();

  // between rounds
  await expect(page.locator('#between-title')).toHaveText('Round 1 done 👏 · Round 2 of 2');
  await expect(page.getByRole('button', { name: 'Next round' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish now' })).toBeVisible();
  await page.getByRole('button', { name: 'Next round' }).click();

  await expect(line).toHaveText('Round 2 of 2 · move 1 of 2');
  await done.click();
  await expect(line).toHaveText('Round 2 of 2 · move 2 of 2');
  await done.click();
  // the last round has no between screen: straight to the cool-down
  await expect(line).toHaveText('Cool-down · 1 of 1');
  await done.click();
  await expect(page.locator('#after-title')).toBeVisible();

  await page.locator('[data-feel="easy"]').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  expect(net.saves[0].p_code).toBe(CODE);
  expect(net.saves[0].p_session).toEqual({
    client_id: expect.any(String),
    done_at: expect.any(String),
    week: 1,
    workout: 'A',
    moves: [
      { name: 'Warm one', part: 'warmup', round: 1, status: 'done' },
      { name: 'Warm two', part: 'warmup', round: 1, status: 'skipped' },
      { name: 'Main one', part: 'main', round: 1, status: 'done' },
      { name: 'Main two', part: 'main', round: 1, status: 'hurt' },
      { name: 'Main one', part: 'main', round: 2, status: 'done' },
      { name: 'Main two', part: 'main', round: 2, status: 'done' },
      { name: 'Cool one', part: 'cooldown', round: 1, status: 'done' },
    ],
    feel: 'easy',
    check_0_10: null,
    note: null,
  });
  // A is now ticked and B is up next
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout B');
  await expect(page.locator('#chips-line .chip')).toHaveText(['A ✓', 'C']);
});

test('Finish now between rounds still saves, and counts', async ({ page, net }) => {
  roundsGuest(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toBeVisible();
  await page.getByRole('button', { name: 'Finish now' }).click();
  await expect(page.locator('#after-title')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  const session = net.saves[0].p_session as { workout: string; moves: unknown[] };
  expect(session.workout).toBe('A');
  expect(session.moves).toHaveLength(4); // only what she reached
  await expect(page.locator('#week-words')).toHaveText('1 of 3 this week');
});

test('a reload resumes exactly: the same round and move', async ({ page, net }) => {
  roundsGuest(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.locator('#done-btn').click();
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 2 of 2');
  await page.reload();
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 2 of 2');
  await expect(page.locator('#move-name')).toHaveText('Main two');
});

test('a reload on the between screen comes back to the between screen', async ({ page, net }) => {
  roundsGuest(net);
  await openUnlocked(page);
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await expect(page.locator('#between-title')).toBeVisible();
  await page.reload();
  await expect(page.locator('#between-title')).toHaveText('Round 1 done 👏 · Round 2 of 2');
  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.locator('#progress-line')).toHaveText('Round 2 of 2 · move 1 of 2');
});

test('the old shape (a flat moves list) still works as one workout, one round', async ({
  page,
}) => {
  await openUnlocked(page);
  await expect(page.locator('#up-next')).toHaveText('Up next · Week 1');
  await expect(page.locator('#chips-line')).toHaveCount(0); // no other workouts
  await startWorkout(page);
  await expect(page.locator('#progress-line')).toHaveText('Move 1 of 3');
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px on Home, the workout, between rounds and After`, async ({
    page,
    net,
  }) => {
    roundsGuest(net);
    await page.setViewportSize({ width, height: 844 });
    const overflow = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    await openUnlocked(page);
    await expect(page.locator('#greeting')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.locator('#parts summary').first().click(); // open the warm-up list
    expect(await overflow()).toBeLessThanOrEqual(0);
    await startWorkout(page);
    await expect(page.locator('#move-name')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
    await expect(page.locator('#between-title')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Finish now' }).click();
    await expect(page.locator('#after-title')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}

test('every button on the Up next card, the chips and the between screen is 44px or taller', async ({
  page,
  net,
}) => {
  roundsGuest(net);
  await openUnlocked(page);
  await page.locator('#parts summary').first().click();
  const check = async (): Promise<void> => {
    for (const b of await page.locator('button, summary, #tell').all()) {
      if (!(await b.isVisible())) continue;
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  };
  await check();
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await check();
});

// --- the week is done only when the session count reaches sessionsPerWeek ---

test('one workout, three sessions a week: Start stays until the third is saved', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({ sessions: [] });
  await openUnlocked(page);
  for (const n of [1, 2]) {
    await runWorkout(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#week-words')).toHaveText(`${n} of 3 this week`);
    await expect(page.locator('#all-done')).toHaveCount(0);
    await expect(page.locator('#up-next')).toHaveText('Up next · Week 1');
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  }
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#all-done')).toHaveText('All 3 done this week 🎉');
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  await expect(page.locator('#chips-line .chip')).toHaveText(['A ✓']);
});

test('three workouts, three sessions: each once, then the week is done', async ({ page, net }) => {
  roundsGuest(net);
  await openUnlocked(page);
  const names = ['Workout A', 'Workout B', 'Workout C'];
  for (let k = 0; k < 3; k++) {
    await expect(page.locator('#up-next')).toHaveText(`Up next · ${names[k]}`);
    await startWorkout(page);
    // skip through the whole workout quickly
    for (let guard = 0; guard < 20; guard++) {
      if (await page.locator('#after-title').isVisible()) break;
      const finish = page.getByRole('button', { name: 'Finish now' });
      if (await finish.isVisible()) await finish.click();
      else await page.locator('#done-btn').click();
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#greeting')).toBeVisible();
  }
  await expect(page.locator('#all-done')).toHaveText('All 3 done this week 🎉');
});

test('two workouts, three sessions: the third cycles back to the one done longest ago', async ({
  page,
  net,
}) => {
  net.guest = makeGuest({
    program: makeRoundsProgram({
      workouts: (makeRoundsProgram().workouts as unknown[]).slice(0, 2),
    }),
    sessions: [
      { done_at: '2026-10-11T08:00:00Z', week: 1, workout: 'B', feel: null, check_0_10: null },
      { done_at: '2026-10-12T08:00:00Z', week: 1, workout: 'A', feel: null, check_0_10: null },
    ],
  });
  await openUnlocked(page);
  // both done once, 2 of 3: not all done; B was done longest ago
  await expect(page.locator('#all-done')).toHaveCount(0);
  await expect(page.locator('#week-words')).toHaveText('2 of 3 this week');
  await expect(page.locator('#up-next')).toHaveText('Up next · Workout B');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('two workouts, three sessions: done at three', async ({ page, net }) => {
  net.guest = makeGuest({
    program: makeRoundsProgram({
      workouts: (makeRoundsProgram().workouts as unknown[]).slice(0, 2),
    }),
    sessions: ['A', 'B', 'A'].map((w, k) => ({
      done_at: `2026-10-1${k}T08:00:00Z`,
      week: 1,
      workout: w,
      feel: null,
      check_0_10: null,
    })),
  });
  await openUnlocked(page);
  await expect(page.locator('#all-done')).toHaveText('All 3 done this week 🎉');
  await expect(page.locator('#chips-line .chip')).toHaveText(['A ✓', 'B ✓']);
});
