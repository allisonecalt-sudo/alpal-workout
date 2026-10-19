// The "Note to Allison" bottom sheet: record a voice note (or write one) and send it. It sits
// above everything, including Paused and the Exit sheet, and the workout keeps running behind.
import { pauseAudio, startAudio, stopAudio } from '../audio';
import { COPY } from '../copy';
import { $, esc } from '../dom';
import { muteBeeps } from '../device';
import { blobToBase64, formatSeconds, sendNote, type ListedNote, type QueuedNote } from '../notes';
import { newClientId } from '../queue';
import {
  MAX_SECONDS,
  MicError,
  startRecorder,
  type ActiveRecorder,
  type Recording,
} from '../recorder';
import { notesListHtml } from './noteslist';

export interface NoteSheetOptions {
  /** The code of this phone, read when sending. */
  code: () => string;
  /** The WhatsApp link, or null when the store has no number. */
  whatsappHref: () => string | null;
  /** Her notes (waiting, sent), newest first. */
  items: () => ListedNote[];
  /** Something was sent or kept: the screens may want to redraw. */
  onChanged: () => void;
  /** Where she is (a screen name); sent with the note. */
  context?: string;
  /** Open already recording, or already on the write view. */
  start?: 'record' | 'write';
}

type View = 'idle' | 'recording' | 'review' | 'write' | 'denied' | 'list' | 'done';

const SHEET_ID = 'note-sheet';

let recorder: ActiveRecorder | null = null;
let ticker: number | undefined;
let closer: number | undefined;
let recording: Recording | null = null;
let recordingUrl: string | null = null;
let hitLimit = false;
let draft = '';

export function noteSheetOpen(): boolean {
  return document.getElementById(SHEET_ID) !== null;
}

function endTicker(): void {
  window.clearInterval(ticker);
  ticker = undefined;
}

/** Let go of the recording being checked (and stop it if it is the sound playing). */
function releaseRecording(): void {
  if (recordingUrl !== null) stopAudio();
  if (recordingUrl !== null) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  recording = null;
}

/** Close the sheet; whatever was being recorded is dropped and the microphone let go. */
export function closeNoteSheet(): void {
  endTicker();
  window.clearTimeout(closer);
  closer = undefined;
  recorder?.cancel();
  recorder = null;
  muteBeeps(false);
  releaseRecording();
  hitLimit = false;
  draft = '';
  document.getElementById(SHEET_ID)?.remove();
}

