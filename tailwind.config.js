/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ededf8',
          100: '#d0d0ef',
          500: '#3333aa',
          600: '#2020a0',
          700: '#18188a',
          900: '#0e0e6e',
        }
      }
    }
  },
  plugins: [],
}
