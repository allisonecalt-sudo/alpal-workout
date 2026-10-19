import type { Page } from '@playwright/test';
import {
  CODE,
  QUESTIONS,
  expect,
  makeGuest,
  makeRoundsProgram,
  openUnlocked,
  startWorkout,
  stopRecording,
  test,
  type Net,
} from './fixtures';

function setup(net: Net, questions = 2): void {
  net.guest = makeGuest({
    program: makeRoundsProgram(),
    sessions: [],
    questions: QUESTIONS.slice(0, questions),
  });
}

async function toAfter(page: Page): Promise<void> {
  await startWorkout(page);
  for (let k = 0; k < 4; k++) await page.locator('#done-btn').click();
  await page.locator('#next-round-btn').click();
  for (let k = 0; k < 2; k++) await page.locator('#done-btn').click();
  await page.locator('#cooldown-done').click();
  await expect(page.locator('#after-title')).toBeVisible();
}

test('After: the Tell Allison card sits between the note and Save, with two buttons', async ({
  page,
  net,
}) => {
  setup(net, 0);
  await openUnlocked(page);
  await toAfter(page);
  const card = page.locator('#tell-card');
  await expect(card).toContainText('Tell Allison');
  await expect(card).toContainText(
    "Anything to change or add? Anything you'd like her to look into?"
  );
  await expect(page.locator('#tell-record')).toHaveText('🎤 Record');
  await expect(page.locator('#tell-write')).toHaveText('✎ Write');
  const note = await page.locator('#note').boundingBox();
  const tell = await card.boundingBox();
  const save = await page.locator('#save-btn').boundingBox();
  expect(tell?.y ?? 0).toBeGreaterThan((note?.y ?? 0) + (note?.height ?? 0) - 1);
  expect((tell?.y ?? 0) + (tell?.height ?? 0)).toBeLessThanOrEqual((save?.y ?? 0) + 1);
  // no questions left: no question card
  await expect(page.locator('#after-question')).toHaveCount(0);
});

test('🎤 Record opens the sheet already recording, and the note carries the context', async ({
  page,
  net,
}) => {
  setup(net, 0);
  await openUnlocked(page);
  await toAfter(page);
  await page.locator('#tell-record').click();
  await expect(page.locator('#note-sheet')).toBeVisible();
  await expect(page.locator('#rec-time')).toBeVisible();
  await stopRecording(page);
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  expect(net.messages).toHaveLength(1);
  expect(net.messages[0].url).not.toContain(CODE);
  expect(net.messages[0].body.p_msg).toMatchObject({
    kind: 'voice',
    context: 'After Workout A · Week 1',
  });
});

test('✎ Write opens the sheet on the write view, with the same context', async ({ page, net }) => {
  setup(net, 0);
  await openUnlocked(page);
  await toAfter(page);
  await page.locator('#tell-write').click();
  await expect(page.locator('#note-text')).toBeVisible();
  await page.locator('#note-text').fill('Please add a seated option');
  await page.locator('#note-send').click();
  await expect(page.locator('#note-done')).toBeVisible();
  expect(net.messages[0].body.p_msg).toMatchObject({
    kind: 'text',
    text: 'Please add a seated option',
    context: 'After Workout A · Week 1',
  });
});

test('the header button sends the screen it was pressed on', async ({ page, net }) => {
  setup(net, 1);
  await openUnlocked(page);
  const sendFrom = async (text: string): Promise<void> => {
    await page.locator('#note-btn').click();
    await page.locator('#write-start').click();
    await page.locator('#note-text').fill(text);
    await page.locator('#note-send').click();
    await expect(page.locator('#note-done')).toBeVisible();
    await expect(page.locator('#note-sheet')).toHaveCount(0, { timeout: 5000 });
  };
  const contexts = (): string[] => net.messages.map((m) => String(m.body.p_msg.context));
  await sendFrom('one');
  await page.locator('#questions-btn').click();
  await sendFrom('two');
  await page.locator('#q-done').click();
  await page.locator('#settings-btn').click();
  await sendFrom('three');
  await page.getByRole('button', { name: '‹ Home' }).click();
  await page.locator('#start-btn').click();
  await sendFrom('four');
  await page.locator('#before-start').click();
  await sendFrom('five');
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await page.locator('#done-btn').click();
  await sendFrom('six');
  expect(contexts()).toEqual([
    'Home',
    'Questions',
    'Settings',
    'Before Workout A',
    'Workout A · move 1',
    'Workout A · move 4',
  ]);
});

