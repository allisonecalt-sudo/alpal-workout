// The how-to lines, the optional video, the optional spoken explanation ("Hear how") and the
// "More about this move" block. Shared by the workout screen, the read-only move sheet on Home
// and the cool-down rows.
import { pauseAudio, startAudio, stopAudio } from '../audio';
import { COPY } from '../copy';
import { esc } from '../dom';
import { explainSource, isMissing, loadExplanation } from '../explain';
import { formatSeconds } from '../notes';
import type { Move } from '../types';
import { embedUrl, thumbnailUrl, youtubeId } from '../video';

function list(items: string[] | undefined): string {
  return items && items.length > 0
    ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
}

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

/** `suffix` keeps the ids apart when several moves are on one page (the cool-down list). */
export function moveInfoHtml(move: Move, suffix = ''): string {
  const how = move.how.map((l) => `<li>${esc(l)}</li>`).join('');
  const hasVideo = move.video !== undefined && youtubeId(move.video) !== null;
  const hasAudio = move.audio === true && !isMissing(move.name);
  const pills =
    hasVideo || hasAudio
      ? `<div class="pill-row" id="pills${suffix}">${
          hasAudio
            ? `<button type="button" class="btn btn-soft pill" id="hear-btn${suffix}" aria-expanded="false">${COPY.hearHow}</button>`
            : ''
        }${
          hasVideo
            ? `<button type="button" class="btn btn-soft pill" id="video-btn${suffix}" aria-expanded="false">${COPY.watchHow}</button>`
            : ''
        }</div>
       <div id="audio-holder${suffix}" class="audio-holder"></div>
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
  return `${framesHtml(move)}<ul class="how" id="how${suffix}">${how}</ul>${pills}${details}`;
}

/** Take down every open video player (starting a sound removes them). */
function closeVideos(): void {
  document.querySelectorAll<HTMLElement>('.video-holder').forEach((holder) => {
    if (holder.childElementCount === 0) return;
    holder.replaceChildren();
    const btn = document.getElementById(holder.id.replace('video-holder', 'video-btn'));
    if (btn) {
      btn.textContent = COPY.watchHow;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function playerHtml(): string {
  return `<div class="player" role="group" aria-label="Explanation">
      <button type="button" class="btn btn-soft player-btn" aria-label="Pause">⏸</button>
      <div class="player-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="player-fill"></div></div>
      <span class="player-time">0:00 / 0:00</span>
    </div>`;
}

/** Wire the Hear how button: it fetches (or finds) the sound, then shows an inline player. */
function wireHear(root: HTMLElement, move: Move, suffix: string): void {
  const btn = root.querySelector<HTMLButtonElement>(`#hear-btn${suffix}`);
  const holder = root.querySelector<HTMLElement>(`#audio-holder${suffix}`);
  if (!btn || !holder) return;
  const close = (): void => {
    stopAudio();
    holder.replaceChildren();
    btn.textContent = COPY.hearHow;
    btn.setAttribute('aria-expanded', 'false');
  };
  let loading = false;
  btn.addEventListener('click', () => {
    if (loading) return;
    if (holder.childElementCount > 0) return close(); // open (or showing a message): hide it
    loading = true;
    btn.textContent = COPY.hearLoading;
    void loadExplanation(explainSource().code, move.name, explainSource().version).then((res) => {
      loading = false;
      if (!btn.isConnected) return; // she moved on while it loaded
      btn.textContent = COPY.hearHow;
      if (res.kind === 'missing') {
        btn.remove();
        return;
      }
      if (res.kind === 'offline') {
        holder.innerHTML = `<p class="quiet" id="audio-msg">${esc(COPY.hearOffline)}</p>`;
        btn.setAttribute('aria-expanded', 'true');
        return;
      }
      holder.innerHTML = playerHtml();
      btn.textContent = COPY.hearHide;
      btn.setAttribute('aria-expanded', 'true');
      const toggle = holder.querySelector<HTMLButtonElement>('.player-btn');
      const fill = holder.querySelector<HTMLElement>('.player-fill');
      const bar = holder.querySelector<HTMLElement>('.player-bar');
      const time = holder.querySelector<HTMLElement>('.player-time');
      closeVideos(); // one sound at a time
      const el = startAudio(res.url);
      const paint = (): void => {
        const total = Number.isFinite(el.duration) ? el.duration : 0;
        const at = el.currentTime;
        const pct = total > 0 ? Math.min(100, (at / total) * 100) : 0;
        if (fill) fill.style.width = `${pct}%`;
        bar?.setAttribute('aria-valuenow', String(Math.round(pct)));
        if (time) time.textContent = `${formatSeconds(at)} / ${formatSeconds(total)}`;
      };
      const label = (): void => {
        if (!toggle) return;
        toggle.textContent = el.paused ? '▶' : '⏸';
        toggle.setAttribute('aria-label', el.paused ? 'Play' : 'Pause');
      };
      el.addEventListener('timeupdate', paint);
      el.addEventListener('loadedmetadata', paint);
      el.addEventListener('play', label);
      el.addEventListener('play', closeVideos); // every way of playing removes an open video
      el.addEventListener('pause', label);
      el.addEventListener('ended', () => {
        el.currentTime = 0;
        paint();
        label();
      });
      toggle?.addEventListener('click', () => {
        if (el.paused) void el.play().catch(() => undefined);
        else el.pause();
      });
      paint();
      label();
      void el.play().catch(() => label()); // a phone may want one more tap: Play is there
    });
  });
}

/** Wire the buttons. The video player is created on the first tap and removed on Hide. */
export function wireMoveInfo(root: HTMLElement, move: Move, suffix = ''): void {
  // a picture that cannot load is simply left out (no broken-image box, no layout jump)
  root
    .querySelectorAll<HTMLImageElement>('.frame img')
    .forEach((img) => img.addEventListener('error', () => img.closest('.frame')?.remove()));
  wireHear(root, move, suffix);
  const btn = root.querySelector<HTMLButtonElement>(`#video-btn${suffix}`);
  const holder = root.querySelector<HTMLElement>(`#video-holder${suffix}`);
  if (!btn || !holder || move.video === undefined) return;
  const id = youtubeId(move.video);
  if (id === null) return;
  btn.addEventListener('click', () => {
    const open = holder.childElementCount > 0;
    if (open) {
      holder.replaceChildren(); // removing the iframe stops the sound
      btn.textContent = COPY.watchHow;
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    pauseAudio(); // the explanation never talks over a video
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
