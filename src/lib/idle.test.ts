import { describe, expect, it } from 'vitest';
import { IDLE_LIMIT_MS, isIdleExpired } from './idle';

describe('isIdleExpired', () => {
  it('上限は 30 分', () => {
    expect(IDLE_LIMIT_MS).toBe(1_800_000);
  });

  it('30 分未満は続行、30 分以上でログアウト', () => {
    expect(isIdleExpired(0, IDLE_LIMIT_MS - 1)).toBe(false);
    expect(isIdleExpired(0, IDLE_LIMIT_MS)).toBe(true);
  });
});
