/**
 * Calificación regulatoria — calculada en CNL Gestión Regulatoria y sincronizada a diario
 * (api/regulatorio-sync.js → tabla calificacion_regulatoria). Es distinta del «Nivel de
 * Cumplimiento» de esta app: mide expediente SUGEF, normativa interna, calendario regulatorio,
 * capacitación, listas internacionales y casos/oficios, y trae los puntos pendientes concretos.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const NIVEL = {
  alto:      { texto: 'Alto',      color: '#15803d', fondo: '#dcfce7' },
  medio:     { texto: 'Medio',     color: '#b45309', fondo: '#fef3c7' },
  bajo:      { texto: 'Bajo',      color: '#b91c1c', fondo: '#fee2e2' },
  sin_datos: { texto: 'Sin datos', color: '#6b7280', fondo: '#f3f4f6' },
}
const COMPONENTES = {
  documentos: 'Expediente SUGEF', normativa: 'Normativa interna', calendario: 'Calendario regulatorio',
  capacitacion: 'Capacitación', listas: 'Listas internacionales', casos: 'Casos y oficios',
}
const AREA = { expediente: 'Expediente', normativa: 'Normativa', calendario: 'Calendario', supervision: 'SUGEF / UIF', listas: 'Listas' }
const fechaCR = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CR') : '')

export default function CalificacionRegulatoria({ tenantId }) {
  const [dato, setDato] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [verTodos, setVerTodos] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const { isSuperAdmin } = useAuth()

  // Superadmin: trae ya mismo calificaciones y normativa aprobada (además del cron diario)
  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/regulatorio-sync', { method: 'POST', headers: { Authorization: 'Bearer ' + (data.session?.access_token ?? '') } })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo sincronizar')
      alert('Sincronizado: ' + j.calificaciones + ' calificaciones y ' + j.normativa + ' normativas.' + (j.errores?.length ? ' Avisos: ' + j.errores.join('; ') : ''))
      setRecarga((x) => x + 1)
    } catch (e) { alert(e.message) } finally { setSincronizando(false) }
  }
  const botonSync = isSuperAdmin && (
    <button className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50" disabled={sincronizando} onClick={sincronizar}>
      {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
    </button>
  )

  useEffect(() => {
    if (!tenantId) return
    setCargando(true)
    supabase.from('calificacion_regulatoria').select('*').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => setDato(data ?? null))
      .finally(() => setCargando(false))
  }, [tenantId, recarga])

  if (cargando) return null
  if (!dato) {
    return (
      <div className="card text-sm text-gray-500">
        <p className="font-semibold text-gray-700">Calificación regulatoria (Gestión Regulatoria)</p>
        <p className="mt-1">Aún no hay calificación sincronizada para esta empresa.</p>
        <div className="mt-2">{botonSync}</div>
      </div>
    )
  }
  const n = NIVEL[dato.nivel] ?? NIVEL.sin_datos
  const pendientes = Array.isArray(dato.pendientes) ? dato.pendientes : []
  const visibles = verTodos ? pendientes : pendientes.slice(0, 8)
  const altos = pendientes.filter((p) => p.gravedad === 'alta').length

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">Calificación regulatoria (Gestión Regulatoria)</p>
          <p className="text-xs text-gray-400">Calculada por CNL · actualizada el {fechaCR(dato.calculado_en)} {botonSync}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold" style={{ color: n.color }}>{dato.indice != null ? `${Number(dato.indice).toFixed(1)}` : '—'}</span>
          <span className="rounded-full px-3 py-1 text-sm font-semibold" style={{ background: n.fondo, color: n.color }}>Nivel {n.texto}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {Object.entries(COMPONENTES).map(([k, etiqueta]) => {
          const v = dato.componentes?.[k]
          const pct = v == null ? null : Math.round(Number(v))
          return (
            <div key={k} className="rounded-lg bg-gray-50 p-2">
              <div className="flex justify-between text-xs"><span className="text-gray-600">{etiqueta}</span><span className="font-semibold">{pct == null ? 'n/a' : `${pct}%`}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-200">
                {pct != null && <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 85 ? '#16a34a' : pct >= 65 ? '#d97706' : '#dc2626' }} />}
              </div>
            </div>
          )
        })}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Puntos pendientes ({pendientes.length}{altos ? `, ${altos} de prioridad alta` : ''})
        </p>
        {pendientes.length === 0 ? <p className="text-sm text-green-700">Sin pendientes regulatorios.</p> : (
          <ul className="space-y-1 text-sm">
            {visibles.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                  style={p.gravedad === 'alta' ? { background: '#fee2e2', color: '#b91c1c' } : p.gravedad === 'media' ? { background: '#fef3c7', color: '#b45309' } : { background: '#f3f4f6', color: '#4b5563' }}>
                  {p.gravedad}
                </span>
                <span className="text-xs text-gray-400">{AREA[p.area] ?? p.area}</span>
                <span className="text-gray-700">{p.descripcion}</span>
                {p.fecha && <span className="text-xs text-gray-400">· {fechaCR(p.fecha)}</span>}
              </li>
            ))}
          </ul>
        )}
        {pendientes.length > 8 && (
          <button className="mt-2 text-xs font-semibold text-blue-700 hover:underline" onClick={() => setVerTodos(!verTodos)}>
            {verTodos ? 'Ver menos' : `Ver los ${pendientes.length} pendientes`}
          </button>
        )}
      </div>
    </div>
  )
}
