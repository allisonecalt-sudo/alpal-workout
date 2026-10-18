import { expect, test } from '@playwright/test';
import { formatCode, isValidCode, normaliseCode } from '../code';

test('normalise: uppercase, drop spaces and dashes', () => {
  expect(normaliseCode('abcd-2345')).toBe('ABCD2345');
  expect(normaliseCode(' abcd 2345 ')).toBe('ABCD2345');
  expect(normaliseCode('ab-cd 23-45')).toBe('ABCD2345');
});

test('normalise: any dash, dot, space or invisible character is dropped', () => {
  expect(normaliseCode('a0b1\u20131c2d')).toBe('A0B11C2D'); // en-dash
  expect(normaliseCode('a0b1\u20141c2d')).toBe('A0B11C2D'); // em-dash
  expect(normaliseCode('a0b1\u22121c2d')).toBe('A0B11C2D'); // minus sign
  expect(normaliseCode('a0b1.1c2d')).toBe('A0B11C2D');
  expect(normaliseCode('a0b1\u00a01c2d')).toBe('A0B11C2D'); // no-break space
  expect(normaliseCode('\u200ba0b1\u200b-1c2d\n')).toBe('A0B11C2D'); // zero-width, newline
  expect(normaliseCode('A0B1 \u2013 1C2D')).toBe('A0B11C2D');
});

test('normalise: O becomes 0, I and L become 1', () => {
  expect(normaliseCode('aob1-ic2d')).toBe('A0B11C2D');
  expect(normaliseCode('LIO0')).toBe('1100');
});

test('valid code is 8 Crockford characters', () => {
  expect(isValidCode('ABCD2345')).toBe(true);
  expect(isValidCode('01234567')).toBe(true);
  expect(isValidCode('ABCD234')).toBe(false); // too short
  expect(isValidCode('ABCD23456')).toBe(false); // too long
  expect(isValidCode('ABCDU234')).toBe(false); // U is not in the alphabet
  expect(isValidCode('ABCD234!')).toBe(false);
});

test('format shows XXXX-XXXX', () => {
  expect(formatCode('ABCD2345')).toBe('ABCD-2345');
  expect(formatCode('ABC')).toBe('ABC');
});