test('one question from Allison: the next one inline, saved on the usual path, then Thanks', async ({
  page,
  net,
}) => {
  setup(net, 3);
  await openUnlocked(page);
  await toAfter(page);
  const card = page.locator('#after-question');
  await expect(card).toContainText('One question from Allison');
  await expect(page.locator('#aq-section')).toHaveText('Section one');
  await expect(page.locator('#aq-text')).toHaveText('Question one?');
  await expect(page.locator('#aq-save')).toBeDisabled();
  const size = await page
    .locator('#aq-answer')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  await page.locator('#aq-answer').fill('My answer');
  await page.locator('#aq-save').click();
  await expect(page.locator('#aq-thanks')).toHaveText('Thanks! 2 left.');
  expect(net.answers).toHaveLength(1);
  expect(net.answers[0].p_code).toBe(CODE);
  expect(net.answers[0].p_answer).toMatchObject({ question_id: 'q1', answer: 'My answer' });
  // only one per After screen
  await expect(page.locator('#aq-text')).toHaveCount(0);
  await expect(page.locator('#after-question')).toHaveCount(1);
  // and the workout still saves
  await page.locator('#save-btn').click();
  await expect(page.locator('#done-today')).toBeVisible();
  expect(net.saves).toHaveLength(1);
});

test('a question answered while offline is queued like on the Questions screen', async ({
  page,
  net,
}) => {
  setup(net, 1);
  await openUnlocked(page);
  await toAfter(page);
  net.failAnswers = true;
  await page.locator('#aq-answer').fill('Later');
  await page.locator('#aq-save').click();
  await expect(page.locator('#aq-thanks')).toBeVisible();
  const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('aw.queue') ?? '[]'));
  expect(queue.some((q: { question_id?: string }) => q.question_id === 'q1')).toBe(true);
});

test('Skip hides the question for this screen and the workout saves', async ({ page, net }) => {
  setup(net, 2);
  await openUnlocked(page);
  await toAfter(page);
  await page.locator('#aq-skip').click();
  await expect(page.locator('#after-question')).toHaveCount(0);
  await page.locator('#save-btn').click();
  await expect(page.locator('#done-today')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  expect(net.answers).toHaveLength(0);
  // the question is still open on Home
  await expect(page.locator('#questions-left')).toHaveText('2 left · answer whenever you like');
});

test('Save works with an unanswered question and no note at all', async ({ page, net }) => {
  setup(net, 2);
  await openUnlocked(page);
  await toAfter(page);
  await page.locator('#save-btn').click();
  await expect(page.locator('#done-today')).toBeVisible();
  expect(net.saves).toHaveLength(1);
  expect(net.saves[0].p_session.note).toBeNull();
});

test('Save works with a note and a written Tell Allison open behind it', async ({ page, net }) => {
  setup(net, 1);
  await openUnlocked(page);
  await toAfter(page);
  await page.locator('#note').fill('A note');
  await page.locator('#save-btn').click();
  await expect(page.locator('#done-today')).toBeVisible();
  expect(net.saves[0].p_session.note).toBe('A note');
});

for (const width of [320, 390, 430]) {
  test(`no sideways scroll at ${width}px on the After screen with both cards`, async ({
    page,
    net,
  }) => {
    setup(net, 2);
    await page.setViewportSize({ width, height: 844 });
    await openUnlocked(page);
    await toAfter(page);
    await page.locator('#aq-answer').fill('Averyveryverylongwordwithoutspaces'.repeat(4));
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(over).toBeLessThanOrEqual(0);
    for (const id of ['#tell-record', '#tell-write', '#aq-save', '#aq-skip']) {
      const box = await page.locator(id).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
  });
}
