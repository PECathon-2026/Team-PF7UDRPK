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
          bg: '#101116',
          surface: '#17181F',
          surfaceHover: '#1E202A',
          selected: '#2C2F39',
          border: '#272935',
          borderMuted: '#1E202B',
          accent: '#A8B7FF',
          accentHover: '#C3CCFF',
          accentBg: 'rgba(168, 183, 255, 0.08)',
          text: '#E8E9EF',
          muted: '#8E919E',
          dim: '#5E616E',
          unread: '#818CF8',
          star: '#FBBF24',
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
