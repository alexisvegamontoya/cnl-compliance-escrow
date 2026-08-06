import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'

const TIPOS = ['reglamento', 'politica', 'procedimiento', 'guia', 'circular', 'documento']
const TIPO_ICON = {
  reglamento: '📋', politica: '📜', procedimiento: '📝',
  guia: '📚', circular: '🔔', documento: '📄',
}
const TIPO_COLOR = {
  reglamento:  'bg-red-100 text-red-700',
  politica:    'bg-brand-100 text-brand-700',
  procedimiento:'bg-blue-100 text-blue-700',
  guia:        'bg-green-100 text-green-700',
  circular:    'bg-yellow-100 text-yellow-700',
  documento:   'bg-gray-100 text-gray-600',
}

const EMPTY = { nombre: '', descripcion: '', tipo: 'documento', version: '', fecha_vigencia: '', fecha_aprobacion_jd: '' }

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function Normativa() {
  const { tenant, profile, isAdmin, isSuperAdmin } = useAuth()
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [archivo, setArchivo]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const fileRef = useRef(null)

  // Cargar normativa queda abierto a cualquier usuario del sujeto obligado;
  // eliminar sigue reservado a administradores porque es destructivo.
  const puedeSubir     = !!tenant || isSuperAdmin
  const puedeEliminar  = isAdmin || isSuperAdmin
  const [tenants, setTenants]         = useState([])
  const [tenantIdSubir, setTenantIdSubir] = useState(tenant?.id || '')
  const [tenantIdFiltro, setTenantIdFiltro] = useState('')

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  const load = useCallback(async () => {
    if (!tenant && !isSuperAdmin) return
    setLoading(true)
    let query = supabase.from('normativa').select('*, tenants(nombre)').eq('activo', true).order('created_at', { ascending: false })
    if (!isSuperAdmin && tenant) {
      query = query.eq('tenant_id', tenant.id)
    } else if (isSuperAdmin && tenantIdFiltro) {
      query = query.eq('tenant_id', tenantIdFiltro)
    }
    const { data } = await query
    setDocs(data || [])
    setLoading(false)
  }, [tenant, isSuperAdmin, tenantIdFiltro])

  useEffect(() => { load() }, [load])

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }
  function cancelar() { setForm(EMPTY); setArchivo(null); setShowForm(false); setError(''); if (fileRef.current) fileRef.current.value = '' }

  async function guardar(e) {
    e.preventDefault()
    if (!archivo) { setError('Debe seleccionar un archivo.'); return }
    setSaving(true)
    setError('')
    try {
      // Determinar tenant destino
      const targetTenantId = isSuperAdmin ? tenantIdSubir : tenant?.id
      if (!targetTenantId) throw new Error('Seleccione el sujeto obligado.')

      // Subir archivo a Supabase Storage
      const ext = archivo.name.split('.').pop()
      const path = `${targetTenantId}/${Date.now()}_${archivo.name.replace(/\s+/g, '_')}`
      const { error: uploadError } = await supabase.storage
        .from('normativa')
        .upload(path, archivo, { contentType: archivo.type, upsert: false })
      if (uploadError) throw uploadError

      // Guardar metadatos en BD
      const { error: dbError } = await supabase.from('normativa').insert({
        tenant_id: targetTenantId,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        tipo: form.tipo,
        version: form.version || null,
        fecha_vigencia: form.fecha_vigencia || null,
        fecha_aprobacion_jd: form.fecha_aprobacion_jd || null,
        url_archivo: path,
        nombre_archivo: archivo.name,
        tamano_bytes: archivo.size,
        uploaded_by: profile?.id,
      })
      if (dbError) throw dbError

      cancelar()
      load()
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setSaving(false)
    }
  }

  async function descargar(doc) {
    const { data, error: err } = await supabase.storage
      .from('normativa')
      .createSignedUrl(doc.url_archivo, 60 * 5) // URL válida por 5 minutos
    if (err) { alert('Error al obtener el archivo: ' + err.message); return }
    window.open(data.signedUrl, '_blank')
  }

  async function eliminar(doc) {
    if (!confirm('¿Eliminar este documento?')) return
    await supabase.storage.from('normativa').remove([doc.url_archivo])
    await supabase.from('normativa').update({ activo: false }).eq('id', doc.id)
    load()
  }

  const filtrados = docs.filter(d => {
    const matchTipo = !filtroTipo || d.tipo === filtroTipo
    const matchBusq = !busqueda || d.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchTipo && matchBusq
  })

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Normativa Interna</h1>
          <p className="text-gray-500 text-sm mt-1">Documentos normativos — {tenant?.nombre}</p>
        </div>
        {puedeSubir && (
          <button className="btn-primary" onClick={() => { cancelar(); setShowForm(s => !s) }}>
            {showForm ? '✕ Cancelar' : '+ Subir documento'}
          </button>
        )}
      </div>

      {/* Formulario de carga */}
      {showForm && puedeSubir && (
        <form onSubmit={guardar} className="card space-y-4">
          <h3 className="font-semibold text-gray-900">Nuevo documento normativo</h3>
          <ErrorBanner error={error} onClose={() => setError(null)} />

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre del documento *</label>
              <input className="input-field" required placeholder="Ej: Política de Debida Diligencia 2024"
                value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo de documento *</label>
              <select className="input-field" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Versión</label>
              <input className="input-field" placeholder="Ej: v2.1"
                value={form.version} onChange={e => set('version', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha de vigencia</label>
              <input type="date" className="input-field"
                value={form.fecha_vigencia} onChange={e => set('fecha_vigencia', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha de aprobación — Junta Directiva</label>
              <input type="date" className="input-field"
                value={form.fecha_aprobacion_jd} onChange={e => set('fecha_aprobacion_jd', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Descripción breve</label>
              <input className="input-field" placeholder="Resumen del contenido"
                value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
            </div>
            {/* Sujeto obligado — solo superadmin */}
          {isSuperAdmin && (
            <div className="col-span-2">
              <label className="label">Sujeto Obligado *</label>
              <select className="input-field" value={tenantIdSubir} onChange={e => setTenantIdSubir(e.target.value)} required>
                <option value="">— Seleccione el sujeto obligado —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="col-span-2">
              <label className="label">Archivo (PDF, Word o Excel) *</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                onChange={e => setArchivo(e.target.files[0] || null)}
              />
              <p className="text-xs text-gray-400 mt-1">Formatos aceptados: PDF, DOC, DOCX, XLSX, XLS, CSV. Máximo 10 MB.</p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={cancelar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Subiendo…' : 'Subir documento'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <input className="input-field w-56" placeholder="Buscar documento…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {isSuperAdmin && (
          <select className="input-field w-64" value={tenantIdFiltro} onChange={e => setTenantIdFiltro(e.target.value)}>
            <option value="">— Todos los sujetos obligados —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroTipo('')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${!filtroTipo ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            Todos
          </button>
          {TIPOS.map(t => (
            <button key={t}
              onClick={() => setFiltroTipo(filtroTipo === t ? '' : t)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filtroTipo === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de documentos */}
      {loading ? (
        <div className="card py-12 text-center text-gray-400">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          <p className="text-4xl mb-2">📂</p>
          <p>{docs.length === 0 ? 'No hay documentos cargados aún.' : 'Ningún documento coincide con la búsqueda.'}</p>
          {puedeSubir && docs.length === 0 && (
            <button className="mt-3 text-sm text-brand-600 underline" onClick={() => setShowForm(true)}>
              Subir primer documento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtrados.map(doc => (
            <div key={doc.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
              {/* Icono tipo */}
              <div className="text-3xl flex-shrink-0">{TIPO_ICON[doc.tipo]}</div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{doc.nombre}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLOR[doc.tipo]}`}>
                    {doc.tipo.charAt(0).toUpperCase() + doc.tipo.slice(1)}
                  </span>
                  {doc.version && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">{doc.version}</span>
                  )}
                </div>
                {doc.descripcion && <p className="text-sm text-gray-500 mt-0.5">{doc.descripcion}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>📎 {doc.nombre_archivo}</span>
                  {doc.tamano_bytes && <span>{formatBytes(doc.tamano_bytes)}</span>}
                  {doc.fecha_aprobacion_jd && <span>🏛 JD: {new Date(doc.fecha_aprobacion_jd).toLocaleDateString('es-CR')}</span>}
                  {doc.fecha_vigencia && <span>Vigente desde: {doc.fecha_vigencia}</span>}
                  <span>Subido: {new Date(doc.created_at).toLocaleDateString('es-CR')}</span>
                  {isSuperAdmin && doc.tenants?.nombre && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
                      🏢 {doc.tenants.nombre}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => descargar(doc)}
                  className="btn-primary text-xs py-1.5 px-4">
                  ⬇ Descargar
                </button>
                {puedeEliminar && (
                  <button
                    onClick={() => eliminar(doc)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium">
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
