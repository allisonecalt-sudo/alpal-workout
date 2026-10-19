// The quiet row on every move page: "How was this one?  Easy · Right · Hard". Optional; tapping
// the picked one again clears it; it never blocks Done.
import { COPY } from '../copy';
import { esc } from '../dom';
import type { Feel } from '../types';

const CHOICES: { value: Feel; label: string }[] = [
  { value: 'easy', label: COPY.feelEasy },
  { value: 'right', label: COPY.feelRightShort },
  { value: 'hard', label: COPY.feelHard },
];

export function feelRowHtml(id: string, picked: Feel | null): string {
  return `<div class="feel-row" id="${id}" role="group" aria-label="${esc(COPY.feelRowQuestion)}">
      <span class="feel-q">${esc(COPY.feelRowQuestion)}</span>
      <span class="feel-chips">${CHOICES.map(
        (c) =>
          `<button type="button" class="chip chip-inline" data-feel="${c.value}" aria-pressed="${picked === c.value}">${esc(c.label)}</button>`
      ).join('')}</span>
    </div>`;
}

/** Tap to pick, tap again to clear. `onPick` gets the new answer (null = cleared). */
export function wireFeelRow(
  root: ParentNode,
  id: string,
  onPick: (value: Feel | null) => void
): void {
  const row = root.querySelector<HTMLElement>(`#${id}`);
  if (!row) return;
  row.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
    if (!chip) return;
    const was = chip.getAttribute('aria-pressed') === 'true';
    row.querySelectorAll('button.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    if (was) return onPick(null);
    chip.setAttribute('aria-pressed', 'true');
    onPick(chip.dataset.feel as Feel);
  });
}
