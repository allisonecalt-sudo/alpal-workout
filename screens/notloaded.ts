// Fail loud when the store gave us nothing. Never a blank screen, never a made-up workout.
import { COPY } from '../copy';
import { questionsCardHtml } from './home';

export interface NotLoadedOptions {
  /** The store answered but has no program yet: soft words, and her questions below. */
  soon?: { questionsLeft: number; onQuestions: () => void };
}

export function renderNotLoaded(root: HTMLElement, opts: NotLoadedOptions = {}): void {
  const { soon } = opts;
  root.innerHTML = `
    <section class="card not-loaded">
      <p id="not-loaded">${soon ? COPY.notLoadedSoon : COPY.notLoaded}</p>
    </section>
    ${soon ? questionsCardHtml(soon.questionsLeft) : ''}`;
  if (soon) root.querySelector('#questions-btn')?.addEventListener('click', soon.onQuestions);
}

export function renderLoading(root: HTMLElement): void {
  root.innerHTML = `<p class="quiet center">${COPY.loading}</p>`;
}

/** The store is throttling: keep the saved code and let her try again. */
export function renderCantOpen(root: HTMLElement, onRetry: () => void): void {
  root.innerHTML = `
    <section class="card not-loaded">
      <p id="cant-open">${COPY.cantOpen}</p>
      <button type="button" class="btn btn-main" id="retry-btn">${COPY.tryAgain}</button>
    </section>`;
  root.querySelector('#retry-btn')?.addEventListener('click', onRetry);
}
