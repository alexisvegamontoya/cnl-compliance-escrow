import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { TIPO_MONEDA, TIPO_MOVIMIENTO } from '../../lib/catalogos'

const MONEDA_LABEL = { 1: 'CRC', 2: 'USD', 3: 'EUR', 4: 'Otra' }
const MOV_LABEL    = { 1: '⬆ Ingreso', 2: '⬇ Salida', 3: '↕ Ambos' }
const MOV_COLOR    = { 1: 'badge-success', 2: 'badge-warning', 3: 'text-blue-700 bg-blue-100' }

// Modos de filtro
const MODO_MES   = 'mes'
const MODO_RANGO = 'rango'
const MODO_TODOS = 'todos'

export default function TransactionList({ refreshTrigger, onEdit, tenants = [] }) {
  const { tenant, isSuperAdmin } = useAuth()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [modo, setModo]           = useState(MODO_MES)
  const [periodo, setPeriodo]     = useState(new Date().toISOString().substring(0, 7))
  const [rangoDesde, setRangoDesde] = useState('')
  const [rangoHasta, setRangoHasta] = useState('')
  const [tenantVista, setTenantVista] = useState('')
  const [deleting, setDeleting]   = useState(null)
  const [periodosDisponibles, setPeriodosDisponibles] = useState([])

  const tenantId = isSuperAdmin ? tenantVista : tenant?.id

  // Cargar períodos disponibles para ayudar al usuario
  const loadPeriodos = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase
      .from('transacciones')
      .select('periodo')
      .eq('tenant_id', tenantId)
      .order('periodo', { ascending: false })
    if (data) {
      const unicos = [...new Set(data.map(r => r.periodo ? String(r.periodo).substring(0, 7) : null).filter(Boolean))]
      setPeriodosDisponibles(unicos)
    }
  }, [tenantId])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    let query = supabase
      .from('transacciones')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('fecha_transaccion', { ascending: false })
      .order('periodo', { ascending: false })

    if (modo === MODO_MES) {
      // periodo se guarda como 'YYYY-MM-01' en la BD
      const desde = periodo + '-01'
      const hasta = periodo + '-31'
      query = query.gte('periodo', desde).lte('periodo', hasta)
    } else if (modo === MODO_RANGO && rangoDesde && rangoHasta) {
      query = query.gte('fecha_transaccion', rangoDesde).lte('fecha_transaccion', rangoHasta)
    }
    // MODO_TODOS: sin filtro adicional

    const { data, error } = await query.limit(500)
    if (!error) setRows(data || [])
    setLoading(false)
  }, [tenantId, modo, periodo, rangoDesde, rangoHasta])

  useEffect(() => { load(); loadPeriodos() }, [load, loadPeriodos, refreshTrigger])
  useEffect(() => { loadPeriodos() }, [loadPeriodos, tenantId])

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta transacción?')) return
    setDeleting(id)
    await supabase.from('transacciones').delete().eq('id', id)
    setDeleting(null)
    load()
    loadPeriodos()
  }

  const totalMonto = rows.reduce((s, r) => s + Number(r.monto_movimiento), 0)

  const modoBtn = (m, label, icon) => (
    <button
      onClick={() => setModo(m)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        modo === m
          ? 'bg-brand-600 text-white border-brand-600'
          : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
      }`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className="card">
      {isSuperAdmin && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <span className="text-amber-700 text-sm font-medium flex-shrink-0">🏢 Sujeto obligado:</span>
          <select className="input-field text-sm"
            value={tenantVista}
            onChange={e => setTenantVista(e.target.value)}>
            <option value="">— Seleccione para ver transacciones —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Transacciones registradas</h3>
          <p className="text-sm text-gray-500">{rows.length} registro{rows.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de modo */}
          {modoBtn(MODO_MES,   'Por mes',      '📅')}
          {modoBtn(MODO_RANGO, 'Rango fechas', '📆')}
          {modoBtn(MODO_TODOS, 'Todos',        '🗂️')}

          {/* Controles según modo */}
          {modo === MODO_MES && (
            <input type="month" className="input-field w-40 text-sm"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)} />
          )}

          {modo === MODO_RANGO && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="input-field text-sm w-36"
                value={rangoDesde}
                onChange={e => setRangoDesde(e.target.value)} />
              <span className="text-gray-400 text-sm">→</span>
              <input type="date" className="input-field text-sm w-36"
                value={rangoHasta}
                onChange={e => setRangoHasta(e.target.value)} />
            </div>
          )}

          <button onClick={load} className="btn-secondary text-sm py-1.5 px-3">
            ↺ Actualizar
          </button>
        </div>
      </div>

      {/* Aviso de períodos disponibles cuando no hay resultados */}
      {!loading && rows.length === 0 && periodosDisponibles.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 font-medium mb-1">
            ℹ️ No hay transacciones en este filtro. Períodos con datos disponibles:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {periodosDisponibles.map(p => (
              <button
                key={p}
                onClick={() => { setModo(MODO_MES); setPeriodo(p) }}
                className="text-xs px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full font-mono transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && periodosDisponibles.length === 0 && tenantId && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          ℹ️ No se encontraron transacciones para este sujeto obligado. Use "Todos" para confirmar.
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-400">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-sm">No hay transacciones para el filtro seleccionado.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">#</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Cliente</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Identificación</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Movimiento</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Monto</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Fecha</th>
                  {verTodos && <th className="text-left py-3 px-2 text-gray-500 font-medium">Período</th>}
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Estado</th>
                  <th className="py-3 px-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => {
                  const nombre = row.nombre_empresa || `${row.nombre_cliente || ''} ${row.primer_apellido || ''}`.trim()
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="py-3 px-2 text-gray-400">{idx + 1}</td>
                      <