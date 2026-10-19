// Your sessions: the list (newest first, with anything still waiting to be sent) and one
// session in full, with an editable note.
import { formatClock, formatDateClock, formatLength } from '../clock';
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { isWalk } from '../program';
import type { Feel, Program, SessionSummary } from '../types';

export interface ListedSession {
  record: SessionSummary;
  /** Finished on the phone and not sent yet. */
  unsent: boolean;
}

const FEEL_WORD = { easy: COPY.feelEasy, right: COPY.feelRight, hard: COPY.feelHard } as const;

/** The workout's name for a letter ("A" becomes "Workout A"), "Walk" for a walk. */
export function workoutName(program: Program | null, id: string | null): string {
  if (id === null) return 'Workout';
  if (isWalk({ workout: id })) return 'Walk';
  return program?.workouts.find((w) => w.id === id)?.name ?? id;
}

function badge(record: SessionSummary): string {
  if (isWalk(record)) return '🚶';
  return record.workout ?? '·';
}

function firstLine(note: string | null): string {
  if (!note) return '';
  return (
    note
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  );
}

export function rowHtml(item: ListedSession, key: number, checkLabel: string | null): string {
  const r = item.record;
  const when = formatDateClock(Date.parse(r.done_at));
  const bits: string[] = [];
  if (r.duration_sec !== null) bits.push(formatLength(r.duration_sec));
  if (r.lite) bits.push('<span class="tag">Lite</span>');
  if (item.unsent) bits.push(`<span class="tag">${esc(COPY.notSentYet)}</span>`);
  if (r.feel) bits.push(esc(FEEL_WORD[r.feel]));
  if (r.check_0_10 !== null && checkLabel) bits.push(`${esc(checkLabel)} ${r.check_0_10}`);
  const note = firstLine(r.note);
  return `<button type="button" class="session-row" data-key="${key}">
      <span class="s-badge" aria-hidden="true">${esc(badge(r))}</span>
      <span class="s-main">
        <span class="s-when">${esc(when)}</span>
        <span class="s-bits">${bits.join(' · ')}</span>
        ${note ? `<span class="s-note">${esc(note)}</span>` : ''}
      </span>
    </button>`;
}

export interface SessionListOptions {
  items: ListedSession[];
  program: Program | null;
  onOpen: (item: ListedSession) => void;
  onBack: () => void;
  /** Scroll back to where she was when she returns from a detail page. */
  scrollTo: number;
}

/** "Right", or "round 1 Right · round 2 Hard" when it was done in several rounds. */
function feelWords(list: (Feel | null)[]): string {
  if (list.length === 1 && list[0] !== null) return FEEL_WORD[list[0]];
  return list
    .map((f, k) => (f === null ? '' : `round ${k + 1} ${FEEL_WORD[f]}`))
    .filter((s) => s !== '')
    .join(' · ');
}

export function renderSessionList(root: HTMLElement, opts: SessionListOptions): void {
  const label = opts.program?.checkLabel ?? null;
  root.innerHTML = `
    <section class="sessions">
      <div class="runbar"><button type="button" class="back-link" id="sessions-back">‹ Home</button></div>
      <h1 id="sessions-title">${esc(COPY.sessionsTitle)}</h1>
      ${
        opts.items.length === 0
          ? `<p class="quiet" id="sessions-empty">${esc(COPY.sessionsEmpty)}</p>`
          : `<div class="session-list" id="session-list">${opts.items
              .map((it, k) => rowHtml(it, k, label))
              .join('')}</div>`
      }
    </section>`;
  $(root, '#sessions-back').addEventListener('click', opts.onBack);
  root.querySelector('#session-list')?.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.session-row');
    if (!row) return;
    const item = opts.items[Number(row.dataset.key)];
    if (item) opts.onOpen(item);
  });
  if (opts.scrollTo > 0) window.scrollTo(0, opts.scrollTo);
}

const PART_WORD = { warmup: 'warm-up', main: 'main', cooldown: 'cool-down' } as const;
const MARK = { done: '✓', skipped: '↷', hurt: '⚠' } as const;

export interface SessionDetailOptions {
  item: ListedSession;
  program: Program | null;
  /** Returns 'saved' (sent or queued) or 'refused'. */
  onSaveNote: (note: string) => Promise<'saved' | 'refused'>;
  tellHref: string | null;
  onBack: () => void;
}

function num(n: number | null | undefined): string | null {
  return n === null || n === undefined ? null : String(n);
}

