// The how-to lines, the optional video and the "More about this move" block. Shared by the
// workout screen and the read-only move sheet on Home.
import { esc } from '../dom';
import { stopSpeaking } from '../device';
import type { Move } from '../types';
import { embedUrl, thumbnailUrl, youtubeId } from '../video';

function list(items: string[] | undefined): string {
  return items && items.length > 0
    ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
}

/** `suffix` keeps the ids apart when several moves are on one page (the cool-down list). */
/** The pictures for a move: its own two frames, else the video's thumbnail, else nothing. */
export function framesHtml(move: Move): string {
  if (move.images && move.images.length > 0) {
    const labels = ['Start', 'End'];
    return `<div class="frames" id="frames">${move.images
      .map(
        (src, k) =>
          `<figure class="frame"><img src="${esc(src)}" alt="${labels[k] ?? 'Position'} position" loading="lazy" /><figcaption>${labels[k] ?? ''}</figcaption></figure>`
      )
      .join('')}</div>`;
  }
  const id = move.video !== undefined ? youtubeId(move.video) : null;
  if (id !== null) {
    return `<div class="frames frames-thumb" id="frames"><figure class="frame"><img src="${thumbnailUrl(id)}" alt="Video preview" loading="lazy" /></figure></div>`;
  }
  return '';
}

export function moveInfoHtml(move: Move, suffix = ''): string {
  const how = move.how.map((l) => `<li>${esc(l)}</li>`).join('');
  const hasVideo = move.video !== undefined && youtubeId(move.video) !== null;
  const video = hasVideo
    ? `<button type="button" class="btn btn-soft" id="video-btn${suffix}" aria-expanded="false">▶ Watch how</button>
       <div id="video-holder${suffix}" class="video-holder"></div>`
    : '';
  const more = [
    move.why ? `<h3>Why</h3><p>${esc(move.why)}</p>` : '',
    move.tips ? `<h3>Tips</h3>${list(move.tips)}` : '',
    move.watchOut ? `<h3>Watch out</h3>${list(move.watchOut)}` : '',
  ].join('');
  const details =
    more === ''
      ? ''
      : `<details class="more" id="more${suffix}"><summary>More about this move</summary>${more}</details>`;
  return `${framesHtml(move)}<ul class="how" id="how${suffix}">${how}</ul>${video}${details}`;
}

/** Wire the Watch button. The player is created on the first tap and removed on Hide. */
export function wireMoveInfo(root: HTMLElement, move: Move, suffix = ''): void {
  // a picture that cannot load is simply left out (no broken-image box, no layout jump)
  root
    .querySelectorAll<HTMLImageElement>('.frame img')
    .forEach((img) => img.addEventListener('error', () => img.closest('.frame')?.remove()));
  const btn = root.querySelector<HTMLButtonElement>(`#video-btn${suffix}`);
  const holder = root.querySelector<HTMLElement>(`#video-holder${suffix}`);
  if (!btn || !holder || move.video === undefined) return;
  const id = youtubeId(move.video);
  if (id === null) return;
  btn.addEventListener('click', () => {
    const open = holder.childElementCount > 0;
    if (open) {
      holder.replaceChildren(); // removing the iframe stops the sound
      btn.textContent = '▶ Watch how';
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    stopSpeaking(); // the voice never talks over a video
    const frame = document.createElement('iframe');
    frame.src = embedUrl(id);
    frame.title = 'Video';
    frame.allow = 'encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.setAttribute('playsinline', '');
    holder.appendChild(frame);
    btn.textContent = '▼ Hide video';
    btn.setAttribute('aria-expanded', 'true');
  });
}
