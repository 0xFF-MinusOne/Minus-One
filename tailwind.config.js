/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Hiragino Sans'", "'ヒラギノ角ゴシック'", 'sans-serif'],
        mono: ["'SF Mono'", 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          50: '#EDF4FF',
          100: '#DCE9FF',
          200: '#BCD5FF',
          500: '#2F7FE3',
          600: '#1467E0',
          700: '#0F55BD',
        },
        ink: {
          DEFAULT: '#172033',
          soft: '#4A5568',
          muted: '#6B7686',
        },
        line: {
          DEFAULT: '#E3E8F0',
          soft: '#EEF1F6',
        },
        canvas: '#FBFCFE',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 32, 51, 0.05)',
        pop: '0 12px 32px rgba(23, 32, 51, 0.16)',
      },
    },
  },
  plugins: [],
};
