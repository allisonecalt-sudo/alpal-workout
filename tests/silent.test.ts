import { expect, test } from '@playwright/test';
import { SILENT_CLIP } from '../audio';

test('the unlock clip is a real MP3 of about a third of a second, under 3 KB', () => {
  expect(SILENT_CLIP.startsWith('data:audio/mpeg;base64,')).toBe(true);
  expect(SILENT_CLIP.length).toBeLessThan(3000);
  const bytes = Buffer.from(SILENT_CLIP.split(',')[1], 'base64');
  expect(bytes.length).toBeGreaterThan(300); // not an empty file
  expect(bytes.subarray(0, 3).toString('latin1')).toBe('ID3');
  // at least a few audio frames (an MPEG frame starts with 0xFF 0xEx/0xFx)
  let frames = 0;
  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) frames += 1;
  }
  expect(frames).toBeGreaterThanOrEqual(10);
});
