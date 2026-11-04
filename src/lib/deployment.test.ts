import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>;
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const header = (key: string) => vercel.headers[0]?.headers.find((entry) => entry.key === key)?.value;

describe('公開に備えた設定', () => {
  it('CSP の connect-src は Supabase だけ、script-src は self だけ', () => {
    const csp = header('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/connect-src https:\/\/[A-Za-z0-9-]+\.supabase\.co(;|$)/);
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('必要なヘッダーがすべてある', () => {
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Permissions-Policy')).toContain('camera=()');
    expect(header('X-Robots-Tag')).toContain('noindex');
  });

  it('SPA の rewrite と robots.txt がある', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
    expect(readFileSync(new URL('public/robots.txt', root), 'utf8')).toContain('Disallow: /');
  });

  it('index.html に外部通信やインラインスクリプトが無い', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });
});
