// The time line: "Starting · 9:04. Right?" with Right / Fix, a time picker, and "5 · 10 · 15 min
// ago" chips. Until she touches it, it follows the clock (every minute).
import { formatClock, inputClock, minutesAgo, nowToMinute, withClock } from '../clock';
import { esc } from '../dom';

export interface TimeConfirmOptions {
  kind: 'start' | 'end';
  /** "Starting" / "Finished" */
  label: string;
  /** "Started" / "Finished" (the confirmed line) */
  verb: string;
  at: number;
  touched: boolean;
  /** Until she touches it, follow the clock every minute (the start time does; a finish never). */
  follow: boolean;
  onChange: (at: number, touched: boolean) => void;
}

/** Draw into `el`. Returns a function that stops the minute timer. */
export function mountTimeConfirm(el: HTMLElement, opts: TimeConfirmOptions): () => void {
  let at = opts.at;
  let touched = opts.touched;
  let editing = false;
  const id = opts.kind;

  const set = (next: number, isTouched: boolean): void => {
    at = next;
    touched = isTouched;
    opts.onChange(at, touched);
  };

  const draw = (): void => {
    const clock = formatClock(at);
    if (touched && !editing) {
      el.innerHTML = `<div class="timing-row">
          <p class="timing-line timing-confirmed" id="time-${id}">${esc(opts.verb)} ${clock} ✓</p>
          <button type="button" class="chip chip-inline" id="time-${id}-fix">✎ Fix</button>
        </div>`;
    } else {
      const edit = editing
        ? `<div class="timing-edit">
             <label class="sr-only" for="time-${id}-input">Time</label>
             <input type="time" id="time-${id}-input" value="${inputClock(at)}" />
             <div class="chips-line">${[5, 10, 15]
               .map(
                 (m) =>
                   `<button type="button" class="chip chip-inline" data-ago="${m}">${m} min ago</button>`
               )
               .join('')}</div>
           </div>`
        : '';
      el.innerHTML = `<div class="timing-row">
          <p class="timing-line" id="time-${id}">${esc(opts.label)} · ${clock}. Right?</p>
          <div class="timing-actions">
            <button type="button" class="chip chip-inline" id="time-${id}-ok">✓ Right</button>
            <button type="button" class="chip chip-inline" id="time-${id}-fix">✎ Fix</button>
          </div>
        </div>${edit}`;
    }
    el.querySelector(`#time-${id}-ok`)?.addEventListener('click', () => {
      editing = false;
      set(at, true);
      draw();
    });
    el.querySelector(`#time-${id}-fix`)?.addEventListener('click', () => {
      editing = true;
      set(at, true);
      draw();
    });
    // the time picker reports a new value as "input" on some browsers and "change" on others
    const input = el.querySelector<HTMLInputElement>(`#time-${id}-input`);
    const onPick = (): void => {
      if (!input || !/^\d{1,2}:\d{2}$/.test(input.value)) return; // a half-typed time is ignored
      set(withClock(at, input.value), true);
      const line = el.querySelector(`#time-${id}`);
      if (line) line.textContent = `${opts.label} · ${formatClock(at)}. Right?`;
    };
    input?.addEventListener('input', onPick);
    input?.addEventListener('change', onPick);
    el.querySelectorAll<HTMLElement>('[data-ago]').forEach((chip) =>
      chip.addEventListener('click', () => {
        editing = false;
        set(minutesAgo(Date.now(), Number(chip.dataset.ago)), true);
        draw();
      })
    );
  };

  draw();
  const timer = window.setInterval(() => {
    if (touched || !opts.follow) return;
    set(nowToMinute(), false);
    const line = el.querySelector(`#time-${id}`);
    if (line) line.textContent = `${opts.label} · ${formatClock(at)}. Right?`;
  }, 60_000);
  return () => window.clearInterval(timer);
}
