/** @type {import('tailwindcss').Config} */

/*
 * Paleta CNL Craniley — Manual de Marca v1.
 *
 *   Azul institucional  #0A1247   Azul profundo  #060B2E
 *   Azul medio          #1B2A6B   Gris texto     #3B4356
 *   Rojo Craniley       #C31B26   Dorado         #C89116
 *   Crema               #F0E2BE   Marfil         #FAF6EC
 *
 * Proporcion de uso: azul 70 % · neutros 20 % · dorado 7 % · rojo 3 %.
 * El rojo nunca como fondo de area grande.
 *
 * Las escalas de gray/red/blue/green/amber/yellow/orange se redefinen para
 * que las utilidades ya usadas en la app caigan dentro de la paleta de marca.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
      },
      colors: {
        // Azul institucional — color primario de la marca
        brand: {
          50:  '#f2f3f8',
          100: '#e2e4f0',
          200: '#c3c7e0',
          300: '#9aa0c8',
          400: '#6e76ac',
          500: '#474f91',
          600: '#303a79',
          700: '#1b2a6b', // azul medio (kit)
          800: '#101b54',
          900: '#0a1247', // azul institucional (kit)
          950: '#060b2e', // azul profundo (kit)
        },
        // Dorado — acentos, vinetas y subrayados (max. 7 % de la superficie)
        dorado: {
          50:  '#fdf8ec',
          100: '#faefd3',
          200: '#f0e2be', // crema (kit)
          300: '#e5c888',
          400: '#d9ab47',
          500: '#c89116', // dorado (kit)
          600: '#a87813',
          700: '#7f5a10',
          800: '#63470d',
          900: '#4a350a',
        },
        // Neutros calidos del kit
        crema:  '#f0e2be',
        marfil: '#faf6ec',
        arena:  '#e7e0d0',
        tinta:  '#14141a',
        'gris-texto': '#3b4356',

        // Neutros del manual de marca
        gray: {
          50:  '#f7f7f9',
          100: '#ededf1',
          200: '#e4e4ea',
          300: '#cfcfd7',
          400: '#9a9aa4',
          500: '#6b6b76',
          600: '#55555f',
          700: '#45454f',
          800: '#2a2a32',
          900: '#14141a',
          950: '#0b0b0f',
        },
        // Rojo Craniley — solo errores y riesgo alto, nunca areas grandes
        red: {
          50:  '#fdf3f3',
          100: '#fbe1e2',
          200: '#f5c2c5',
          300: '#ec969b',
          400: '#de5f68',
          500: '#c31b26', // rojo Craniley (kit)
          600: '#a8161f',
          700: '#86111a',
          800: '#6a0f16',
          900: '#4e0b10',
        },
        // Azul informativo — misma familia institucional, un tono mas claro
        blue: {
          50:  '#eef2fc',
          100: '#dbe3f7',
          200: '#bcc8ee',
          300: '#92a2dd',
          400: '#6a7cc6',
          500: '#4658a8',
          600: '#34438c',
          700: '#293670',
          800: '#1f2a58',
          900: '#1a2348',
        },
        // Verde de cumplimiento — sobrio, para convivir con el azul del kit
        green: {
          50:  '#eff7f1',
          100: '#d9ede0',
          200: '#b4dbc3',
          300: '#82c29c',
          400: '#4fa574',
          500: '#2a8655',
          600: '#1f6d45',
          700: '#1a5738',
          800: '#15442c',
          900: '#103322',
        },
        // Advertencias — derivadas del dorado del kit
        amber: {
          50:  '#fdf8ec',
          100: '#faefd3',
          200: '#f0e2be',
          300: '#e5c888',
          400: '#d9ab47',
          500: '#c89116',
          600: '#a87813',
          700: '#7f5a10',
          800: '#63470d',
          900: '#4a350a',
        },
        yellow: {
          50:  '#fdf8ec',
          100: '#faefd3',
          200: '#f0e2be',
          300: '#e5c888',
          400: '#d9ab47',
          500: '#c89116',
          600: '#a87813',
          700: '#7f5a10',
          800: '#63470d',
          900: '#4a350a',
        },
        // Naranja — terracota que puentea el rojo y el dorado del kit
        orange: {
          50:  '#fdf4ec',
          100: '#fae6d2',
          200: '#f2c9a2',
          300: '#e6a76e',
          400: '#d98442',
          500: '#c2661c',
          600: '#a45217',
          700: '#7e3f12',
          800: '#62310e',
          900: '#48240a',
        },
      },
    },
  },
  plugins: [],
}
