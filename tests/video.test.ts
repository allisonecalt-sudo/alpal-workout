import { expect, test } from '@playwright/test';
import { embedUrl, youtubeId } from '../video';

const ID = 'abcdefghijk';

test('reads the id from a watch link', () => {
  expect(youtubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  expect(youtubeId(`https://youtube.com/watch?v=${ID}&t=10s`)).toBe(ID);
  expect(youtubeId(`https://m.youtube.com/watch?feature=share&v=${ID}`)).toBe(ID);
});

test('reads the id from a short link', () => {
  expect(youtubeId(`https://youtu.be/${ID}`)).toBe(ID);
  expect(youtubeId(`https://youtu.be/${ID}?si=xyz`)).toBe(ID);
});

test('reads the id from a shorts link', () => {
  expect(youtubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
});

test('reads the id from an embed link', () => {
  expect(youtubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
});

test('a link it cannot read gives null', () => {
  expect(youtubeId('https://example.com/watch?v=abcdefghijk')).toBeNull();
  expect(youtubeId('https://www.youtube.com/watch?v=short')).toBeNull();
  expect(youtubeId('https://www.youtube.com/playlist?list=abcdefghijk')).toBeNull();
  expect(youtubeId('not a link')).toBeNull();
  expect(youtubeId('javascript:alert(1)')).toBeNull();
  expect(youtubeId('')).toBeNull();
});

test('the embed address is the no-cookie player, inline', () => {
  expect(embedUrl(ID)).toBe(
    `https://www.youtube-nocookie.com/embed/${ID}?playsinline=1&rel=0&modestbranding=1`
  );
});
