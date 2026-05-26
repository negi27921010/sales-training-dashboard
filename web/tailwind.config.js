/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      gridTemplateColumns: {
        '10': 'repeat(10, minmax(0, 1fr))',
        '14': 'repeat(14, minmax(0, 1fr))',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['"DM Sans"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg:     { DEFAULT: '#FAFAFA', dark: '#0A0A0A' },
        ink:    { DEFAULT: '#0A0A0A', dark: '#F5F5F5' },
        muted:  { DEFAULT: '#6B7280', dark: '#9CA3AF' },
        line:   { DEFAULT: '#E5E5E5', dark: '#1F1F1F' },
        accent: '#0D9488',
        // 5-band score colours
        weak:      '#DC2626',
        ok:        '#F59E0B',
        good:      '#84CC16',
        great:     '#16A34A',
        excellent: '#065F46',
        // status/tone aliases (kept for attendance %, etc.)
        bad:     '#DC2626',
        avg:     '#F59E0B',
        perfect: '#065F46',
      },
    },
  },
  plugins: [],
};
