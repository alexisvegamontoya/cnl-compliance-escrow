import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logAudit } from '../lib/auditLog'
import { alertaCuestionario } from '../lib/emailAlertas'

// ── Helpers ─────────────────────────────────────────────────────────────────
function diasRestantes(fechaStr) {
  if (!fechaStr) return null
  const diff = Math.ceil((new Date(fechaStr) - new Date()) / 86400000)
  return diff
}

function EstadoBadge({ estado }) {
  const cfg = {
    pendiente:   'bg-yellow-100 text-yellow-800 border-yellow-200',
    en_proceso:  'bg-blue-100 text-blue-800 border-blue-200',
    completado:  'bg-green-100 text-green-800 border-green-200',
    vencido:     'bg-red-100 text-red-800 border-red-200',
  }
  const label = { pendiente: 'Pendiente', en_proceso: 'En proceso', completado: 'Completado', vencido: 'Vencido' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg[estado] || 'bg-gray-100 text-gray-600'}`}>
      {label[estado] || estado}
    </span>
  )
}

// ── Vista Superadmin/Admin: gestión de cuestionarios ─────────────────────────
function VistaSuperAdmin({ tenants }) {
  const { session } = useAuth()
  const [lista, setLista]         = useState([])
  const [showForm, setShowForm]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState(null)
  const [respuestas, setRespuestas] = useState([])
  const [viewResp, setViewResp]   = useState(null)

  const [form, setForm] = useState({
    tenant_id: '',
    titulo: '',
    descripcion: '',
    fecha_limite: '',
    archivo_plantilla: '',
    nombre_archivo: '',
  })

  const fetchLista = useCallback(async () => {
    const { data } = await supabase
      .from('cuestionarios')
      .select('*, tenants(nombre)')
      .order('created_at', { ascending: false })
    setLista(data || [])
  }, [])

  const fetchRespuestas = useCallback(async (cuestionarioId) => {
    const { data } = await supabase
      .from('respuestas_cuestionario')
      .select('*, user_profiles(nombre, email)')
      .eq('cuestionario_id', cuestionarioId)
      .order('submitted_at', { ascending: false })
    setRespuestas(data || [])
  }, [])

  useEffect(() => { fetchLista() }, [fetchLista])

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const path = `plantillas/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('cuestionarios').upload(path, file)
    setUploading(false)
    if (error) { setMsg({ tipo: 'err', texto: error.message }); return }
    setForm(f => ({ ...f, archivo_plantilla: path, nombre_archivo: file.name }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.tenant_id) { setMsg({ tipo: 'err', texto: 'Seleccione un sujeto obligado.' }); return }
    setSaving(true)
    setMsg(null)
    const { data: cuest, error } = await supabase.from('cuestionarios').insert({
      tenant_id:         form.tenant_id,
      titulo:            form.titulo,
      descripcion:       form.descripcion,
      fecha_limite:      form.fecha_limite || null,
      archivo_plantilla: form.archivo_plantilla || null,
      nombre_archivo:    form.nombre_archivo || null,
      created_by:        session.user.id,
    }).select().single()

    if (error) { setSaving(false); setMsg({ tipo: 'err', texto: error.message }); return }

    // Notificar a todos los usuarios del tenant
    const { data: usuarios } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', form.tenant_id)

    if (usuarios?.length) {
      await supabase.from('notificaciones').insert(
        usuarios.map(u => ({
          tenant_id: form.tenant_id,
          user_id:   u.id,
          titulo:    `Nuevo cuestionario asignado: ${form.titulo}`,
          mensaje:   form.fecha_limite
            ? `Debe completarlo antes del ${new Date(form.fecha_limite).toLocaleDateString('es-CR')}.`
            : 'Ingrese al módulo de Cuestionarios para completarlo.',
          tipo:        'alerta',
          url_accion:  '/cuestionarios',
        }))
      )
    }

    // Alerta por correo al oficial de cumplimiento
    const tenantNombre = tenants.find(t => t.id === form.tenant_id)?.nombre || form.tenant_id
    alertaCuestionario({
      titulo:       form.titulo,
      tenantNombre,
      fechaLimite:  form.fecha_limite ? new Date(form.fecha_limite).toLocaleDateString('es-CR') : null,
      userEmail:    session.user.email,
    })
    await logAudit({ accion: 'crear', tabla: 'cuestionarios', registro_id: cuest.id, descripcion: `Cuestionario asignado: ${form.titulo}`, tenant_id: form.tenant_id })
    setSaving(false)
    setMsg({ tipo: 'ok', texto: 'Cuestionario creado y usuarios notificados.' })
    setForm({ tenant_id: '', titulo: '', descripcion: '', fecha_limite: '', archivo_plantilla: '', nombre_archivo: '' })
    setShowForm(false)
    fetchLista()
  }

  async function descargarPlantilla(path, nombre) {
    const { data } = await supabase.storage.from('cuestionarios').createSignedUrl(path, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl; a.download = nombre || 'plantilla'; a.click()
    }
  }

  async function actualizarEstado(id, estado) {
    await supabase.from('cuestionarios').update({ estado }).eq('id', id)
    fetchLista()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cuestionarios de Evaluación</h1>
          <p className="text-gray-500 text-sm mt-1">Asigne y gestione cuestionarios para cada sujeto obligado.</p>
        </div>
        <button onClick={() => { setShowForm(s => !s); setMsg(null) }} className="btn-primary">
          {showForm ? '✕ Cancelar' : '+ Asignar cuestionario'}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">Nuevo cuestionario</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Sujeto Obligado *</label>
                <select className="input" value={form.tenant_id} onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))} required>
                  <option value="">Seleccione...</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Fecha límite</label>
                <input type="date" className="input" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Título del cuestionario *</label>
              <input type="text" className="input" required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Evaluación de riesgos LC/FT 2025" />
            </div>
            <div>
              <label className="label">Descripción / instrucciones</label>
              <textarea className="input resize-none" rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Instrucciones para el usuario..." />
            </div>
            <div>
              <label className="label">Plantilla Excel (opcional)</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
              {uploading && <p className="text-xs text-gray-400 mt-1">Subiendo archivo…</p>}
              {form.nombre_archivo && <p className="text-xs text-green-600 mt-1">✅ {form.nombre_archivo}</p>}
            </div>
            {msg && (
              <div className={`text-sm rounded-lg px-4 py-3 ${msg.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {msg.tipo === 'ok' ? '✅' : '⚠'} {msg.texto}
              </div>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={saving || uploading} className="btn-primary">
                {saving ? 'Guardando…' : 'Crear y notificar usuarios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de cuestionarios */}
      <div className="space-y-3">
        {lista.length === 0 && (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-3xl mb-2">📋</p>
            <p>No hay cuestionarios creados aún.</p>
          </div>
        )}
        {lista.map(c => {
          const dias = diasRestantes(c.fecha_limite)
          return (
            <div key={c.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{c.titulo}</p>
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">🏢 {c.tenants?.nombre}</p>
                  {c.descripcion && <p className="text-sm text-gray-600 mt-1">{c.descripcion}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                    {c.fecha_limite && (
                      <span className={dias !== null && dias < 0 ? 'text-red-500 font-medium' : dias !== null && dias <= 7 ? 'text-orange-500 font-medium' : ''}>
                        📅 Vence: {new Date(c.fecha_limite).toLocaleDateString('es-CR')}
                        {dias !== null && ` (${dias < 0 ? 'vencido' : `${dias}d`})`}
                      </span>
                    )}
                    <span>📅 Creado: {new Date(c.created_at).toLocaleDateString('es-CR')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {c.archivo_plantilla && (
                    <button onClick={() => descargarPlantilla(c.archivo_plantilla, c.nombre_archivo)}
                      className="btn-secondary text-xs">📥 Plantilla</button>
                  )}
                  <select
                    value={c.estado}
                    onChange={e => actualizarEstado(c.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
                    <option value="pendiente">Pendiente</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="completado">Completado</option>
                    <option value="vencido">Vencido</option>
                  </select>
                  <button
                    onClick={() => { setViewResp(viewResp === c.id ? null : c.id); fetchRespuestas(c.id) }}
                    className="btn-secondary text-xs">
                    {viewResp === c.id ? 'Ocultar respuestas' : 'Ver respuestas'}
                  </button>
                </div>
              </div>

              {/* Respuestas */}
              {viewResp === c.id && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Respuestas enviadas</p>
                  {respuestas.length === 0 && <p className="text-sm text-gray-400">Sin respuestas aún.</p>}
                  {respuestas.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-gray-700">{r.user_profiles?.nombre || r.user_profiles?.email}</p>
                        <p className="text-xs text-gray-400">{new Date(r.submitted_at).toLocaleString('es-CR')}</p>
                        {r.notas && <p className="text-xs text-gray-500 mt-0.5">{r.notas}</p>}
                      </div>
                      {r.archivo_respuesta && (
                        <button onClick={async () => {
                          const { data } = await supabase.storage.from('cuestionarios').createSignedUrl(r.archivo_respuesta, 60)
                          if (data?.signedUrl) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = r.nombre_archivo || 'respuesta'; a.click() }
                        }} className="btn-secondary text-xs ml-3">
                          📥 Descargar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vista Usuario: completar cuestionario ─────────────────────────────────────
function VistaUsuario() {
  const { session, tenant } = useAuth()
  const [cuestionarios, setCuestionarios] = useState([])
  const [loading, setLoading]             = useState(true)
  const [submitting, setSubmitting]       = useState({})
  const [expandId, setExpandId]           = useState(null)
  const [notas, setNotas]                 = useState({})
  const [archivo, setArchivo]             = useState({})
  const [msg, setMsg]                     = useState({})

  useEffect(() => {
    supabase.from('cuestionarios')
      .select('*, respuestas_cuestionario(id, estado, submitted_at)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setCuestionarios(data || []); setLoading(false) })
  }, [])

  async function handleEnviar(cuestionarioId) {
    setSubmitting(s => ({ ...s, [cuestionarioId]: true }))
    setMsg(m => ({ ...m, [cuestionarioId]: null }))

    let archivoPath = null
    let nombreArchivo = null
    const file = archivo[cuestionarioId]

    if (file) {
      const path = `respuestas/${session.user.id}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('cuestionarios').upload(path, file)
      if (uploadErr) {
        setSubmitting(s => ({ ...s, [cuestionarioId]: false }))
        setMsg(m => ({ ...m, [cuestionarioId]: { tipo: 'err', texto: uploadErr.message } }))
        return
      }
      archivoPath = path
      nombreArchivo = file.name
    }

    const { error } = await supabase.from('respuestas_cuestionario').insert({
      cuestionario_id:  cuestionarioId,
      tenant_id:        tenant.id,
      user_id:          session.user.id,
      archivo_respuesta: archivoPath,
      nombre_archivo:   nombreArchivo,
      notas:            notas[cuestionarioId] || null,
    })

    setSubmitting(s => ({ ...s, [cuestionarioId]: false }))
    if (error) { setMsg(m => ({ ...m, [cuestionarioId]: { tipo: 'err', texto: error.message } })); return }

    // Actualizar estado del cuestionario a en_proceso
    await supabase.from('cuestionarios').update({ estado: 'en_proceso' }).eq('id', cuestionarioId)

    await logAudit({ accion: 'enviar', tabla: 'respuestas_cuestionario', descripcion: `Respuesta enviada al cuestionario ${cuestionarioId}` })
    setMsg(m => ({ ...m, [cuestionarioId]: { tipo: 'ok', texto: 'Respuesta enviada correctamente.' } }))
    setArchivo(a => ({ ...a, [cuestionarioId]: null }))
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando…</div>

  if (cuestionarios.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cuestionarios de Evaluación</h1>
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">🔒</p>
          <p className="text-lg font-semibold text-gray-700">Sin cuestionarios asignados</p>
          <p className="text-gray-400 text-sm mt-2 max-w-sm mx-auto">
            El administrador de CNL Craniley aún no ha asignado un cuestionario a su organización. Recibirá una notificación cuando esté disponible.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuestionarios de Evaluación</h1>
        <p className="text-gray-500 text-sm mt-1">Complete y envíe los cuestionarios asignados a su organización.</p>
      </div>

      {cuestionarios.map(c => {
        const respuestaEnviada = c.respuestas_cuestionario?.length > 0
        const dias = diasRestantes(c.fecha_limite)
        const open = expandId === c.id

        return (
          <div key={c.id} className={`card border-l-4 ${
            c.estado === 'completado' ? 'border-green-400' :
            c.estado === 'vencido'   ? 'border-red-400' :
            dias !== null && dias <= 7 ? 'border-orange-400' : 'border-brand-400'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{c.titulo}</p>
                  <EstadoBadge estado={c.estado} />
                </div>
                {c.descripcion && <p className="text-sm text-gray-600 mt-1">{c.descripcion}</p>}
                {c.fecha_limite && (
                  <p className={`text-xs mt-1.5 ${dias !== null && dias < 0 ? 'text-red-500 font-semibold' : dias !== null && dias <= 7 ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
                    📅 Fecha límite: {new Date(c.fecha_limite).toLocaleDateString('es-CR')}
                    {dias !== null && ` — ${dias < 0 ? 'VENCIDO' : `${dias} días restantes`}`}
                  </p>
                )}
                {respuestaEnviada && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    ✅ Enviado el {new Date(c.respuestas_cuestionario[0].submitted_at).toLocaleDateString('es-CR')}
                  </p>
                )}
              </div>
              <button onClick={() => setExpandId(open ? null : c.id)}
                className="btn-secondary text-xs flex-shrink-0">
                {open ? 'Cerrar' : respuestaEnviada ? 'Ver detalle' : 'Completar'}
              </button>
            </div>

            {open && (
              <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
                {c.archivo_plantilla && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-800">Plantilla disponible</p>
                      <p className="text-xs text-blue-600">{c.nombre_archivo}</p>
                    </div>
                    <button onClick={async () => {
                      const { data } = await supabase.storage.from('cuestionarios').createSignedUrl(c.archivo_plantilla, 60)
                      if (data?.signedUrl) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = c.nombre_archivo; a.click() }
                    }} className="btn-secondary text-xs">📥 Descargar plantilla</button>
                  </div>
                )}

                {!respuestaEnviada && c.estado !== 'completado' && c.estado !== 'vencido' && (
                  <div className="space-y-3">
                    <div>
                      <label className="label">Subir respuesta completada (Excel u otro)</label>
                      <input type="file" accept=".xlsx,.xls,.csv,.pdf,.docx"
                        onChange={e => setArchivo(a => ({ ...a, [c.id]: e.target.files[0] }))}
                        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
                    </div>
                    <div>
                      <label className="label">Notas adicionales (opcional)</label>
                      <textarea className="input resize-none" rows={2}
                        value={notas[c.id] || ''}
                        onChange={e => setNotas(n => ({ ...n, [c.id]: e.target.value }))}
                        placeholder="Comentarios o aclaraciones..." />
                    </div>
                    {msg[c.id] && (
                      <div className={`text-sm rounded-lg px-3 py-2 ${msg[c.id].tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        {msg[c.id].tipo === 'ok' ? '✅' : '⚠'} {msg[c.id].texto}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button onClick={() => handleEnviar(c.id)} disabled={submitting[c.id]}
                        className="btn-primary">
                        {submitting[c.id] ? 'Enviando…' : '📤 Enviar respuesta'}
                      </button>
                    </div>
                  </div>
                )}

                {(respuestaEnviada || c.estado === 'completado') && !submitting[c.id] && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    ✅ Su respuesta ha sido enviada. El administrador revisará y actualizará el estado.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Cuestionarios() {
  const { isSuperAdmin, isAdmin } = useAuth()
  const [tenants, setTenants] = useState([])

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  if (isSuperAdmin || isAdmin) {
    return (
      <div className="p-6 max-w-5xl">
        <VistaSuperAdmin tenants={tenants} />
      </div>
    )
  }

  return <VistaUsuario />
}
