import { describe, expect, it } from 'vitest';
import { keychainServiceFor } from '../../scripts/mcp-shared.mjs';
import { readConfig } from './config';

function jwt(role: string): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ role })}.sig`;
}

const env = (key: string, url = 'https://example.supabase.co') => ({
  PENTEST_MCP_SUPABASE_URL: url,
  PENTEST_MCP_SUPABASE_KEY: key,
});

describe('readConfig', () => {
  it('公開キーを受け付ける', () => {
    expect(readConfig(env(jwt('anon'))).url).toBe('https://example.supabase.co');
    expect(readConfig(env('sb_publishable_abc')).publicKey).toBe('sb_publishable_abc');
  });

  it.each([
    ['service_role の JWT', jwt('service_role')],
    ['sb_secret_', 'sb_secret_abcdef'],
    ['その他の役割', jwt('supabase_admin')],
    ['形式不明', 'not-a-key'],
  ])('%s を拒否し、値をエラーに出さない', (_label, key) => {
    let message = '';
    try {
      readConfig(env(key));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/公開キー/);
    expect(message).not.toContain(key);
  });

  it('環境変数が無ければ拒否する', () => {
    expect(() => readConfig({})).toThrow(/PENTEST_MCP_SUPABASE_URL/);
  });

  it('http はこの Mac の中だけ許可する', () => {
    expect(readConfig(env(jwt('anon'), 'http://127.0.0.1:54621')).url).toBe('http://127.0.0.1:54621');
    expect(() => readConfig(env(jwt('anon'), 'http://example.com'))).toThrow(/https/);
    expect(() => readConfig(env(jwt('anon'), 'ftp://example.com'))).toThrow(/https/);
  });

  it('取り込みのフォルダは未設定なら null', () => {
    expect(readConfig(env(jwt('anon'))).importDir).toBeNull();
  });
});

describe('keychainServiceFor', () => {
  it('接続先ごとに分ける', () => {
    expect(keychainServiceFor('http://127.0.0.1:54621/x')).toBe('pentest-dashboard-mcp/127.0.0.1:54621');
    expect(keychainServiceFor('https://a.supabase.co')).not.toBe(keychainServiceFor('https://b.supabase.co'));
  });
});