export function detailLines(r: SessionSummary, program: Program | null): string[] {
  const label = program?.checkLabel ?? COPY.checkDefault;
  const lines: string[] = [];
  const times: string[] = [];
  if (r.started_at) times.push(`Started ${formatClock(Date.parse(r.started_at))}`);
  times.push(`Finished ${formatClock(Date.parse(r.done_at))}`);
  if (r.duration_sec !== null) times.push(formatLength(r.duration_sec));
  lines.push(times.join(' · '));
  if (r.lite) lines.push('Lite day');
  const stop = r.readings.stopped_at;
  if (stop) {
    lines.push(
      stop.move
        ? `Stopped early at ${stop.move} (${PART_WORD[stop.part]}, round ${stop.round})`
        : `Stopped early in the ${PART_WORD[stop.part]}`
    );
  }
  const before = r.readings.before;
  if (before) {
    const parts = [
      num(before.body) && `body ${before.body}`,
      num(before.mood) && `mood ${before.mood}`,
      num(before.check) && `${label} ${before.check}`,
    ].filter((p): p is string => !!p);
    if (parts.length > 0) lines.push(`Before: ${parts.join(' · ')}`);
  }
  const after = r.readings.after;
  if (after) {
    const parts = [
      num(after.body) && `body ${after.body}`,
      num(after.mood) && `mood ${after.mood}`,
    ].filter((p): p is string => !!p);
    if (parts.length > 0) lines.push(`After: ${parts.join(' · ')}`);
  }
  if (r.check_0_10 !== null) lines.push(`${label} ${r.check_0_10}`);
  if (r.feel) lines.push(`How it was: ${FEEL_WORD[r.feel]}`);
  return lines;
}

export function renderSessionDetail(root: HTMLElement, opts: SessionDetailOptions): void {
  const r = opts.item.record;
  const title = `${workoutName(opts.program, r.workout)} · ${formatDateClock(Date.parse(r.done_at))}`;
  const lines = detailLines(r, opts.program)
    .map((l) => `<p class="d-line">${esc(l)}</p>`)
    .join('');
  const holds = r.readings.holds
    ? Object.entries(r.readings.holds)
        .map(([name, secs]) => `<li>${esc(name)}: ${secs.map((s) => `${s} s`).join(' · ')}</li>`)
        .join('')
    : '';
  const feels = r.readings.move_feel
    ? Object.entries(r.readings.move_feel)
        .map(([name, list]) => `<li>${esc(name)}: ${esc(feelWords(list))}</li>`)
        .join('')
    : '';
  const moves = r.moves
    .map(
      (m) =>
        `<li><span class="step-mark" aria-hidden="true">${MARK[m.status]}</span>${esc(m.name)}${
          m.option ? ` · ${esc(m.option)}` : ''
        } <span class="quiet">${esc(
          m.part === 'main' ? `round ${m.round}` : PART_WORD[m.part]
        )}</span></li>`
    )
    .join('');
  root.innerHTML = `
    <section class="session-detail">
      <div class="runbar"><button type="button" class="back-link" id="detail-back">‹ Back</button></div>
      <h1 id="detail-title">${esc(title)}</h1>
      ${opts.item.unsent ? `<p class="quiet" id="detail-unsent">${esc(COPY.notSentYet)}</p>` : ''}
      ${lines}
      ${holds ? `<h2>Holds</h2><ul class="d-list" id="detail-holds">${holds}</ul>` : ''}
      ${feels ? `<h2>How each move felt</h2><ul class="d-list" id="detail-feels">${feels}</ul>` : ''}
      ${moves ? `<h2>Moves</h2><ul class="d-list" id="detail-moves">${moves}</ul>` : ''}
      <h2>Note</h2>
      <div id="note-area"></div>
    </section>`;
  $(root, '#detail-back').addEventListener('click', opts.onBack);

  const area = $(root, '#note-area');
  let note = r.note;
  const showRead = (error = ''): void => {
    area.innerHTML = `
      <p id="detail-note" dir="auto">${note ? esc(note) : `<span class="quiet">${esc(COPY.noNote)}</span>`}</p>
      <p class="error" id="note-error" role="alert">${esc(error)}</p>
      <button type="button" class="btn btn-soft" id="edit-note-btn">${esc(COPY.editNote)}</button>`;
    $(area, '#edit-note-btn').addEventListener('click', showEdit);
  };
  const showEdit = (): void => {
    area.innerHTML = `
      <label class="sr-only" for="note-edit">${esc(COPY.noteQuestion)}</label>
      <textarea id="note-edit" dir="auto" rows="4" maxlength="2000"></textarea>
      <div class="actions">
        <button type="button" class="btn btn-main" id="note-save">${esc(COPY.saveNote)}</button>
        <button type="button" class="btn btn-soft" id="note-cancel">${esc(COPY.cancel)}</button>
      </div>`;
    const box = $<HTMLTextAreaElement>(area, '#note-edit');
    box.value = note ?? '';
    box.focus();
    $(area, '#note-cancel').addEventListener('click', () => showRead());
    $(area, '#note-save').addEventListener('click', () => {
      const text = box.value.trim();
      const btn = $<HTMLButtonElement>(area, '#note-save');
      btn.disabled = true;
      void opts.onSaveNote(text).then((result) => {
        if (result === 'saved') {
          note = text === '' ? null : text;
          showRead();
        } else {
          showRead(COPY.saveRefused);
          if (opts.tellHref) {
            const link = document.createElement('a');
            link.className = 'tell';
            link.href = opts.tellHref;
            link.target = '_blank';
            link.rel = 'noopener';
            link.id = 'note-tell';
            link.textContent = COPY.tellButton;
            area.appendChild(link);
          }
        }
      });
    });
  };
  showRead();
}
