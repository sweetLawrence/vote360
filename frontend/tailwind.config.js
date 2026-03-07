/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        risk: {
          green:  '#16a34a',
          amber:  '#d97706',
          red:    '#dc2626',
        },
        brand: {
          navy:   '#0f172a',
          slate:  '#1e293b',
          accent: '#2563eb',
        },
      },
    },
  },
  plugins: [],
};
