import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { TIPO_MONEDA, TIPO_MOVIMIENTO } from '../../lib/catalogos'
import { format } from 'date-fns'

const MONEDA_LABEL = { 1: 'CRC', 2: 'USD', 3: 'EUR', 4: 'Otra' }
const MOV_LABEL    = { 1: '⬆ Ingreso', 2: '⬇ Salida', 3: '↕ Ambos' }
const MOV_COLOR    = { 1: 'badge-success', 2: 'badge-warning', 3: 'text-blue-700 bg-blue-100' }

export default function TransactionList({ refreshTrigger, onEdit, tenants = [] }) {
  const { tenant, isSuperAdmin } = useAuth()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [periodo, setPeriodo]     = useState(new Date().toISOString().substring(0, 7))
  const [verTodos, setVerTodos]   = useState(false)
  const [tenantVista, setTenantVista] = useState('')
  const [deleting, setDeleting]   = useState(null)

  const tenantId = isSuperAdmin ? tenantVista : tenant?.id

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    let query = supabase
      .from('transacciones')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('periodo', { ascending: false })
      .order('fecha_transaccion', { ascending: false })

    if (!verTodos) {
      const desde = periodo + '-01'
      const hasta = periodo + '-31'
      query = query.gte('periodo', desde).lte('periodo', hasta)
    }

    const { data, error } = await query
    if (!error) setRows(data || [])
    setLoading(false)
  }, [tenantId, periodo, verTodos])

  useEffect(() => { load() }, [load, refreshTrigger])

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta transacción?')) return
    setDeleting(id)
    await supabase.from('transacciones').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  const totalMonto = rows.reduce((s, r) => s + Number(r.monto_movimiento), 0)

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Transacciones registradas</h3>
          <p className="text-sm text-gray-500">{rows.length} registro{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVerTodos(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              verTodos
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {verTodos ? '✓ Todos los períodos' : 'Todos los períodos'}
          </button>
          {!verTodos && (
            <>
              <label className="text-sm text-gray-600">Período:</label>
              <input type="month" className="input-field w-40"
                value={periodo}
                onChange={e => setPeriodo(e.target.value)} />
            </>
          )}
          <button onClick={load} className="btn-secondary text-sm py-1.5">
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p>No hay transacciones para este período.</p>
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
                      <td className="py-3 px-2 font-medium text-gray-900 max-w-xs truncate">{nombre}</td>
                      <td className="py-3 px-2 text-gray-600 font-mono">{row.numero_identificacion}</td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${MOV_COLOR[row.tipo_movimiento] || ''}`}>
                          {MOV_LABEL[row.tipo_movimiento] || row.tipo_movimiento}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-medium">
                        {Number(row.monto_movimiento).toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        <span className="text-xs text-gray-400 ml-1">{MONEDA_LABEL[row.tipo_moneda_movimiento]}</span>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {row.fecha_transaccion || '—'}
                      </td>
                      {verTodos && (
                        <td className="py-3 px-2 text-gray-400 font-mono text-xs">
                          {row.periodo ? row.periodo.substring(0, 7) : '—'}
                        </td>
                      )}
                      <td className="py-3 px-2">
                        {row.enviado_sugef
                          ? <span className="badge-success">Enviado</span>
                          : <span className="badge-warning">Pendiente</span>}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit?.(row)}
                            className="text-brand-600 hover:text-brand-800 text-xs font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => eliminar(row.id)}
                            disabled={deleting === row.id}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            {deleting === row.id ? '…' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="py-3 px-2 text-right font-semibold text-gray-700">Total período:</td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900 font-mono">
                    {totalMonto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
