// Voice notes: the microphone and MediaRecorder, kept apart from the screen. The mic is only
// open while recording; every track is released on stop or cancel.

/** A note stops by itself here (3 minutes). */
export const MAX_SECONDS = 180;

export interface Recording {
  blob: Blob;
  /** e.g. audio/mp4 (iPhone) or audio/webm */
  mime: string;
  durationSec: number;
}

export interface ActiveRecorder {
  /** Seconds since it started, by the wall clock. */
  elapsed: () => number;
  stop: () => Promise<Recording>;
  /** Throw it away and release the microphone. */
  cancel: () => void;
}

/** The phone did not let the app use the microphone, or has none. */
export class MicError extends Error {}

export async function startRecorder(): Promise<ActiveRecorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new MicError('no microphone');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new MicError('refused');
  }
  const release = (): void => stream.getTracks().forEach((t) => t.stop());
  const mime =
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/webm';
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      release();
      throw new MicError('cannot record');
    }
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const startedAt = Date.now();
  rec.start();
  let finished = false;
  return {
    elapsed: () => (Date.now() - startedAt) / 1000,
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        rec.onstop = () => {
          finished = true;
          release();
          if (chunks.length === 0) return reject(new MicError('empty'));
          resolve({ blob: new Blob(chunks, { type: mime }), mime, durationSec });
        };
        try {
          rec.stop();
        } catch {
          release();
          reject(new MicError('cannot stop'));
        }
      }),
    cancel: () => {
      if (finished) return;
      finished = true;
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* already stopped */
      }
      release();
    },
  };
}
