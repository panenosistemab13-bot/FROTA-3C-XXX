/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'coffee-dark': 'var(--color-coffee-dark)',
        'coffee': 'var(--color-coffee)',
        'ivory': 'var(--color-ivory)',
        'accent-gold': 'var(--color-accent-gold)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
}
