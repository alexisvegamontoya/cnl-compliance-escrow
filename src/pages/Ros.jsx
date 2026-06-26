import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { TIPO_IDENTIFICACION, TIPO_MONEDA } from '../lib/catalogos'
import { exportarExcel } from '../lib/exportExcel'
import { logAudit } from '../lib/auditLog'
import { alertaROS } from '../lib/emailAlertas'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'

const EMPTY = {
  fecha_elaboracion: new Date().toISOString().split('T')[0],
  area_reporta: '',
  nombre_reportado: '',
  numero_identificacion: '',
  tipo_identificacion: 1,
  actividad_economica_cliente: '',
  medio_movilizacion: '',
  por_cuenta_nombre: '',
  por_cuenta_id: '',
  a_favor_nombre: '',
  a_favor_id: '',
  monto_aproximado: '',
  moneda: 2,
  senales_alerta: '',
  descripcion_completa: '',
}

const ESTADO_CONFIG = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-600' },
  enviado:  { label: 'Enviado al OC', color: 'bg-green-100 text-green-700' },
  archivado:{ label: 'Archivado', color: 'bg-blue-100 text-blue-700' },
}

const MEDIOS = ['Efectivo', 'Cheque', 'Transferencia', 'Tarjeta', 'Criptomonedas', 'Otro']

