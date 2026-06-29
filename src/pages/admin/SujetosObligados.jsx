import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ACTIVIDADES_APNFD, TIPO_SUJETO } from '../../lib/catalogos'
import ErrorBanner from '../../components/ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'

const EMPTY = {
  nombre: '',
  cedula_juridica: '',
  actividad_apnfd: '',
  clase_dato: '',
  archivo: '',
  tipo_sujeto: 'I',
  meses_periodo: 2,
  tipo_moneda_default: 2,
  monto_minimo_usd: '',
  email_oficial_cumplimiento: '',
}

export default function SujetosObligados() {
  const [tenants, setTenants]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [busqueda, setBusqueda] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .order('nombre')
    setTenants(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function set(f, v) {
    setForm(p => {
      const next = { ...p, [f]: v }
      // Al cambiar actividad, auto-llenar clase_dato, archivo y monto_minimo
      if (f === 'actividad_apnfd') {
        const act = ACTIVIDADES_APNFD.find(a => a.nombre === v)
        if (act) {
          next.clase_dato = act.clase_dato
          next.archivo    = act.archivo
          next.monto_minimo_usd = act.monto_min_usd
        }
      }
      // Al cambiar tipo_sujeto, auto-llenar meses_periodo
      if (f === 'tipo_sujeto') {
        const ts = TIPO_SUJETO.find(t => t.tipo === v)
        if (ts) next.meses_periodo = ts.meses
      }
      return next
    })
  }

  function startEdit(t) {
    setForm({ ...EMPTY, ...t })
    setEditId(t.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setForm(EMPTY)
    setEditId(null)
    setShowForm(false)
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        nombre:                     form.nombre,
        cedula_juridica:            form.cedula_juridica,
        actividad_apnfd:            form.actividad_apnfd,
        clase_dato:                 Number(form.clase_dato),
        archivo:                    Number(form.archivo),
        tipo_sujeto:                form.tipo_sujeto,
        meses_periodo:              Number(form.meses_periodo),
        tipo_moneda_default:        Number(form.tipo_moneda_default),
        monto_minimo_usd:           form.monto_minimo_usd ? Number(form.monto_minimo_usd) : null,
        email_oficial_cumplimiento: form.email_oficial_cumplimiento || null,
      }
      let result
      if (editId) {
        result = await supabase.from('tenants').update(payload).eq('id', editId)
      } else {
        result = await supabase.from('tenants').insert(payload)
      }
      if (result.error) throw result.error
      cancelar()
      load()
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActivo(id, activo) {
    await supabase.from('tenants').update({ activo: !activo }).eq('id', id)
    load()
  }

  async function eliminarConRespaldo(t) {
    if (!confirm(`¿Eliminar "${t.nombre}" y TODA su información?\n\nSe generará un respaldo en Excel antes de eliminar. Esta acción no se puede deshacer.`)) return

    setError('')
    setSaving(true)
    try {
      // 1. Exportar toda la data del tenant
      const [{ data: txns }, { data: clientes }, { data: periodos }, { data: mems }] = await Promise.all([
        supabase.from('transacciones').select('*').eq('tenant_id', t.id),
        supabase.from('clientes').select('*').eq('tenant_id', t.id),
        supabase.from('periodos_declarados').select('*').eq('tenant_id', t.id),
        supabase.from('user_tenant_memberships').select('*, user_profiles(nombre, email)').eq('tenant_id', t.id),
      ])

      // 2. Construir y descargar el Excel de respaldo
      const { utils, writeFile } = await import('xlsx')
      const wb = utils.book_new()

      const infoSheet = utils.json_to_sheet([{
        nombre: t.nombre, cedula_juridica: t.cedula_juridica,
        actividad_apnfd: t.actividad_apnfd, tipo_sujeto: t.tipo_sujeto,
        clase_dato: t.clase_dato, archivo: t.archivo,
        email_oficial_cumplimiento: t.email_oficial_cumplimiento,
        fecha_respaldo: new Date().toISOString(),
      }])
      utils.book_append_sheet(wb, infoSheet, 'Info')

      if (txns?.length)     utils.book_append_sheet(wb, utils.json_to_sheet(txns),    'Transacciones')
      if (clientes?.length) utils.book_append_sheet(wb, utils.json_to_sheet(clientes), 'Clientes')
      if (periodos?.length) utils.book_append_sheet(wb, utils.json_to_sheet(periodos), 'Periodos')
      if (mems?.length)     utils.book_append_sheet(wb, utils.json_to_sheet(
        mems.map(m => ({ usuario: m.user_profiles?.nombre, email: m.user_profiles?.email, rol: m.rol }))
      ), 'Usuarios')

      const nombre = t.nombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)
      const fecha  = new Date().toISOString().substring(0, 10)
      writeFile(wb, `RESPALDO_${nombre}_${fecha}.xlsx`)

      // 3. Eliminar (el CASCADE de la BD borra transacciones, clientes, etc.)
      await supabase.from('user_tenant_memberships').delete().eq('tenant_id', t.id)
      const { error: delErr } = await supabase.from('tenants').delete().eq('id', t.id)
      if (delErr) throw delErr

      load()
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setSaving(false)
    }
  }

  const filtrados = tenants.filter(t =>
    t.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    t.cedula_juridica.includes(busqueda)
  )

  const actividadSeleccionada = ACTIVIDADES_APNFD.find(a => a.nombre === form.actividad_apnfd)

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sujetos Obligados</h1>
          <p className="text-gray-500 text-sm mt-1">Gestión de clientes inscritos ante SUGEF — Ley 7786</p>
        </div>
        <button className="btn-primary" onClick={() => { cancelar(); setShowForm(s => !s) }}>
          {showForm && !editId ? '✕ Cancelar' : '+ Nuevo sujeto obligado'}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={guardar} className="card space-y-6">
          <h3 className="font-semibold text-gray-900 text-lg">
            {editId ? 'Editar sujeto obligado' : 'Nuevo sujeto obligado'}
          </h3>

          <ErrorBanner error={error} onClose={() => setError(null)} />

          {/* Datos generales */}
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos generales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nombre de la empresa *</label>
                <input className="input-field" required
                  placeholder="Nombre completo del sujeto obligado"
                  value={form.nombre} onChange={e => set('nombre', e.target.value)} />
              </div>
              <div>
                <label className="label">Cédula jurídica *</label>
                <input className="input-field" required
                  placeholder="Ej: 3101782164"
                  value={form.cedula_juridica} onChange={e => set('cedula_juridica', e.target.value)} />
              </div>
              <div>
                <label className="label">Correo oficial de cumplimiento</label>
                <input type="email" className="input-field"
                  placeholder="cumplimiento@empresa.com"
                  value={form.email_oficial_cumplimiento}
                  onChange={e => set('email_oficial_cumplimiento', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Actividad APNFD */}
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Actividad APNFD — SUGEF</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Actividad *</label>
                <select className="input-field" required value={form.actividad_apnfd}
                  onChange={e => set('actividad_apnfd', e.target.value)}>
                  <option value="">— Seleccione la actividad —</option>
                  {ACTIVIDADES_APNFD.map(a => (
                    <option key={a.clase_dato} value={a.nombre}>{a.nombre}</option>
                  ))}
                </select>
                {actividadSeleccionada && (
                  <p className="text-xs text-green-700 mt-1">
                    ✓ ClaseDato: {actividadSeleccionada.clase_dato} · Archivo: {actividadSeleccionada.archivo} · Monto mínimo: USD {actividadSeleccionada.monto_min_usd.toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Clase de dato</label>
                <input className="input-field bg-gray-50" readOnly
                  value={form.clase_dato} />
              </div>
              <div>
                <label className="label">Código de archivo</label>
                <input className="input-field bg-gray-50" readOnly
                  value={form.archivo} />
              </div>
            </div>
          </div>

          {/* Tipo de sujeto y período */}
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Configuración de reporte</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Tipo de sujeto *</label>
                <select className="input-field" value={form.tipo_sujeto}
                  onChange={e => set('tipo_sujeto', e.target.value)}>
                  {TIPO_SUJETO.map(t => (
                    <option key={t.tipo} value={t.tipo}>{t.descripcion}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Meses por período</label>
                <input className="input-field bg-gray-50" readOnly
                  value={`${form.meses_periodo} meses`} />
              </div>
              <div>
                <label className="label">Moneda de reporte</label>
                <select className="input-field" value={form.tipo_moneda_default}
                  onChange={e => set('tipo_moneda_default', Number(e.target.value))}>
                  <option value={1}>1 — Colones (CRC)</option>
                  <option value={2}>2 — Dólares (USD)</option>
                </select>
              </div>
              <div>
                <label className="label">Monto mínimo USD</label>
                <input type="number" className="input-field" min="0"
                  value={form.monto_minimo_usd}
                  onChange={e => set('monto_minimo_usd', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={cancelar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Crear sujeto obligado'}
            </button>
          </div>
        </form>
      )}

      {/* Lista */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">{filtrados.length} sujeto{filtrados.length !== 1 ? 's' : ''} obligado{filtrados.length !== 1 ? 's' : ''}</p>
          <input className="input-field w-64"
            placeholder="Buscar por nombre o cédula…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-4xl mb-2">🏢</p>
            <p>No hay sujetos obligados registrados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(t => (
              <div key={t.id}
                className={`border rounded-xl p-4 flex items-center justify-between gap-4 ${t.activo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                    {t.nombre[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{t.nombre}</p>
                      {!t.activo && <span className="badge-error">Inactivo</span>}
                    </div>
                    <p className="text-sm text-gray-500">Cédula: {t.cedula_juridica}</p>
                  </div>
                </div>

                <div className="hidden lg:flex items-center gap-6 text-sm text-gray-600 flex-shrink-0">
                  <div className="text-center">
                    <p className="font-medium text-gray-900">{t.actividad_apnfd}</p>
                    <p className="text-xs text-gray-400">Actividad</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-gray-900">Tipo {t.tipo_sujeto}</p>
                    <p className="text-xs text-gray-400">c/ {t.meses_periodo} meses</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-gray-900">{t.clase_dato} / {t.archivo}</p>
                    <p className="text-xs text-gray-400">Clase / Archivo</p>
                  </div>
                  {t.monto_minimo_usd && (
                    <div className="text-center">
                      <p className="font-medium text-gray-900">USD {Number(t.monto_minimo_usd).toLocaleString()}</p>
                      <p className="text-xs text-gray-400">Monto mín.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => startEdit(t)}
                    className="btn-secondary text-xs py-1.5 px-3">
                    Editar
                  </button>
                  <button onClick={() => toggleActivo(t.id, t.activo)}
                    className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors ${
                      t.activo
                        ? 'text-amber-600 hover:bg-amber-50 border border-amber-200'
                        : 'text-green-600 hover:bg-green-50 border border-green-200'
                    }`}>
                    {t.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => eliminarConRespaldo(t)}
                    disabled={saving}
                    title="Genera respaldo Excel y elimina permanentemente"
                    className="text-xs py-1.5 px-3 rounded-lg font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                  >
                    🗑 Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
