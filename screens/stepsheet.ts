// The jump list: every step of the workout (parts and rounds), marked done / skipped / hurt, and a
// tap jumps to it.
import { COPY } from '../copy';
import { $, esc } from '../dom';
import type { Step } from '../steps';
import type { MoveStatus } from '../types';

export interface StepSheetOptions {
  steps: Step[];
  statuses: (MoveStatus | null)[];
  current: number;
  rounds: number;
  onJump: (index: number) => void;
}

const MARK: Record<MoveStatus, string> = { done: '✓', skipped: '↷', hurt: '⚠' };

function groupName(s: Step, rounds: number): string {
  if (s.part === 'warmup') return 'Warm-up';
  return rounds > 1 ? `Round ${s.round}` : 'Main';
}

export function showStepSheet(o: StepSheetOptions): void {
  if (document.getElementById('steps-sheet')) return;
  let last = '';
  const rows = o.steps
    .map((s, k) => {
      const group = groupName(s, o.rounds);
      const heading = group !== last ? `<h3 class="step-group">${esc(group)}</h3>` : '';
      last = group;
      const status = o.statuses[k];
      const label = s.optionLabel ? `${s.move.name} · ${s.optionLabel}` : s.move.name;
      return `${heading}<button type="button" class="step-row" data-step="${k}"${
        k === o.current ? ' aria-current="step"' : ''
      }><span class="step-mark" aria-hidden="true">${status ? MARK[status] : '○'}</span><span class="step-name">${esc(label)}</span></button>`;
    })
    .join('');
  const sheet = document.createElement('div');
  sheet.id = 'steps-sheet';
  sheet.className = 'exit-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', COPY.stepsTitle);
  sheet.innerHTML = `
    <div class="exit-card steps-card">
      <h2 class="exit-title">${esc(COPY.stepsTitle)}</h2>
      <div class="steps-list" id="steps-list">${rows}</div>
      <button type="button" class="btn btn-soft" id="steps-close">${esc(COPY.close)}</button>
    </div>`;
  document.body.appendChild(sheet);
  $(sheet, '#steps-close').addEventListener('click', () => sheet.remove());
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.remove();
    const row = (e.target as HTMLElement).closest<HTMLElement>('.step-row');
    if (row?.dataset.step !== undefined) {
      sheet.remove();
      o.onJump(Number(row.dataset.step));
    }
  });
  sheet.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' });
}

export function closeStepSheet(): void {
  document.getElementById('steps-sheet')?.remove();
}