export default function Ros() {
  const { tenant, profile } = useAuth()
  const [reportes, setReportes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [vistaPrevia, setVistaPrevia] = useState(null)

  const load = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const { data } = await supabase
      .from('reportes_ros')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    setReportes(data || [])
    setLoading(false)
  }, [tenant])

  useEffect(() => { load() }, [load])

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  function cancelar() { setForm(EMPTY); setEditId(null); setShowForm(false); setError('') }

  function startEdit(r) {
    setForm({ ...EMPTY, ...r })
    setEditId(r.id)
    setShowForm(true)
    setVistaPrevia(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function guardar(e, nuevoEstado) {
    e?.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      tenant_id: tenant.id,
      ...form,
      monto_aproximado: form.monto_aproximado ? Number(form.monto_aproximado) : null,
      tipo_identificacion: Number(form.tipo_identificacion),
      moneda: Number(form.moneda),
      estado: nuevoEstado || form.estado || 'borrador',
      enviado_en: nuevoEstado === 'enviado' ? new Date().toISOString() : undefined,
      created_by: profile?.id,
    }
    const isNew = !editId
    const { error: err } = editId
      ? await supabase.from('reportes_ros').update(payload).eq('id', editId)
      : await supabase.from('reportes_ros').insert(payload)
    if (err) { setError(clasificarError(err)); setSaving(false); return }

    // Alerta automática por correo solo en creación
    if (isNew) {
      alertaROS({
        nombreReportado: form.nombre_reportado,
        monto: form.monto_aproximado || 'No especificado',
        moneda: 'USD',
        descripcion: form.descripcion_completa || form.descripcion_operacion_sospechosa || '',
        fecha: form.fecha_elaboracion,
        userEmail: profile?.email,
      })
      logAudit({ accion: 'crear', tabla: 'reportes_ros', descripcion: `Nuevo ROS: ${form.nombre_reportado}` })
    } else {
      logAudit({ accion: 'editar', tabla: 'reportes_ros', registro_id: editId, descripcion: `Edición ROS: ${form.nombre_reportado}` })
    }

    cancelar()
    load()
    setSaving(false)
  }

  function generarMailto(r) {
    const asunto = encodeURIComponent(`ROS – ${r.nombre_reportado} – ${r.fecha_elaboracion}`)
    const cuerpo = encodeURIComponent(
      `Estimados,\n\nSe adjunta Reporte de Operación Sospechosa para revisión.\n\n` +
      `Fecha de elaboración: ${r.fecha_elaboracion}\n` +
      `Área que reporta: ${r.area_reporta || '—'}\n` +
      `Persona/Empresa reportada: ${r.nombre_reportado}\n` +
      `Identificación: ${r.numero_identificacion}\n` +
      `Monto aproximado: ${r.monto_aproximado ? 'USD ' + Number(r.monto_aproximado).toLocaleString() : '—'}\n\n` +
      `Señales de alerta:\n${r.senales_alerta || '—'}\n\n` +
      `Descripción completa:\n${r.descripcion_completa || '—'}\n\n` +
      `Emitido desde CNL Compliance App\n${tenant?.nombre}`
    )
    return `mailto:cumplimiento@cnl.cr?cc=${profile?.email || ''}&subject=${asunto}&body=${cuerpo}`
  }

  function imprimirROS(r) {
    const w = window.open('', '_blank')
    w.document.write(`
      <html><head><title>ROS – ${r.nombre_reportado}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 40px; color: #1a1a1a; }
        h1 { font-size: 16px; border-bottom: 2px solid #0e0e6e; padding-bottom: 8px; color: #0e0e6e; }
        h2 { font-size: 13px; color: #0e0e6e; margin-top: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .field { margin: 4px 0; }
        .label { font-weight: bold; color: #555; }
        .value { color: #111; }
        .textarea { background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 4px; white-space: pre-wrap; }
        .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 16px; font-size: 11px; color: #666; }
        .firma { margin-top: 60px; display: flex; justify-content: space-around; }
        .firma-box { text-align: center; border-top: 1px solid #333; padding-top: 8px; min-width: 200px; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>Reporte de Operación Sospechosa (ROS)</h1>
      <p style="color:#666; margin-bottom:16px;">${tenant?.nombre} · Oficina de Cumplimiento ALA/CFT</p>

      <h2>A) Información General del Reporte</h2>
      <div class="grid">
        <div class="field"><span class="label">Fecha de elaboración:</span><br><span class="value">${r.fecha_elaboracion}</span></div>
        <div class="field"><span class="label">Área que reporta:</span><br><span class="value">${r.area_reporta || '—'}</span></div>
      </div>

      <h2>B) Información General del Cliente</h2>
      <div class="grid">
        <div class="field"><span class="label">Nombre:</span><br><span class="value">${r.nombre_reportado}</span></div>
        <div class="field"><span class="label">Identificación:</span><br><span class="value">${r.numero_identificacion}</span></div>
        <div class="field"><span class="label">Actividad económica:</span><br><span class="value">${r.actividad_economica_cliente || '—'}</span></div>
        <div class="field"><span class="label">Monto aproximado:</span><br><span class="value">${r.monto_aproximado ? 'USD ' + Number(r.monto_aproximado).toLocaleString() : '—'}</span></div>
      </div>

      <h2>C) Información de la Operación Sospechosa</h2>
      <div class="grid">
        <div class="field"><span class="label">Medio utilizado:</span><br><span class="value">${r.medio_movilizacion || '—'}</span></div>
        <div></div>
        <div class="field"><span class="label">Por cuenta de:</span><br><span class="value">${r.por_cuenta_nombre || '—'} ${r.por_cuenta_id ? '(' + r.por_cuenta_id + ')' : ''}</span></div>
        <div class="field"><span class="label">A favor de:</span><br><span class="value">${r.a_favor_nombre || '—'} ${r.a_favor_id ? '(' + r.a_favor_id + ')' : ''}</span></div>
      </div>

      <h2>D) Señales de Alerta / Antecedentes</h2>
      <div class="textarea">${r.senales_alerta || '—'}</div>

      <h2>E) Descripción Completa de la Actividad Sospechosa</h2>
      <div class="textarea">${r.descripcion_completa || '—'}</div>

      <div class="firma">
        <div class="firma-box">Elaborado por<br><br>${profile?.nombre || ''}${profile?.nombre ? '<br>' : ''}Oficial de Cumplimiento</div>
        <div class="firma-box">Revisado por<br><br>Junta Directiva / Representante Legal</div>
      </div>

      <div class="footer">
        Generado el ${new Date().toLocaleDateString('es-CR')} · CNL Compliance App · ${tenant?.nombre}
      </div>
      </body></html>
    `)
    w.document.close()
    setTimeout(() => { w.print() }, 500)
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporte de Operación Sospechosa</h1>
          <p className="text-gray-500 text-sm mt-1">Formulario ROS — Ley 7786 / SUGEF 13-19</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              exportarExcel({
                data: ros,
                columnas: ['fecha_elaboracion','nombre_reportado','numero_identificacion','actividad_economica_cliente','monto_total_operacion','moneda','descripcion_operacion_sospechosa','estado'],
                headers: {
                  fecha_elaboracion: 'Fecha', nombre_reportado: 'Nombre Reportado', numero_identificacion: 'N° ID',
                  actividad_economica_cliente: 'Actividad', monto_total_operacion: 'Monto Total',
                  moneda: 'Moneda', descripcion_operacion_sospechosa: 'Descripción', estado: 'Estado',
                },
                nombreArchivo: 'ros_cnl',
                nombreHoja: 'ROS',
              })
              logAudit({ accion: 'exportar', tabla: 'ros', descripcion: `Exportación Excel de ${ros.length} ROS` })
            }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            📥 Exportar Excel
          </button>
          <button className="btn-primary" onClick={() => { cancelar(); setShowForm(s => !s) }}>
            {showForm && !editId ? '✕ Cancelar' : '+ Nuevo ROS'}
          </button>
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={guardar} className="space-y-5">
          <ErrorBanner error={error} onClose={() => setError(null)} />

          {/* A) Info general */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-brand-700 text-sm uppercase tracking-wider">A) Información General del Reporte</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha de elaboración *</label>
                <input type="date" className="input-field" required
                  value={form.fecha_elaboracion} onChange={e => set('fecha_elaboracion', e.target.value)} />
              </div>
              <div>
                <label className="label">Área que reporta</label>
                <input className="input-field" placeholder="Ej: Oficina de Cumplimiento"
                  value={form.area_reporta} onChange={e => set('area_reporta', e.target.value)} />
              </div>
            </div>
          </div>

          {/* B) Info cliente */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-brand-700 text-sm uppercase tracking-wider">B) Información General del Cliente</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Nombre de la persona física o jurídica *</label>
                <input className="input-field" required placeholder="Nombre completo"
                  value={form.nombre_reportado} onChange={e => set('nombre_reportado', e.target.value)} />
              </div>
              <div>
                <label className="label">Tipo de identificación</label>
                <select className="input-field" value={form.tipo_identificacion}
                  onChange={e => set('tipo_identificacion', Number(e.target.value))}>
                  {TIPO_IDENTIFICACION.map(t => (
                    <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Número de identificación</label>
                <input className="input-field" placeholder="Sin guiones"
                  value={form.numero_identificacion} onChange={e => set('numero_identificacion', e.target.value)} />
              </div>
              <div>
                <label className="label">Actividad económica del cliente</label>
                <input className="input-field"
                  value={form.actividad_economica_cliente} onChange={e => set('actividad_economica_cliente', e.target.value)} />
              </div>
              <div>
                <label className="label">Monto aproximado involucrado</label>
                <div className="flex gap-2">
                  <select className="input-field w-32" value={form.moneda}
                    onChange={e => set('moneda', Number(e.target.value))}>
                    {TIPO_MONEDA.map(m => <option key={m.codigo} value={m.codigo}>{m.descripcion}</option>)}
                  </select>
                  <input type="number" className="input-field flex-1" min="0" step="0.01"
                    placeholder="0.00"
                    value={form.monto_aproximado} onChange={e => set('monto_aproximado', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* C) Operación */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-brand-700 text-sm uppercase tracking-wider">C) Información de la Operación</h3>
            <div>
              <label className="label">Medio utilizado para la movilización de recursos</label>
              <div className="flex flex-wrap gap-3 mt-2">
                {MEDIOS.map(m => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={form.medio_movilizacion?.includes(m)}
                      onChange={e => {
                        const actual = form.medio_movilizacion ? form.medio_movilizacion.split(', ').filter(Boolean) : []
                        const nuevo = e.target.checked ? [...actual, m] : actual.filter(x => x !== m)
                        set('medio_movilizacion', nuevo.join(', '))
                      }} />
                    <span className="text-sm">{m}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Por cuenta de — Nombre</label>
                <input className="input-field"
                  value={form.por_cuenta_nombre} onChange={e => set('por_cuenta_nombre', e.target.value)} />
              </div>
              <div>
                <label className="label">Por cuenta de — Identificación</label>
                <input className="input-field"
                  value={form.por_cuenta_id} onChange={e => set('por_cuenta_id', e.target.value)} />
              </div>
              <div>
                <label className="label">A favor de — Nombre</label>
                <input className="input-field"
                  value={form.a_favor_nombre} onChange={e => set('a_favor_nombre', e.target.value)} />
              </div>
              <div>
                <label className="label">A favor de — Identificación</label>
                <input className="input-field"
                  value={form.a_favor_id} onChange={e => set('a_favor_id', e.target.value)} />
              </div>
            </div>
          </div>

          {/* D) Señales de alerta */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-brand-700 text-sm uppercase tracking-wider">D) Señales de Alerta / Antecedentes</h3>
            <p className="text-xs text-gray-500">Descripción de la(s) señal(es) de alerta. Indique si la actividad es periódica o aislada, y si se ajusta al comportamiento habitual del cliente.</p>
            <textarea className="input-field" rows={4} required
              placeholder="Describa las señales de alerta detectadas…"
              value={form.senales_alerta} onChange={e => set('senales_alerta', e.target.value)} />
          </div>

          {/* E) Descripción */}
          <div className="card space-y-3">
            <h3 className="font-semibold text-brand-700 text-sm uppercase tracking-wider">E) Descripción Completa de la Actividad Sospechosa</h3>
            <p className="text-xs text-gray-500">Adjunte copia de documentación de soporte (estados de cuenta, cheques, depósitos, remesas, transferencias) que puedan ayudar en el proceso de revisión.</p>
            <textarea className="input-field" rows={6} required
              placeholder="Descripción detallada de la actividad sospechosa…"
              value={form.descripcion_completa} onChange={e => set('descripcion_completa', e.target.value)} />
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              📎 Para adjuntar evidencia, guarde el borrador, luego use el botón "Enviar por correo" que incluirá el detalle completo al Oficial de Cumplimiento.
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={cancelar}>Cancelar</button>
            <button type="button" className="btn-secondary" onClick={e => guardar(e, 'borrador')} disabled={saving}>
              {saving ? '…' : 'Guardar borrador'}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : editId ? 'Actualizar ROS' : 'Crear ROS'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de reportes */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Reportes registrados</h3>
          <p className="text-sm text-gray-500">{reportes.length} ROS</p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400">Cargando…</div>
        ) : reportes.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <p className="text-4xl mb-2">🚨</p>
            <p>No hay reportes de operaciones sospechosas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reportes.map(r => {
              const est = ESTADO_CONFIG[r.estado] || ESTADO_CONFIG.borrador
              return (
                <div key={r.id} className="border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center text-xl flex-shrink-0">🚨</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{r.nombre_reportado}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${est.color}`}>{est.label}</span>
                    </div>
                    <p className="text-sm text-gray-400">{r.numero_identificacion} · {r.fecha_elaboracion}</p>
                    {r.senales_alerta && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{r.senales_alerta}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => imprimirROS(r)}
                      className="text-brand-600 hover:text-brand-800 text-xs font-medium">
                      🖨️ PDF
                    </button>
                    <a href={generarMailto(r)}
                      className="text-green-600 hover:text-green-800 text-xs font-medium">
                      📧 Enviar
                    </a>
                    <button onClick={() => startEdit(r)}
                      className="btn-secondary text-xs py-1.5 px-3">Editar</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
