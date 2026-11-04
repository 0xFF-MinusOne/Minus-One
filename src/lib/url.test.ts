import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './url';

describe('safeHttpUrl', () => {
  it('http と https だけを通す', () => {
    expect(safeHttpUrl('https://example.test/a?b=1')).toBe('https://example.test/a?b=1');
    expect(safeHttpUrl('HTTP://example.test')).toBe('http://example.test/');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
    '//example.test',
    'https://',
    'https:///x',
    'https:\\\\example.test',
    'not a url',
    '',
    null,
    undefined,
  ])('%s は拒否する', (value) => {
    expect(safeHttpUrl(value)).toBeNull();
  });
});
