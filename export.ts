// "Export my data": everything this phone knows, as one JSON file named with the date.
import type { GuestData, QueueItem } from './types';

export interface ExportSettings {
  voice: boolean;
  beeps: boolean;
  restSeconds: number | null;
  getReadySeconds: number;
}

/** 2026-10-19, in local time. */
export function dateStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function exportFileName(ms: number): string {
  return `my-workouts-${dateStamp(ms)}.json`;
}

export function buildExport(
  data: GuestData,
  queue: QueueItem[],
  settings: ExportSettings,
  version: string,
  now: number
): string {
  const body = {
    exported_at: new Date(now).toISOString(),
    app_version: version,
    program_week: data.program?.week ?? null,
    sessions: data.sessions,
    not_sent_yet: queue,
    settings,
  };
  return JSON.stringify(body, null, 2);
}

/**
 * Hand the file over. Where the phone can share files (an iPhone), use its Share sheet; anywhere
 * else, or if sharing fails for any reason other than her cancelling, fall back to a download.
 */
export async function exportFile(fileName: string, text: string): Promise<void> {
  const file = new File([text], fileName, { type: 'application/json' });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // she closed the sheet
  }
  downloadText(fileName, text);
}

/** A plain download. */
export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
