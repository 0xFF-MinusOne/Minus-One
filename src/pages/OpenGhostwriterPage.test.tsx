import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';

vi.mock('../lib/supabase', () => ({ supabase: {}, supabaseConfigured: true }));

describe('/open/redteam', () => {
  it('ログインの確認が済むまで、ガードの外に出ない', () => {
    const html = renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/open/redteam']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('読み込み中');
    expect(html).not.toContain('Ghostwriter を開');
  });
});
