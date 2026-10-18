// Fail loud when the store gave us nothing. Never a blank screen, never a made-up workout.
import { COPY } from '../copy';

export function renderNotLoaded(root: HTMLElement): void {
  root.innerHTML = `
    <section class="card not-loaded">
      <p id="not-loaded">${COPY.notLoaded}</p>
    </section>`;
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
