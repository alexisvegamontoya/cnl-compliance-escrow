import { useState, useEffect, useCallback } from 'react'
import { supabase, traerTodo } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function toISO(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`
}

function labelMes(year, month) {
  return `${MESES[month]} ${year}`
}

// ──────────────────────────────────────────────────────────────
// Modal para declarar mes sin movimiento
// ──────────────────────────────────────────────────────────────
function ModalDeclarar({ periodo, tenantId, onClose, onGuardado }) {
  const { profile } = useAuth()
  const [notas, setNotas]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const fecha = new Date(periodo + 'T12:00:00')
  const label = `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`

  async function guardar() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('periodos_declarados')
      .upsert({
        tenant_id:     tenantId,
        periodo:       periodo,
        tipo:          'sin_movimiento',
        declarado_por: profile?.id || null,
        notas:         notas.trim() || null,
      }, { onConflict: 'tenant_id,periodo' })

    if (err) {
      setError('No se pudo guardar la declaración: ' + err.message)
      setSaving(false)
      return
    }
    onGuardado()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-lg">Declarar mes sin movimiento</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            Está declarando que en <strong>{label}</strong> no hubo transacciones
            reportables ante SUGEF/SICVECA.
          </p>
        </div>

        <div>
          <label className="label">Notas u observaciones (opcional)</label>
          <textarea
            className="input-field resize-none"
            rows={3}
            placeholder="Ej: Empresa en período de inactividad, sin operaciones durante el mes…"
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Guardando…' : '✓ Confirmar declaración'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Modal detalle de mes reportado
// ──────────────────────────────────────────────────────────────
function ModalDetalle({ mes, onClose, onRevocar }) {
  const [saving, setSaving] = useState(false)
  const fecha = new Date(mes.periodo + 'T12:00:00')
  const label = `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`

  async function revocar() {
    if (!confirm(`¿Eliminar la declaración de ${label}? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    await supabase
      .from('periodos_declarados')
      .delete()
      .eq('id', mes.declaracion.id)
    onRevocar()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-lg">{label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          {mes.tipo === 'sin_movimiento' ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium text-gray-700">📋 Sin movimiento declarado</p>
              {mes.declaracion?.notas && (
                <p className="text-sm text-gray-500 italic">"{mes.declaracion.notas}"</p>
              )}
              <p className="text-xs text-gray-400">
                Registrado el {new Date(mes.declaracion.created_at).toLocaleDateString('es-CR')}
              </p>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium text-green-700">
                ✅ {mes.totalTxns} transacción{mes.totalTxns !== 1 ? 'es' : ''} registrada{mes.totalTxns !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-green-600">
                Monto total: {mes.totalMonto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-1">
          {mes.tipo === 'sin_movimiento' && (
            <button
              onClick={revocar}
              disabled={saving}
              className="text-xs text-red-500 hover:underline"
            >
              {saving ? '…' : 'Eliminar declaración'}
            </button>
          )}
          <button onClick={onClose} className="btn-secondary text-sm ml-auto">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────
export default function CalendarioReportes({ tenantId, refreshTrigger }) {
  const [meses, setMeses]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalDeclarar, setModalDeclarar] = useState(null)   // periodo ISO
  const [modalDetalle, setModalDetalle]   = useState(null)   // objeto mes
  const [refresh, setRefresh]         = useState(0)

  const cargar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)

    // Calcular los últimos 13 meses (mes actual + 12 atrás)
    const hoy = new Date()
    const periodos = []
    for (let i = 12; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      periodos.push(toISO(d.getFullYear(), d.getMonth()))
    }

    const desde = periodos[0]
    const hasta = periodos[periodos.length - 1]

    // Cargar transacciones y declaraciones en paralelo.
    // Las transacciones van paginadas: sin esto PostgREST corta en 1000 filas
    // y los meses que caen fuera de ese corte aparecen como pendientes.
    const [{ data: txns }, { data: decls }] = await Promise.all([
      traerTodo(() => supabase
        .from('transacciones')
        .select('periodo, monto_movimiento')
        .eq('tenant_id', tenantId)
        .gte('periodo', desde)
        .lte('periodo', hasta)
        .order('id')),
      supabase
        .from('periodos_declarados')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('periodo', desde)
        .lte('periodo', hasta),
    ])

    // Agrupar transacciones por período
    const txnMap = {}
    for (const t of (txns || [])) {
      const key = t.periodo?.substring(0, 7)
      if (!key) continue
      if (!txnMap[key]) txnMap[key] = { count: 0, monto: 0 }
      txnMap[key].count++
      txnMap[key].monto += Number(t.monto_movimiento || 0)
    }

    // Declaraciones por período
    const declMap = {}
    for (const d of (decls || [])) {
      const key = d.periodo?.substring(0, 7)
      if (key) declMap[key] = d
    }

    const hoyKey  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

    const resultado = periodos.map(p => {
      const key    = p.substring(0, 7)
      const txn    = txnMap[key]
      const decl   = declMap[key]
      const esFuturo = key > hoyKey

      let estado, tipo
      if (esFuturo) {
        estado = 'futuro'
      } else if (txn && txn.count > 0) {
        estado = 'reportado'
        tipo   = 'con_movimiento'
      } else if (decl) {
        // Cualquier declaración cuenta como período atendido, no solo las de
        // "sin movimiento": las de "con movimiento" también se registran.
        estado = 'reportado'
        tipo   = decl.tipo || 'sin_movimiento'
      } else {
        estado = 'pendiente'
      }

      const fecha = new Date(p + 'T12:00:00')
      return {
        periodo:      p,
        key,
        label:        labelMes(fecha.getFullYear(), fecha.getMonth()),
        esActual:     key === hoyKey,
        esFuturo,
        estado,
        tipo,
        totalTxns:    txn?.count  || 0,
        totalMonto:   txn?.monto  || 0,
        declaracion:  decl || null,
      }
    })

    setMeses(resultado)
    setLoading(false)
  }, [tenantId, refresh, refreshTrigger])

  useEffect(() => { cargar() }, [cargar])

  const pendientes = meses.filter(m => m.estado === 'pendiente').length
  const reportados = meses.filter(m => m.estado === 'reportado').length

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Control de períodos reportados</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimos 13 meses</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
            <span className="text-gray-600">{reportados} reportado{reportados !== 1 ? 's' : ''}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
            <span className="text-gray-600">{pendientes} pendiente{pendientes !== 1 ? 's' : ''}</span>
          </span>
        </div>
      </div>

      {/* Grilla de meses */}
      {loading ? (
        <div className="py-6 text-center text-gray-400 text-sm">Cargando…</div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {meses.map(m => {
            const base = 'rounded-xl p-2.5 flex flex-col items-center gap-1 text-center transition-all '

            if (m.esFuturo) {
              return (
                <div key={m.key} className={base + 'bg-gray-50 border border-dashed border-gray-200 opacity-40 cursor-default'}>
                  <span className="text-xs font-medium text-gray-400">{m.label}</span>
                </div>
              )
            }

            if (m.estado === 'reportado') {
              const isSinMov = m.tipo === 'sin_movimiento'
              return (
                <button
                  key={m.key}
                  onClick={() => setModalDetalle(m)}
                  className={base + `bg-green-50 border border-green-200 hover:border-green-400 hover:shadow-sm cursor-pointer ${
                    m.esActual ? 'ring-2 ring-green-400' : ''
                  }`}
                  title={isSinMov ? 'Sin movimiento declarado' : `${m.totalTxns} transacciones`}
                >
                  <span className="text-xs font-semibold text-green-700">{m.label}</span>
                  {isSinMov ? (
                    <span className="text-xs text-green-600">Sin mov.</span>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-green-700">{m.totalTxns} txn{m.totalTxns !== 1 ? 's' : ''}</span>
                      <span className="text-[10px] text-green-500 leading-tight">
                        {m.totalMonto.toLocaleString('es-CR', { maximumFractionDigits: 0 })}
                      </span>
                    </>
                  )}
                  <span className="text-green-500 text-sm">✓</span>
                </button>
              )
            }

            // Pendiente
            return (
              <button
                key={m.key}
                onClick={() => setModalDeclarar(m.periodo)}
                className={base + `bg-amber-50 border border-amber-200 hover:border-amber-400 hover:shadow-sm cursor-pointer ${
                  m.esActual ? 'ring-2 ring-amber-400' : ''
                }`}
                title="Pendiente — click para declarar sin movimiento"
              >
                <span className="text-xs font-semibold text-amber-700">{m.label}</span>
                <span className="text-xs text-amber-600">Pendiente</span>
                <span className="text-amber-400 text-sm">○</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Leyenda */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
        <span>🟢 Reportado con cifras</span>
        <span>🟢 Sin movimiento declarado</span>
        <span>🟠 Pendiente — click para declarar</span>
      </div>

      {/* Modales */}
      {modalDeclarar && (
        <ModalDeclarar
          periodo={modalDeclarar}
          tenantId={tenantId}
          onClose={() => setModalDeclarar(null)}
          onGuardado={() => setRefresh(r => r + 1)}
        />
      )}
      {modalDetalle && (
        <ModalDetalle
          mes={modalDetalle}
          onClose={() => setModalDetalle(null)}
          onRevocar={() => setRefresh(r => r + 1)}
        />
      )}
    </div>
  )
}
