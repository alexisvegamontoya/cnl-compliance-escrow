import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Configuración de ESLint.
 *
 * El objetivo es atrapar los errores que ya costaron caro en este proyecto:
 * variables inexistentes, promesas sin await, hooks mal declarados y llamadas
 * cuyo resultado se descarta. Las reglas de estilo quedan fuera a propósito
 * para no generar ruido sobre 24 000 líneas ya escritas.
 *
 *   npm run lint          → revisa todo
 *   npm run lint -- --fix → corrige lo que se puede automáticamente
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/data/**', 'supabase/functions/**'],
  },

  js.configs.recommended,

  // ── Código del navegador (src/) ──────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Reglas del React Compiler: marcan patrones mejorables, no errores.
      // El patrón useEffect(() => { cargar() }) aparece en ~35 pantallas y
      // funciona; cambiarlo es un refactor de arquitectura, no una corrección.
      // Se dejan como aviso para que `npm run lint` en rojo signifique algo.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // JSX no necesita React en el scope con el transform moderno de Vite
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Los textos en español llevan comillas y apóstrofes; escaparlos no aporta
      'react/no-unescaped-entities': 'off',

      // Errores reales, no estilo
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-alert': 'warn',
      'require-atomic-updates': 'error',
      eqeqeq: ['warn', 'smart'],
    },
  },

  // ── Funciones serverless (api/) — corren en Node ─────────────────────────
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // ── Scripts de mantenimiento ─────────────────────────────────────────────
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'warn',
    },
  },

  // ── Pruebas de carga con k6 — corren en su propio runtime ────────────────
  {
    files: ['scripts/load-tests/**/*.js'],
    languageOptions: {
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
    },
  },
]
