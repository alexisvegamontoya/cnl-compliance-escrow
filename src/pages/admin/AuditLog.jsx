import { useState, useEffect, useCallback } from 'react'
import { supabase, tenantsDeLaApp } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const ACCION_STYLE = {
  crear:    { color: 'bg-green-100 text-green-700',  icon: '➕' },
  editar:   { color: 'bg-blue-100 text-blue-700',    icon: '✏️' },
  eliminar: { color: 'bg-red-100 text-red-700',      icon: '🗑️' },
  exportar: { color: 'bg-brand-100 text-brand-800',icon: '📥' },
  enviar:   { color: 'bg-orange-100 text-orange-700',icon: '📤' },
  login:    { color: 'bg-gray-100 text-gray-600',    icon: '🔐' },
}

export default function AuditLog() {
  const { isSuperAdmin } = useAuth()
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [filtroTabla, setFiltroTabla] = useState('')
  const [filtroUser, setFiltroUser]   = useState('')
  const [tenantSel, setTenantSel]     = useState('')
  const [tenants, setTenants]         = useState([])
  const [page, setPage]               = useState(0)
  const PAGE_SIZE = 50

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroTabla) q = q.eq('tabla', filtroTabla)
    if (filtroUser)  q = q.ilike('user_email', `%${filtroUser}%`)
    if (tenantSel)   q = q.eq('tenant_id', tenantSel)

    const { data } = await q
    setLogs(data || [])
    setLoading(false)
  }, [filtroTabla, filtroUser, tenantSel, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  const tablas = ['clientes', 'transacciones', 'reportes_ros', 'cuestionarios', 'respuestas_cuestionario', 'denuncias']

  function timeFormat(dt) {
    return new Date(dt).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6 max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historial de Auditoría</h1>
        <p className="text-gray-500 text-sm mt-1">Registro de todas las acciones realizadas en la plataforma.</p>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap gap-3 items-end">
        {isSuperAdmin && (
          <div className="flex-1 min-w-[180px]">
            <label className="label">Sujeto Obligado</label>
            <select className="input" value={tenantSel} onChange={e => { setTenantSel(e.target.value); setPage(0) }}>
              <option value="">Todos</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[160px]">
          <label className="label">Módulo</label>
          <select className="input" value={filtroTabla} onChange={e => { setFiltroTabla(e.target.value); setPage(0) }}>
            <option value="">Todos</option>
            {tablas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label">Usuario</label>
          <input type="text" className="input" placeholder="correo@..." value={filtroUser}
            onChange={e => { setFiltroUser(e.target.value); setPage(0) }} />
        </div>
        <button onClick={() => { setFiltroTabla(''); setFiltroUser(''); setTenantSel(''); setPage(0) }}
          className="btn-secondary text-sm">Limpiar</button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando…</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-gray-400">Sin registros con los filtros actuales.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha y Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Módulo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => {
                  const est = ACCION_STYLE[log.accion] || { color: 'bg-gray-100 text-gray-600', icon: '•' }
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{timeFormat(log.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${est.color}`}>
                          {est.icon} {log.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{log.tabla || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px] truncate" title={log.user_email}>{log.user_email || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[280px]">{log.descripcion || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {logs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">Página {page + 1} — {logs.length} registros</p>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="btn-secondary text-xs disabled:opacity-40">← Anterior</button>
              <button disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
                className="btn-secondary text-xs disabled:opacity-40">Siguiente →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
