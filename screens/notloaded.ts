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