export function openNoteSheet(opts: NoteSheetOptions): void {
  if (noteSheetOpen()) return;
  const sheet = document.createElement('div');
  sheet.id = SHEET_ID;
  sheet.className = 'note-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', COPY.noteTitle);
  document.body.appendChild(sheet);
  let view: View = 'idle';
  let doneText = '';
  let busy = false;

  // The backdrop only closes the sheet when nothing would be lost.
  sheet.addEventListener('click', (e) => {
    if (e.target !== sheet) return;
    if (view === 'recording' || view === 'review' || (view === 'write' && draft.trim() !== '')) {
      return;
    }
    closeNoteSheet();
  });

  const setError = (text: string): void => {
    const el = sheet.querySelector('#note-error');
    if (el) el.textContent = text;
  };

  const go = (next: View): void => {
    view = next;
    paint();
  };

  const startRecording = async (): Promise<void> => {
    pauseAudio(); // recording pauses an explanation that is playing
    try {
      recorder = await startRecorder();
    } catch (e) {
      if (e instanceof MicError) return go('denied');
      throw e;
    }
    muteBeeps(true);
    hitLimit = false;
    releaseRecording();
    go('recording');
  };

  const stopRecording = async (limit: boolean): Promise<void> => {
    const r = recorder;
    if (!r) return;
    recorder = null;
    endTicker();
    muteBeeps(false);
    try {
      recording = await r.stop();
    } catch {
      return go('denied');
    }
    recordingUrl = URL.createObjectURL(recording.blob);
    hitLimit = limit;
    go('review');
  };

  const send = async (): Promise<void> => {
    if (busy) return;
    const base = {
      client_id: newClientId(),
      created_at: new Date().toISOString(),
      ...(opts.context ? { context: opts.context.slice(0, 200) } : {}),
    };
    let note: QueuedNote;
    if (view === 'review' && recording) {
      busy = true;
      const audio_b64 = await blobToBase64(recording.blob);
      note = {
        ...base,
        kind: 'voice',
        audio_b64,
        mime: recording.mime,
        duration_sec: recording.durationSec,
      };
    } else if (view === 'write' && draft.trim() !== '') {
      busy = true;
      note = { ...base, kind: 'text', text: draft.trim() };
    } else return;
    const btn = sheet.querySelector<HTMLButtonElement>('#note-send');
    if (btn) btn.disabled = true;
    const outcome = await sendNote(opts.code(), note);
    busy = false;
    if (outcome === 'refused' || outcome === 'unsaved') {
      if (btn) btn.disabled = false;
      setError(outcome === 'refused' ? COPY.noteRefused : COPY.noteUnsaved);
      return;
    }
    releaseRecording();
    draft = '';
    doneText = outcome === 'sent' ? COPY.noteSent : COPY.savedLocal;
    opts.onChanged();
    go('done');
    closer = window.setTimeout(closeNoteSheet, 2000);
  };

  const body = (): string => {
    const wa = opts.whatsappHref();
    switch (view) {
      case 'idle':
        return `
          <h2 class="exit-title">${esc(COPY.noteTitle)}</h2>
          <p class="quiet">${esc(COPY.noteLine)}</p>
          <button type="button" class="btn btn-main note-big" id="rec-start">${esc(COPY.noteRecord)}</button>
          <button type="button" class="btn btn-soft" id="write-start">${esc(COPY.noteWrite)}</button>
          <div class="note-foot">
            <button type="button" class="back-link" id="notes-door">${esc(COPY.notesDoor)}</button>
            ${
              wa
                ? `<a class="note-wa" id="note-wa" href="${esc(wa)}" target="_blank" rel="noopener">${esc(COPY.noteWhatsapp)}</a>`
                : ''
            }
          </div>`;
      case 'recording':
        return `
          <h2 class="exit-title">${esc(COPY.noteTitle)}</h2>
          <div class="rec-row"><span class="rec-dot" aria-hidden="true"></span><span class="rec-time" id="rec-time" role="timer">0:00</span></div>
          <button type="button" class="btn btn-main note-big" id="rec-stop">${esc(COPY.noteStop)}</button>`;
      case 'review':
        return `
          <h2 class="exit-title">${esc(COPY.noteTitle)}</h2>
          ${hitLimit ? `<p id="note-limit">${esc(COPY.noteLimit)}</p>` : ''}
          <button type="button" class="btn btn-soft" id="rec-play">${esc(COPY.notePlay)} · ${formatSeconds(recording?.durationSec ?? 0)}</button>
          <button type="button" class="btn btn-soft" id="rec-again">${esc(COPY.noteAgain)}</button>
          <button type="button" class="btn btn-main" id="note-send">${esc(COPY.noteSend)}</button>
          <p class="error" id="note-error" role="alert"></p>`;
      case 'write':
        return `
          <h2 class="exit-title">${esc(COPY.noteTitle)}</h2>
          <label class="sr-only" for="note-text">${esc(COPY.noteTitle)}</label>
          <textarea id="note-text" dir="auto" rows="5" maxlength="4000" placeholder="${esc(COPY.noteWritePlaceholder)}">${esc(draft)}</textarea>
          <button type="button" class="btn btn-main" id="note-send" ${draft.trim() === '' ? 'disabled' : ''}>${esc(COPY.noteSend)}</button>
          <p class="error" id="note-error" role="alert"></p>`;
      case 'denied':
        return `
          <h2 class="exit-title">${esc(COPY.noteTitle)}</h2>
          <p id="mic-denied">${esc(COPY.noteMicDenied)}</p>
          <button type="button" class="btn btn-main" id="write-start">${esc(COPY.noteWrite)}</button>`;
      case 'list':
        return `
          <h2 class="exit-title">${esc(COPY.notesTitle)}</h2>
          <div id="notes-box">${notesListHtml(opts.items())}</div>
          <button type="button" class="back-link" id="note-back">${esc(COPY.noteBack)}</button>`;
      case 'done':
        return `<p class="note-done" id="note-done" role="status">${esc(doneText)}</p>`;
    }
  };

  function paint(): void {
    sheet.innerHTML = `<div class="note-card">${body()}${
      view === 'done'
        ? ''
        : `<button type="button" class="back-link note-close" id="note-close">${esc(COPY.noteClose)}</button>`
    }</div>`;
    wire();
  }

  function wire(): void {
    sheet.querySelector('#note-close')?.addEventListener('click', closeNoteSheet);
    sheet.querySelector('#rec-start')?.addEventListener('click', () => void startRecording());
    sheet.querySelector('#write-start')?.addEventListener('click', () => go('write'));
    sheet.querySelector('#notes-door')?.addEventListener('click', () => go('list'));
    sheet.querySelector('#note-back')?.addEventListener('click', () => go('idle'));
    sheet.querySelector('#note-send')?.addEventListener('click', () => void send());
    sheet.querySelector('#rec-stop')?.addEventListener('click', () => void stopRecording(false));
    sheet.querySelector('#rec-again')?.addEventListener('click', () => {
      releaseRecording();
      void startRecording();
    });
    const area = sheet.querySelector<HTMLTextAreaElement>('#note-text');
    if (area) {
      area.addEventListener('input', () => {
        draft = area.value;
        const btn = sheet.querySelector<HTMLButtonElement>('#note-send');
        if (btn) btn.disabled = draft.trim() === '';
      });
      area.focus();
    }
    const play = sheet.querySelector<HTMLButtonElement>('#rec-play');
    if (play && recordingUrl) {
      const label = formatSeconds(recording?.durationSec ?? 0);
      let el: HTMLAudioElement | null = null;
      play.addEventListener('click', () => {
        if (el && !el.paused) {
          el.pause();
          return;
        }
        if (!el) {
          el = startAudio(recordingUrl ?? '');
          el.addEventListener('play', () => {
            play.textContent = `${COPY.notePause} · ${label}`;
          });
          const back = (): void => {
            play.textContent = `${COPY.notePlay} · ${label}`;
          };
          el.addEventListener('pause', back);
          el.addEventListener('ended', back);
        }
        void el.play().catch(() => undefined);
      });
    }
    if (view === 'recording') {
      const time = $(sheet, '#rec-time');
      endTicker();
      ticker = window.setInterval(() => {
        const r = recorder;
        if (!r) return;
        const t = r.elapsed();
        time.textContent = formatSeconds(t);
        if (t >= MAX_SECONDS) void stopRecording(true);
      }, 250);
    }
  }

  paint();
  if (opts.start === 'write') go('write');
  else if (opts.start === 'record') void startRecording();
}
