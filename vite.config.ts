import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: {'/api/recon': {target: process.env.API_GATEWAY_URL || 'http://127.0.0.1:8788', changeOrigin: false}, '^/redteam(?:[/?]|$)': {target: process.env.GHOSTWRITER_PROXY_TARGET || 'http://127.0.0.1:8093', ws: true, changeOrigin: false}} },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', '@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'mcp/src/**/*.test.ts'],
  },
});
