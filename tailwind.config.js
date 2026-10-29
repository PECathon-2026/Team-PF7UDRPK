/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        reader: {
          bg: 'var(--reader-bg)',
          surface: 'var(--reader-surface)',
          surfaceHover: 'var(--reader-surface-hover)',
          selected: 'var(--reader-selected)',
          border: 'var(--reader-border)',
          borderMuted: 'var(--reader-border-muted)',
          accent: 'var(--reader-accent)',
          accentHover: 'var(--reader-accent-hover)',
          accentBg: 'var(--reader-accent-bg)',
          text: 'var(--reader-text)',
          muted: 'var(--reader-muted)',
          dim: 'var(--reader-dim)',
          unread: 'var(--reader-unread)',
          star: 'var(--reader-star)',
          danger: '#EF4444',
          success: '#10B981',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        serif: [
          '"Newsreader"',
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'Times',
          'serif',
        ],
      },
    },
  },
  plugins: [],
};
