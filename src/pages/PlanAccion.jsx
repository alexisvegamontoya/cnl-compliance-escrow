import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const BLOQUES = [
  { id: 1,  nombre: 'Donantes y origen de fondos' },
  { id: 2,  nombre: 'Organizaciones beneficiarias' },
  { id: 3,  nombre: 'Personal interno y gobernanza' },
  { id: 4,  nombre: 'Proveedores y terceros' },
  { id: 5,  nombre: 'Gestión financiera y controles' },
  { id: 6,  nombre: 'Administración de fondos' },
  { id: 7,  nombre: 'Zona geográfica' },
  { id: 8,  nombre: 'Métodos de pago' },
  { id: 9,  nombre: 'Naturaleza del servicio' },
  { id: 10, nombre: 'Señales de alerta crítica' },
]

const ESTADOS = ['pendiente', 'en_proceso', 'completada', 'vencida']
const PRIORIDADES = ['alta', 'media', 'baja']

const COLOR_ESTADO = {
  pendiente:  { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Pendiente'   },
  en_proceso: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'En proceso'  },
  completada: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Completada'  },
  vencida:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Vencida'     },
}

const COLOR_PRIORIDAD = {
  alta:  { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Alta'  },
  media: { bg: 'bg-yellow-100', text: 'text-yellow-700',label: 'Media' },
  baja:  { bg: 'bg-green-100',  text: 'text-green-700', label: 'Baja'  },
}

function fmtFecha(d) {
  if (!d) return '—'
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

function Badge({ cfg }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

function ModalAccion({ accion, tenantId, usuarios, onClose, onSaved }) {
  const esNueva = !accion?.id
  const [form, setForm] = useState({
    titulo:             accion?.titulo             || '',
    descripcion:        accion?.descripcion        || '',
    bloque_id:          accion?.bloque_id          || '',
    factor_riesgo:      accion?.factor_riesgo      || '',
    prioridad:          accion?.prioridad          || 'media',
    responsable_id:     accion?.responsable_id     || '',
    responsable_nombre: accion?.responsable_nombre || '',
    fecha_limite:       accion?.fecha_limite       || '',
    observaciones:      accion?.observaciones      || '',
    estado:             accion?.estado             || 'pendiente',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function guardar() {
    if (!form.titulo.trim()) { setError('El título es obligatorio.'); return }
    if (!form.fecha_limite)  { setError('La fecha límite es obligatoria.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        tenant_id: tenantId,
        bloque_id: form.bloque_id ? parseInt(form.bloque_id) : null,
        responsable_id: form.responsable_id || null,
      }
      if (esNueva) {
        const { error: e } = await supabase.from('acciones_plan').insert(payload)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('acciones_plan').update(payload).eq('id', accion.id)
        if (e) throw e
      }
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-brand-900 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-base">{esNueva ? '+ Nueva acción' : 'Editar acción'}</h2>
          <button onClick={onClose} className="text-brand-300 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Título *</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Describa la acción correctiva..." />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
              rows={3} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bloque de riesgo</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white"
                value={form.bloque_id} onChange={e => set('bloque_id', e.target.value)}>
                <option value="">— Seleccione —</option>
                {BLOQUES.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prioridad</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white"
                value={form.prioridad} onChange={e => set('prioridad', e.target.value)}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Responsable</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white"
                value={form.responsable_id} onChange={e => set('responsable_id', e.target.value)}>
                <option value="">— Sin asignar —</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre libre</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                value={form.responsable_nombre} onChange={e => set('responsable_nombre', e.target.value)}
                placeholder="Si no tiene cuenta..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha límite *</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                value={form.fecha_limite} onChange={e => set('fecha_limite', e.target.value)} />
            </div>
            {!esNueva && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Estado</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 bg-white"
                  value={form.estado} onChange={e => set('estado', e.target.value)}>
                  {ESTADOS.map(s => <option key={s} value={s}>{COLOR_ESTADO[s]?.label || s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observaciones</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500 resize-none"
              rows={2} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">Cancelar</button>
          <button onClick={guardar} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlanAccion() {
  const { tenant, isAdmin, isSuperAdmin } = useAuth()
  const [acciones, setAcciones]   = useState([])
  const [usuarios, setUsuarios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filtroEstado, setFiltroEstado]       = useState('todos')
  const [filtroPrioridad, setFiltroPrioridad] = useState('todos')
  const [busqueda, setBusqueda]   = useState('')
  const [modal, setModal]         = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const puedeEditar = isAdmin || isSuperAdmin

  const cargar = useCallback(async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [{ data: acc }, { data: usrs }] = await Promise.all([
      supabase.from('acciones_plan').select('*').eq('tenant_id', tenant.id).order('fecha_limite', { ascending: true }),
      supabase.from('user_profiles').select('id, nombre, email').eq('activo', true),
    ])
    setAcciones(acc || [])
    setUsuarios(usrs || [])
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => { cargar() }, [cargar])

  const indicadores = {
    total:       acciones.length,
    completadas: acciones.filter(a => a.estado === 'completada').length,
    en_proceso:  acciones.filter(a => a.estado === 'en_proceso').length,
    vencidas:    acciones.filter(a => a.estado === 'vencida').length,
    pendientes:  acciones.filter(a => a.estado === 'pendiente').length,
  }
  const pctAvance = indicadores.total > 0
    ? Math.round((indicadores.completadas / indicadores.total) * 100) : 0

  const accionesFiltradas = acciones.filter(a => {
    if (filtroEstado !== 'todos' && a.estado !== filtroEstado) return false
    if (filtroPrioridad !== 'todos' && a.prioridad !== filtroPrioridad) return false
    if (busqueda && !a.titulo?.toLowerCase().includes(busqueda.toLowerCase()) &&
        !a.factor_riesgo?.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  async function eliminar(id) {
    await supabase.from('acciones_plan').delete().eq('id', id)
    setConfirmDel(null)
    cargar()
  }

  async function cambiarEstado(id, estado) {
    await supabase.from('acciones_plan').update({
      estado,
      fecha_completado: estado === 'completada' ? new Date().toISOString().split('T')[0] : null
    }).eq('id', id)
    cargar()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Cargando plan de acción…</div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan de Acción</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tenant?.nombre} · Seguimiento ALA/CFT</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setModal('nueva')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
            <span className="text-base leading-none">+</span> Nueva acción
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Completadas', val: indicadores.completadas, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
          { label: 'En proceso',  val: indicadores.en_proceso,  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
          { label: 'Vencidas',    val: indicadores.vencidas,    color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'   },
          { label: 'Pendientes',  val: indicadores.pendientes,  color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200'},
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
            <div className={`text-3xl font-extrabold ${kpi.color}`}>{kpi.val}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wide">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Avance general del plan</span>
          <span className="text-sm font-bold text-brand-600">{pctAvance}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div className="h-3 rounded-full bg-brand-600 transition-all duration-500"
            style={{ width: `${pctAvance}%` }} />
        </div>
        <div className="text-xs text-gray-400 mt-1">{indicadores.completadas} de {indicadores.total} acciones completadas</div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          placeholder="Buscar acción..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
        />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-500"
          value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {ESTADOS.map(s => <option key={s} value={s}>{COLOR_ESTADO[s]?.label || s}</option>)}
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-brand-500"
          value={filtroPrioridad} onChange={e => setFiltroPrioridad(e.target.value)}>
          <option value="todos">Todas las prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
        </select>
        <span className="text-xs text-gray-400">{accionesFiltradas.length} resultado{accionesFiltradas.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {accionesFiltradas.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <div className="font-medium">Sin acciones {filtroEstado !== 'todos' ? `con estado "${COLOR_ESTADO[filtroEstado]?.label}"` : ''}</div>
            {puedeEditar && <div className="text-sm mt-1">Haga clic en "Nueva acción" para agregar una.</div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Título</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Bloque</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Responsable</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Vence</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Prioridad</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Estado</th>
                  {puedeEditar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accionesFiltradas.map(a => {
                  const bloque = BLOQUES.find(b => b.id === a.bloque_id)
                  const responsable = usuarios.find(u => u.id === a.responsable_id)
                  const hoy = new Date().toISOString().split('T')[0]
                  const isVencida = a.fecha_limite < hoy && a.estado !== 'completada'
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 max-w-xs truncate" title={a.titulo}>{a.titulo}</div>
                        {a.observaciones && <div className="text-xs text-gray-400 truncate max-w-xs">{a.observaciones}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{bloque?.nombre || a.factor_riesgo || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {responsable?.nombre || a.responsable_nombre || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm font-medium ${isVencida ? 'text-red-600' : 'text-gray-700'}`}>
                          {fmtFecha(a.fecha_limite)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge cfg={COLOR_PRIORIDAD[a.prioridad] || { bg:'bg-gray-100', text:'text-gray-600', label: a.prioridad }} />
                      </td>
                      <td className="px-4 py-3">
                        {puedeEditar ? (
                          <select
                            value={a.estado}
                            onChange={e => cambiarEstado(a.id, e.target.value)}
                            className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${COLOR_ESTADO[a.estado]?.bg} ${COLOR_ESTADO[a.estado]?.text}`}>
                            {ESTADOS.map(s => <option key={s} value={s}>{COLOR_ESTADO[s]?.label || s}</option>)}
                          </select>
                        ) : (
                          <Badge cfg={COLOR_ESTADO[a.estado] || { bg:'bg-gray-100', text:'text-gray-600', label: a.estado }} />
                        )}
                      </td>
                      {puedeEditar && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setModal(a)}
                              className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-brand-100 text-gray-600 hover:text-brand-700 transition-colors">
                              Editar
                            </button>
                            <button onClick={() => setConfirmDel(a.id)}
                              className="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-700 transition-colors">
                              ✕
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalAccion
          accion={modal === 'nueva' ? null : modal}
          tenantId={tenant.id}
          usuarios={usuarios}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar() }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-full max-w-sm text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="font-bold text-gray-900 mb-2">¿Eliminar esta acción?</h3>
            <p className="text-sm text-gray-500 mb-5">Esta operación no se puede deshacer.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
