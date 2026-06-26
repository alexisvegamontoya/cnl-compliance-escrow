import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificaciones } from '../../hooks/useNotificaciones'

const TIPO_STYLE = {
  info:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'ℹ️' },
  alerta: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '⚠️' },
  exito:  { bg: 'bg-green-50',  border: 'border-green-200',  icon: '✅' },
  error:  { bg: 'bg-red-50',    border: 'border-red-200',    icon: '🚨' },
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60)   return 'Hace un momento'
  if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff/3600)}h`
  return new Date(dateStr).toLocaleDateString('es-CR')
}

export default function BellNotificaciones() {
  const { notifs, noLeidas, loading, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const navigate = useNavigate()

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleNotifClick(n) {
    marcarLeida(n.id)
    if (n.url_accion) navigate(n.url_accion)
    setOpen(false)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Botón campana */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-brand-300 hover:text-white hover:bg-brand-800 transition-colors"
        title="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div className="absolute left-full ml-2 top-0 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <p className="font-semibold text-gray-800 text-sm">Notificaciones</p>
              {noLeidas > 0 && (
                <p className="text-xs text-gray-500">{noLeidas} sin leer</p>
              )}
            </div>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors">
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {loading && (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">Cargando…</div>
            )}
            {!loading && notifs.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">🔔</p>
                <p className="text-gray-400 text-sm">No hay notificaciones</p>
              </div>
            )}
            {notifs.map(n => {
              const style = TIPO_STYLE[n.tipo] || TIPO_STYLE.info
              return (
                <button key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.leida ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="flex gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium leading-tight ${!n.leida ? 'text-gray-900' : 'text-gray-600'}`}>
                          {n.titulo}
                        </p>
                        {!n.leida && (
                          <span className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      {n.mensaje && (
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.mensaje}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
