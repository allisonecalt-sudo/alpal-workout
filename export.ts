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

/** Hand the file to the browser: a download (on an iPhone this opens the Share sheet). */
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
