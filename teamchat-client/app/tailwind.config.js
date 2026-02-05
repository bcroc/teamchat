/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      colors: {
        // Slack-inspired color palette
        primary: {
          50: '#f0f4ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        sidebar: {
          DEFAULT: '#3f0e40',
          hover: '#350d36',
          active: '#1164a3',
          text: '#cfc3cf',
          textBright: '#ffffff',
        },
        channel: {
          bg: '#ffffff',
          hover: '#f8f8f8',
          active: '#1264a3',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
