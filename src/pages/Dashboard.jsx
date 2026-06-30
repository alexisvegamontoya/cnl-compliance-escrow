import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ── Configuración de categorías ───────────────────────────────────────────────
const TIPOS = {
  normativa:     { label: 'Normativa',     color: '#4338ca', bg: '#eef2ff', icon: '📋' },
  noticia:       { label: 'Noticia CR',    color: '#0369a1', bg: '#e0f2fe', icon: '📰' },
  internacional: { label: 'Internacional', color: '#065f46', bg: '#ecfdf5', icon: '🌎' },
  judicial:      { label: 'Judicial',      color: '#92400e', bg: '#fef3c7', icon: '⚖️' },
  informativo:   { label: 'Informativo',   color: '#374151', bg: '#f3f4f6', icon: '🔵' },
}

const URGENCIAS = {
  urgente:     { label: '🔴 URGENTE',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  importante:  { label: '🟡 IMPORTANTE', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  informativo: { label: '🔵 INFO',       color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
}

const FILTROS = [
  { id: 'todos',         label: 'Todos' },
  { id: 'normativa',     label: '📋 Normativa' },
  { id: 'noticia',       label: '📰 Noticias CR' },
  { id: 'internacional', label: '🌎 Internacional' },
  { id: 'judicial',      label: '⚖️ Judicial' },
]

// ── Utilidades ────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60000)
  const hrs  = Math.floor(min / 60)
  const days = Math.floor(hrs / 24)
  if (days > 1) return `hace ${days} días`
  if (days === 1) return 'ayer'
  if (hrs  > 0) return `hace ${hrs}h`
  if (min  > 0) return `hace ${min}m`
  return 'ahora'
}

function fmtFecha(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CR', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  } catch { return dateStr }
}

// ── Componente: tarjeta de artículo ──────────────────────────────────────────
function FeedCard({ item }) {
  const tipo = TIPOS[item.fuente_tipo] || TIPOS.informativo
  const urg  = URGENCIAS[item.urgencia] || URGENCIAS.informativo

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2.5 hover:shadow-md transition-all"
      style={{
        borderColor: item.urgencia === 'urgente' ? urg.border : '#e5e7eb',
        background:  item.urgencia === 'urgente' ? '#fff8f8' : '#ffffff',
      }}
    >
      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ color: urg.color, background: urg.bg }}>
          {urg.label}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ color: tipo.color, background: tipo.bg }}>
          {tipo.icon} {tipo.label}
        </span>
        {item.fuente && (
          <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]" title={item.fuente}>
            {item.fuente}
          </span>
        )}
      </div>

      {/* Título */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold text-gray-900 hover:text-brand-700 leading-snug line-clamp-2 transition-colors"
      >
        {item.titulo}
      </a>

      {/* Resumen */}
      {item.resumen && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{item.resumen}</p>
      )}

      {/* Pie */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-auto pt-1">
        {item.fecha_publicacion && (
          <span>{fmtFecha(item.fecha_publicacion)}</span>
        )}
        <span className="ml-auto">{timeAgo(item.fecha_ingreso)}</span>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Dashboard() {
  const { tenant, profile } = useAuth()

  const [feedItems,    setFeedItems]    = useState([])
  const [resumenIA,    setResumenIA]    = useState('')
  const [ultimaSync,   setUltimaSync]   = useState(null)
  const [loadingFeed,  setLoadingFeed]  = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [filtro,       setFiltro]       = useState('todos')
  const [busqueda,     setBusqueda]     = useState('')
  const [syncError,    setSyncError]    = useState('')
  const [alertasClientes, setAlertasClientes] = useState([])

  useEffect(() => {
    cargarFeed()
    cargarAlertasClientes()
  }, [])

  // ── Cargar alertas de clientes mencionados en noticias ────────────────────
  async function cargarAlertasClientes() {
    const { data } = await supabase
      .from('alertas_noticias')
      .select('*')
      .eq('visto', false)
      .order('creado_en', { ascending: false })
      .limit(20)
    if (data) setAlertasClientes(data)
  }

  async function marcarAlertaVista(id) {
    await supabase.from('alertas_noticias').update({ visto: true, visto_en: new Date().toISOString() }).eq('id', id)
    setAlertasClientes(prev => prev.filter(a => a.id !== id))
  }

  async function marcarTodasVistas() {
    await Promise.all(alertasClientes.map(a =>
      supabase.from('alertas_noticias').update({ visto: true, visto_en: new Date().toISOString() }).eq('id', a.id)
    ))
    setAlertasClientes([])
  }

  // ── Cargar feed desde Supabase ─────────────────────────────────────────────
  async function cargarFeed() {
    setLoadingFeed(true)
    const { data, error } = await supabase
      .from('feed_items')
      .select('*')
      .eq('activo', true)
      .order('fecha_ingreso', { ascending: false })
      .limit(150)

    if (data && !error) {
      const resumen = data.find(i => i.fuente_tipo === 'resumen')
      const items   = data.filter(i => i.fuente_tipo !== 'resumen')
      setResumenIA(resumen?.resumen || '')
      setFeedItems(items)
      if (data.length > 0) setUltimaSync(data[0].fecha_ingreso)
    }
    setLoadingFeed(false)
  }

  // ── Sincronizar manualmente ────────────────────────────────────────────────
  async function sincronizar() {
    setSincronizando(true)
    setSyncError('')
    try {
      const res  = await fetch('/api/feed-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncError(data.error || 'Error desconocido al sincronizar.')
      } else {
        await cargarFeed()
      }
    } catch (e) {
      setSyncError('Error de conexión: ' + e.message)
    } finally {
      setSincronizando(false)
    }
  }

  // ── Alertas urgentes (últimas 24h) ─────────────────────────────────────────
  const urgentes = useMemo(() =>
    feedItems.filter(i =>
      i.urgencia === 'urgente' &&
      Date.now() - new Date(i.fecha_ingreso).getTime() < 86_400_000
    ),
    [feedItems]
  )

  // ── Feed filtrado + buscado ────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    let items = feedItems
    if (filtro !== 'todos') items = items.filter(i => i.fuente_tipo === filtro)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      items = items.filter(i =>
        i.titulo?.toLowerCase().includes(q) ||
        i.resumen?.toLowerCase().includes(q) ||
        i.fuente?.toLowerCase().includes(q)
      )
    }
    return items
  }, [feedItems, filtro, busqueda])

  // ── Contadores por tipo (para los tabs) ───────────────────────────────────
  const contadores = useMemo(() => {
    const c = { todos: feedItems.length }
    feedItems.forEach(i => {
      c[i.fuente_tipo] = (c[i.fuente_tipo] || 0) + 1
    })
    return c
  }, [feedItems])

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-7xl">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            🌐 Dashboard de Inteligencia Regulatoria
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {ultimaSync
              ? `Última sincronización: ${timeAgo(ultimaSync)} · ${new Date(ultimaSync).toLocaleString('es-CR')}`
              : 'Sin sincronizar — presione Actualizar para cargar noticias regulatorias'}
          </p>
        </div>
        <button
          onClick={sincronizar}
          disabled={sincronizando}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          {sincronizando
            ? <><span className="inline-block animate-spin">⟳</span> Sincronizando…</>
            : '🔄 Actualizar feed'}
        </button>
      </div>

      {/* ── ERROR ─────────────────────────────────────────────────────────── */}
      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
          <span>⚠️</span>
          <span>{syncError}</span>
          <button onClick={() => setSyncError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── ALERTAS CLIENTES EN NOTICIAS ─────────────────────────────────── */}
      {alertasClientes.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-bold text-amber-900 text-sm">
                  Clientes mencionados en noticias ALA/CFT ({alertasClientes.length})
                </p>
                <p className="text-xs text-amber-700">
                  Se detectó posible mención de clientes registrados en noticias de lavado de dinero o delitos financieros. Revise y tome acción.
                </p>
              </div>
            </div>
            <button onClick={marcarTodasVistas}
              className="text-xs text-amber-700 border border-amber-400 px-3 py-1 rounded-lg hover:bg-amber-100 whitespace-nowrap">
              Marcar todas como vistas
            </button>
          </div>
          <div className="space-y-2">
            {alertasClientes.map(alerta => (
              <div key={alerta.id}
                className={`bg-white border rounded-xl px-4 py-3 flex items-start justify-between gap-3 ${
                  alerta.urgencia_noticia === 'urgente' ? 'border-red-300' : 'border-amber-200'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      alerta.urgencia_noticia === 'urgente'    ? 'bg-red-100 text-red-700' :
                      alerta.urgencia_noticia === 'importante' ? 'bg-orange-100 text-orange-700' :
                                                                  'bg-blue-100 text-blue-700'
                    }`}>
                      {alerta.urgencia_noticia === 'urgente' ? '🔴 URGENTE' : alerta.urgencia_noticia === 'importante' ? '🟡 IMPORTANTE' : '🔵 INFO'}
                    </span>
                    <span className="text-xs font-semibold text-amber-800">
                      Cliente: <span className="text-gray-900">{alerta.nombre_cliente}</span>
                    </span>
                    <span className="text-xs text-gray-400">
                      mencionado como "{alerta.nombre_mencionado}" · similitud {Math.round(alerta.similitud * 100)}%
                    </span>
                  </div>
                  <a href={alerta.url_noticia} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-800 hover:text-amber-700 line-clamp-1 transition-colors">
                    {alerta.titulo_noticia}
                  </a>
                  {alerta.resumen_noticia && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alerta.resumen_noticia}</p>
                  )}
                </div>
                <button onClick={() => marcarAlertaVista(alerta.id)}
                  className="text-gray-400 hover:text-gray-600 text-lg flex-shrink-0 leading-none" title="Marcar como vista">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── URGENTES ──────────────────────────────────────────────────────── */}
      {urgentes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2.5">
            🔴 Alertas urgentes — últimas 24 horas
          </p>
          <div className="flex flex-wrap gap-2">
            {urgentes.map(u => (
              <a
                key={u.id}
                href={u.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-white border border-red-200 text-red-800 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors font-medium max-w-sm truncate"
                title={u.titulo}
              >
                {u.titulo.length > 80 ? u.titulo.slice(0, 80) + '…' : u.titulo}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── RESUMEN IA ────────────────────────────────────────────────────── */}
      {resumenIA && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">
            🤖 Resumen ejecutivo IA del día
          </p>
          <p className="text-sm text-brand-900 leading-relaxed">{resumenIA}</p>
        </div>
      )}


      {/* ── FEED ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Barra de filtros */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="search"
                placeholder="Buscar en el feed…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {filtrados.length} artículo{filtrados.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {FILTROS.map(f => {
              const count = contadores[f.id] || 0
              const active = filtro === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setFiltro(f.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1 ${
                    active
                      ? 'bg-brand-700 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                  {f.id !== 'todos' && count > 0 && (
                    <span className={`text-xs px-1.5 py-0 rounded-full ${
                      active ? 'bg-brand-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Contenido del feed */}
        <div className="p-4">
          {loadingFeed ? (
            <div className="text-center py-14 text-gray-400">
              <div className="text-3xl mb-2 animate-spin inline-block">⟳</div>
              <p className="text-sm mt-2">Cargando feed regulatorio…</p>
            </div>

          ) : feedItems.length === 0 ? (
            /* Estado vacío (sin sincronizar) */
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🌐</div>
              <p className="text-base font-semibold text-gray-700">El feed está vacío</p>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                Presione <strong>Actualizar feed</strong> para sincronizar las últimas noticias
                regulatorias ALA/CFT de Costa Rica e internacionales.
              </p>
              <button
                onClick={sincronizar}
                disabled={sincronizando}
                className="mt-4 bg-brand-700 hover:bg-brand-800 disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {sincronizando ? '⟳ Sincronizando…' : '🔄 Sincronizar ahora'}
              </button>
              <p className="text-xs text-gray-400 mt-3">
                El feed se actualiza automáticamente cada día a las 6:00 AM (hora CR).
              </p>
            </div>

          ) : filtrados.length === 0 ? (
            /* Sin resultados para filtro/búsqueda */
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm">Sin resultados para {busqueda ? `"${busqueda}"` : `"${filtro}"`}</p>
              <button
                onClick={() => { setFiltro('todos'); setBusqueda('') }}
                className="mt-2 text-xs text-brand-600 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>

          ) : (
            /* Grid de artículos */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtrados.map(item => (
                <FeedCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Footer informativo */}
        {!loadingFeed && feedItems.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
            <span>
              Fuentes: SUGEF · ICD/UIF · CONASSIF · GAFI/FATF · GAFILAT · INTERPOL · Medios CR · Poder Judicial
            </span>
            <span>
              Actualización automática: 6:00 AM (CR)
            </span>
          </div>
        )}
      </div>

    </div>
  )
}
