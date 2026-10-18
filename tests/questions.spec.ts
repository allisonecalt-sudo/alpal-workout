import {
  CODE,
  expect,
  makeGuest,
  openUnlocked,
  PHONE,
  QUESTIONS,
  runWorkout,
  test,
  type Net,
} from './fixtures';

function withQuestions(net: Net, n = 3): void {
  net.guest = makeGuest({ questions: QUESTIONS.slice(0, n), answered: 2 });
}

test('Home has the questions card with the count; no card when none are left', async ({
  page,
  net,
}) => {
  withQuestions(net);
  await openUnlocked(page);
  const card = page.locator('#questions-card');
  await expect(card).toContainText('Questions from Allison');
  await expect(page.locator('#questions-left')).toHaveText('3 left · answer whenever you like');
  await expect(card.getByRole('button', { name: 'Answer a few' })).toBeVisible();
});

test('no questions means no card', async ({ page }) => {
  await openUnlocked(page);
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#questions-card')).toHaveCount(0);
});

test('the question screen: section small, question big, a roomy box with the voice hint', async ({
  page,
  net,
}) => {
  withQuestions(net);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await expect(page.locator('#q-progress')).toHaveText('1 of 3 left');
  await expect(page.locator('#q-section')).toHaveText('Section one');
  await expect(page.locator('#q-text')).toHaveText('Question one?');
  const area = page.locator('#q-answer');
  await expect(area).toHaveAttribute('dir', 'auto');
  await expect(area).toHaveAttribute('rows', '5');
  expect(
    await area.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  ).toBeGreaterThanOrEqual(16);
  await expect(page.getByText('Type, or tap the 🎤 on your keyboard to talk.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled(); // nothing typed yet
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done for now' })).toBeVisible();
  await area.fill('My answer');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('Save sends the exact body by POST, with the code only in the body', async ({ page, net }) => {
  withQuestions(net);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('My answer, with "quotes" & <b>tags</b>');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#q-text')).toHaveText('Question two?');
  await expect(page.locator('#q-progress')).toHaveText('1 of 2 left');
  expect(net.answers).toHaveLength(1);
  expect(net.answers[0]).toEqual({
    p_code: CODE,
    p_answer: {
      client_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      question_id: 'q1',
      answer: 'My answer, with "quotes" & <b>tags</b>',
    },
  });
  const posts = net.requests.filter((r) => r.url.endsWith('/rpc/guest_save_answer'));
  expect(posts).toHaveLength(1);
  expect(posts[0].method).toBe('POST');
  expect(posts[0].url).not.toContain(CODE);
  expect(posts[0].url).not.toContain('?');
  // a typed answer is shown as text, never as markup
  expect(await page.locator('#q-answer').inputValue()).toBe('');
});

test('Skip for now moves on and the question stays for next time', async ({ page, net }) => {
  withQuestions(net);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.locator('#q-text')).toHaveText('Question two?');
  await expect(page.locator('#q-progress')).toHaveText('2 of 3 left');
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#questions-left')).toHaveText('3 left · answer whenever you like');
  expect(net.answers).toHaveLength(0);
  // next time the first one is there again
  await page.reload();
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await expect(page.locator('#q-text')).toHaveText('Question one?');
});

test('skipping past the last question goes back Home with all of them still waiting', async ({
  page,
  net,
}) => {
  withQuestions(net, 2);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#questions-left')).toHaveText('2 left · answer whenever you like');
});

test('Done for now goes back Home; an answer given before it counts', async ({ page, net }) => {
  withQuestions(net);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('First');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#questions-left')).toHaveText('2 left · answer whenever you like');
});

test('answering all of them shows the thank-you and the card disappears', async ({ page, net }) => {
  withQuestions(net);
  await openUnlocked(page);
  await page.getByRole('button', { name: 'Answer a few' }).click();
  for (const a of ['one', 'two', 'three']) {
    await page.locator('#q-answer').fill(a);
    await page.getByRole('button', { name: 'Save' }).click();
  }
  await expect(page.locator('#all-answered')).toHaveText(
    "That's all of them. Thank you! ❤️ Allison will read them."
  );
  expect(net.answers.map((a) => a.p_answer.question_id)).toEqual(['q1', 'q2', 'q3']);
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await expect(page.locator('#greeting')).toBeVisible();
  await expect(page.locator('#questions-card')).toHaveCount(0);
});

test('offline: the answer waits on the phone, the line says so, and it is sent once on the next open', async ({
  page,
  net,
}) => {
  withQuestions(net);
  await openUnlocked(page);
  await expect(page.locator('#questions-card')).toBeVisible();
  net.online = false;
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Offline answer');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toast')).toHaveText(
    "Saved on your phone. It'll send when you're online."
  );
  await expect(page.locator('#q-text')).toHaveText('Question two?');
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "1 answer not sent yet — it'll send when you're online."
  );
  await expect(page.locator('#questions-left')).toHaveText('2 left · answer whenever you like');
  expect(net.answers).toHaveLength(0);

  // a second one: plural
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Another');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "2 answers not sent yet — it'll send when you're online."
  );

  // still offline on the next open: nothing is lost, still queued, still not asked again
  await page.reload();
  await expect(page.locator('#unsent-line')).toHaveText(
    "2 answers not sent yet — it'll send when you're online."
  );
  await expect(page.locator('#questions-left')).toHaveText('1 left · answer whenever you like');

  // online again: sent on open, once each
  net.online = true;
  net.guest = makeGuest({ questions: [QUESTIONS[2]], answered: 4 });
  await page.reload();
  await expect.poll(() => net.answers.length).toBe(2);
  expect(net.answers.map((a) => a.p_answer.answer)).toEqual(['Offline answer', 'Another']);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  await page.waitForTimeout(400);
  expect(net.answers).toHaveLength(2);
});

