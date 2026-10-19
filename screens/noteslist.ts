// "Your notes": her notes to Allison, newest first. Used inside the note sheet and in Settings.
import { formatClock } from '../clock';
import { COPY } from '../copy';
import { esc } from '../dom';
import { formatSeconds, type ListedNote } from '../notes';

function when(iso: string): string {
  const ms = Date.parse(iso);
  const day = new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${formatClock(ms)}`;
}

function stateText(n: ListedNote): string {
  if (n.status === 'got') return COPY.noteGot;
  return n.status === 'sent' ? COPY.noteSentWord : COPY.noteWaiting;
}

function whatHtml(n: ListedNote): string {
  if (n.kind === 'voice') return `🎤 ${formatSeconds(n.duration_sec ?? 0)}`;
  const first = (n.text ?? '').split('\n')[0];
  return `<span dir="auto">✎ ${esc(first)}</span>`;
}

export function notesListHtml(items: ListedNote[]): string {
  if (items.length === 0) return `<p class="quiet" id="notes-empty">${esc(COPY.notesEmpty)}</p>`;
  return `<ul class="notes-list" id="notes-list">${items
    .map(
      (n) => `<li class="note-row" data-id="${esc(n.client_id)}" data-status="${n.status}">
        <span class="note-when">${esc(when(n.created_at))}</span>
        <span class="note-what">${whatHtml(n)}</span>
        <span class="note-state">${esc(stateText(n))}</span>
      </li>`
    )
    .join('')}</ul>`;
}
