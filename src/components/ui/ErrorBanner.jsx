/**
 * ErrorBanner.jsx
 * Muestra errores operativos o técnicos con el formato correcto.
 *
 * Uso:
 *   import ErrorBanner from '../components/ui/ErrorBanner'
 *   <ErrorBanner error={error} onClose={() => setError(null)} />
 *
 * `error` puede ser:
 *   - null / undefined → no muestra nada
 *   - string → se clasifica automáticamente
 *   - objeto Supabase { message, code, details } → se clasifica automáticamente
 *   - { tipo: 'operativo'|'tecnico', mensaje: string } → ya clasificado
 */

import { clasificarError } from '../../lib/errorHandler'

export default function ErrorBanner({ error, onClose }) {
  if (!error) return null

  // Aceptar error ya clasificado o clasificarlo aquí
  let tipo, mensaje
  if (typeof error === 'object' && error.tipo) {
    tipo    = error.tipo
    mensaje = error.mensaje
  } else if (typeof error === 'string') {
    const r = clasificarError({ message: error })
    tipo    = r.tipo
    mensaje = r.mensaje
  } else {
    const r = clasificarError(error)
    tipo    = r.tipo
    mensaje = r.mensaje
  }

  const esOperativo = tipo === 'operativo'

  return (
    <div
      role="alert"
      className={`rounded-xl border px-4 py-3 flex items-start gap-3 text-sm ${
        esOperativo
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-red-50 border-red-200 text-red-800'
      }`}
    >
      <span className="text-lg leading-none mt-0.5">
        {esOperativo ? '⚠️' : '🔴'}
      </span>

      <div className="flex-1 space-y-0.5">
        <p className="font-semibold">
          {esOperativo ? 'Error operativo' : 'Error del sistema'}
        </p>
        <p className="text-xs leading-relaxed">
          {esOperativo
            ? mensaje
            : 'Se produjo un error técnico inesperado. Por favor contacte al Administrador del Sistema en CNL Craniley Compliance — soporte@cnl-cr.com'}
        </p>
        {/* En desarrollo, mostrar detalle técnico */}
        {!esOperativo && import.meta.env.DEV && mensaje && (
          <p className="text-xs font-mono text-red-500 mt-1 break-all">
            Detalle: {mensaje}
          </p>
        )}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className={`text-lg leading-none hover:opacity-70 transition-opacity ${
            esOperativo ? 'text-amber-400' : 'text-red-400'
          }`}
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}
    </div>
  )
}