test('a workout and an answer waiting together say "things"', async ({ page, net }) => {
  withQuestions(net);
  await openUnlocked(page);
  await expect(page.locator('#questions-card')).toBeVisible();
  net.online = false;
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Offline answer');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Done for now' }).click();
  await runWorkout(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#unsent-line')).toHaveText(
    "2 things not sent yet — it'll send when you're online."
  );
  net.online = true;
  await page.reload();
  await expect.poll(() => net.saves.length + net.answers.length).toBe(2);
  await expect(page.locator('#unsent-line')).toHaveCount(0);
});

test('a refused answer (ok:false) is not queued: the message and the Tell button, and it stays', async ({
  page,
  net,
}) => {
  withQuestions(net);
  await openUnlocked(page);
  await expect(page.locator('#questions-card')).toBeVisible();
  net.answerReply = { ok: false, reason: 'locked' };
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Refused answer');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#q-error')).toContainText("Couldn't save this one. Tell Allison.");
  await expect(page.locator('#q-tell')).toHaveAttribute(
    'href',
    `https://wa.me/${PHONE.replace(/\D/g, '')}?text=About%20my%20workout%20app%3A%20`
  );
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  // still on the same question, her text is still there, and she can skip on
  await expect(page.locator('#q-text')).toHaveText('Question one?');
  expect(await page.locator('#q-answer').inputValue()).toBe('Refused answer');
  await page.getByRole('button', { name: 'Done for now' }).click();
  await expect(page.locator('#questions-left')).toHaveText('3 left · answer whenever you like');
  expect(net.answers).toHaveLength(1); // never retried
  await page.reload();
  await expect(page.locator('#greeting')).toBeVisible();
  expect(net.answers).toHaveLength(1);
});

test('a queued answer the store later refuses is dropped, with the same message', async ({
  page,
  net,
}) => {
  withQuestions(net);
  await openUnlocked(page);
  await expect(page.locator('#questions-card')).toBeVisible();
  net.online = false;
  await page.getByRole('button', { name: 'Answer a few' }).click();
  await page.locator('#q-answer').fill('Offline answer');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Done for now' }).click();
  net.online = true;
  net.answerReply = { ok: false, reason: 'too many' };
  await page.reload();
  await expect(page.locator('#notice')).toContainText("Couldn't save this one. Tell Allison.");
  await expect(page.locator('#unsent-line')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('aw.queue'))).toBeNull();
  expect(net.answers).toHaveLength(1);
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px on the question screens and the card`, async ({
    page,
    net,
  }) => {
    withQuestions(net, 1);
    await page.setViewportSize({ width, height: 844 });
    const overflow = (): Promise<number> =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    await openUnlocked(page);
    await expect(page.locator('#questions-card')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Answer a few' }).click();
    await page.locator('#q-answer').fill('x'.repeat(300));
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const b of await page.locator('button').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#all-answered')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}
