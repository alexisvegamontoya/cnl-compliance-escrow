// ============================================================
// Recolección KYC — lado del oficial (Fase A/B)
// Crea solicitudes de recolección (cliente nuevo o existente), envía el enlace
// al cliente y lista el estado de cada una. El portal del cliente (/portal/:token)
// y la bandeja de revisión llegan en las siguientes fases.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { generarExpedienteKycHTML } from '../utils/kycExpediente'
import { gruposChecklist, contextoCliente } from '../lib/checklistDocumental'

const slug = (s) => 'x_' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

// Columnas del cliente que se pueden llenar desde el portal.
const CLIENTE_COLS = [
  'nombre_cliente', 'primer_apellido', 'segundo_apellido', 'tipo_identificacion', 'numero_identificacion',
  'fecha_nacimiento', 'genero', 'estado_civil', 'profesion_nombre', 'actividad_economica',
  'pais_nacimiento', 'pais_residencia', 'provincia', 'canton', 'direccion_exacta', 'nombre_contacto',
  'telefono', 'correo_electronico', 'proposito_relacion', 'origen_fondos', 'ingreso_mensual_est',
  'nombre_empresa', 'cedula_juridica', 'pais_constitucion', 'fecha_constitucion',
]
const DOC_NO_CHECKLIST = (id) => id === 'kyc_firmado' || String(id).startsWith('machote_')

const ESTADO = {
  enviada:   { label: 'Enviada',    clase: 'bg-blue-50 text-blue-700' },
  en_proceso:{ label: 'En proceso', clase: 'bg-amber-50 text-amber-700' },
  recibida:  { label: 'Recibida',   clase: 'bg-violet-50 text-violet-700' },
  aprobada:  { label: 'Aprobada',   clase: 'bg-green-50 text-green-700' },
  rechazada: { label: 'Rechazada',  clase: 'bg-red-50 text-red-700' },
}

function fecha(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

export default function RecoleccionKYC() {
  const { tenant, session } = useAuth()
  const [solicitudes, setSolicitudes] = useState([])
  const [clientes, setClientes]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [copiado, setCopiado]         = useState(null)

  // Formulario de nueva solicitud
  const [tipoPersona, setTipoPersona] = useState('fisica')
  const [modo, setModo]               = useState('nuevo') // nuevo | existente
  const [clienteId, setClienteId]     = useState('')
  const [correo, setCorreo]           = useState('')
  const [nombre, setNombre]           = useState('')
  const [guardando, setGuardando]     = useState(false)
  // Personalización: preguntas y documentos extra que agrega el oficial
  const [preguntasExtra, setPreguntasExtra]   = useState([])
  const [documentosExtra, setDocumentosExtra] = useState([])
  const [nuevaPregunta, setNuevaPregunta]     = useState('')
  const [nuevoDoc, setNuevoDoc]               = useState('')
  const [nuevoDocReq, setNuevoDocReq]         = useState(true)

  // Revisión / bandeja
  const [revisar, setRevisar]         = useState(null)   // solicitud en revisión
  const [docsRev, setDocsRev]         = useState([])
  const [accion, setAccion]           = useState('')     // '' | 'aprobando' | 'rechazando'
  const [msgRev, setMsgRev]           = useState('')

  const cargar = useCallback(async () => {
    if (!tenant?.id) { setLoading(false); return }
    setLoading(true); setError('')
    const [s, c] = await Promise.all([
      supabase.from('solicitudes_kyc').select('*').eq('tenant_id', tenant.id).order('creado_en', { ascending: false }),
      supabase.from('clientes').select('id, nombre_cliente, primer_apellido, nombre_empresa, correo_electronico, tipo_persona')
        .eq('tenant_id', tenant.id).order('id', { ascending: false }),
    ])
    if (s.error) { setError(s.error.message); setLoading(false); return }
    setSolicitudes(s.data || [])
    setClientes(c.data || [])
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => { cargar() }, [cargar])

  const nombreCliente = (c) => c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim() || '(sin nombre)'
  const enlacePortal = (token) => `${window.location.origin}/portal/${token}`

  function elegirExistente(id) {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    if (c) {
      setNombre(nombreCliente(c))
      setCorreo(c.correo_electronico || '')
      setTipoPersona(c.tipo_persona === 'juridica' ? 'juridica' : 'fisica')
    }
  }

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!correo.trim()) { setError('Ingresá el correo del cliente.'); return }
    if (modo === 'existente' && !clienteId) { setError('Elegí el cliente existente a actualizar.'); return }
    setGuardando(true)
    // Sector para secciones extra (facilidades crediticias → machote CIC, plan de inversión…)
    const sector = /cr[eé]dit|financ|prestamist|ahorro|cooperativ/i.test(tenant?.actividad_apnfd || '') ? 'credito' : null
    const { data, error } = await supabase.from('solicitudes_kyc').insert({
      tenant_id:      tenant.id,
      tipo_persona:   tipoPersona,
      cliente_id:     modo === 'existente' ? clienteId : null,
      correo_cliente: correo.trim(),
      nombre_cliente: nombre.trim() || null,
      sector,
      preguntas_extra:  preguntasExtra,
      documentos_extra: documentosExtra,
      estado:         'enviada',
      creado_por:     session?.user?.id,
      enviada_en:     new Date().toISOString(),
    }).select('*').single()
    setGuardando(false)
    if (error) { setError(error.message); return }
    // Reset y refrescar
    setShowForm(false); setTipoPersona('fisica'); setModo('nuevo'); setClienteId(''); setCorreo(''); setNombre('')
    setPreguntasExtra([]); setDocumentosExtra([])
    setSolicitudes(prev => [data, ...prev])
    // Enviar el correo al cliente automáticamente (Resend)
    enviarCorreo(data)
  }

  // Envía el enlace por correo (Resend, vía edge function). Si falla, abre el correo del oficial.
  async function enviarCorreo(sol) {
    setError('')
    try {
      const { error } = await supabase.functions.invoke('enviar-correo-kyc', {
        body: { token: sol.token, link: enlacePortal(sol.token) },
      })
      if (error) throw error
      setCopiado('mail-' + sol.id); setTimeout(() => setCopiado(null), 2500)
    } catch {
      abrirMailto(sol) // respaldo
    }
  }

  function abrirMailto(sol) {
    const link = enlacePortal(sol.token)
    const asunto = encodeURIComponent(`Complete su información — ${tenant?.nombre || 'Debida diligencia'}`)
    const cuerpo = encodeURIComponent(
      `Estimado/a ${sol.nombre_cliente || 'cliente'},\n\n` +
      `Para completar su proceso de debida diligencia, ingrese al siguiente enlace seguro:\n\n${link}\n\n` +
      `El enlace vence el ${fecha(sol.vence_en)}.\n\nSaludos,\n${tenant?.nombre || 'CNL Craniley'}`
    )
    window.open(`mailto:${sol.correo_cliente}?subject=${asunto}&body=${cuerpo}`, '_blank')
  }

  async function copiar(sol) {
    try { await navigator.clipboard.writeText(enlacePortal(sol.token)); setCopiado(sol.id); setTimeout(() => setCopiado(null), 1500) }
    catch { /* ignore */ }
  }

  // ── Revisión / volcado al gestor ──
  async function abrirRevision(sol) {
    setRevisar(sol); setMsgRev(''); setDocsRev([])
    const { data } = await supabase.from('solicitudes_kyc_documentos')
      .select('*').eq('solicitud_id', sol.id).order('subido_en')
    setDocsRev(data || [])
  }

  async function descargarDoc(doc) {
    const { data, error } = await supabase.storage.from('kyc').createSignedUrl(doc.archivo_path, 300)
    if (error || !data?.signedUrl) { setMsgRev('No se pudo generar el enlace del documento.'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function aprobar() {
    if (!revisar) return
    setAccion('aprobando'); setMsgRev('')
    try {
      const d = revisar.datos || {}
      const payload = { tenant_id: tenant.id, tipo_persona: revisar.tipo_persona }
      CLIENTE_COLS.forEach(c => { if (d[c] !== undefined && d[c] !== '' && d[c] !== null) payload[c] = d[c] })
      if (revisar.tipo_persona === 'juridica' && !payload.numero_identificacion && d.cedula_juridica) payload.numero_identificacion = d.cedula_juridica
      // checklist con lo recibido
      const checklist = {}
      docsRev.forEach(doc => { if (!DOC_NO_CHECKLIST(doc.doc_id)) checklist[doc.doc_id] = { estado: 'disponible', nota: 'Recibido por portal KYC' } })
      payload.checklist_documental = checklist
      if (d.credito_monto || d.credito_plan_inversion || d.credito_garantia) {
        payload.notas = `[Solicitud de crédito] Monto: ${d.credito_monto || '—'} · Garantía: ${d.credito_garantia || '—'} · Plan de inversión: ${d.credito_plan_inversion || '—'}`
      }
      // crear o actualizar cliente
      let clienteId = revisar.cliente_id
      if (clienteId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', clienteId)
        if (error) throw error
      } else {
        const { data: nuevo, error } = await supabase.from('clientes').insert(payload).select('id').single()
        if (error) throw error
        clienteId = nuevo.id
      }
      // representante legal (jurídica)
      if (revisar.tipo_persona === 'juridica' && d.rep_nombre) {
        await supabase.from('clientes_personas_relacionadas').insert({
          tenant_id: tenant.id, cliente_id: clienteId, tipo_relacion: 'representante_legal',
          tipo_entidad: 'persona_fisica', nombre: d.rep_nombre, identificacion: d.rep_identificacion || null,
          telefono: d.rep_telefono || null, correo: d.rep_correo || null, orden: 0, activo: true,
        })
      }
      await supabase.from('solicitudes_kyc').update({ estado: 'aprobada', cliente_id: clienteId }).eq('id', revisar.id)
      setSolicitudes(prev => prev.map(s => s.id === revisar.id ? { ...s, estado: 'aprobada', cliente_id: clienteId } : s))
      setRevisar(null)
    } catch (err) { setMsgRev('No se pudo aprobar: ' + err.message) }
    setAccion('')
  }

  async function rechazar() {
    if (!revisar) return
    setAccion('rechazando')
    await supabase.from('solicitudes_kyc').update({ estado: 'rechazada' }).eq('id', revisar.id)
    setSolicitudes(prev => prev.map(s => s.id === revisar.id ? { ...s, estado: 'rechazada' } : s))
    setAccion(''); setRevisar(null)
  }

  // Informe (PDF independiente) con toda la información + índice de documentos.
  function descargarExpediente() {
    setMsgRev('')
    const html = generarExpedienteKycHTML({ tenant: tenant?.nombre, solicitud: revisar, anexos: docsRev })
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { setMsgRev('Permita ventanas emergentes para el expediente.'); return }
    w.document.write(html); w.document.close()
  }

  // Descarga cada documento como archivo independiente (uno por uno).
  async function descargarTodosDocs() {
    setMsgRev('')
    for (const doc of docsRev) {
      const { data } = await supabase.storage.from('kyc').createSignedUrl(doc.archivo_path, 600, { download: doc.nombre_archivo || true })
      if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); await new Promise(r => setTimeout(r, 400)) }
    }
  }

  if (loading) return <div className="p-6 text-gray-500">Cargando…</div>

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recolección KYC</h1>
          <p className="text-gray-500 text-sm mt-1">Enviá al cliente un enlace para que complete su información de debida diligencia y suba sus documentos.</p>
        </div>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva solicitud</button>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={crear} className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Nueva solicitud</h2>

          <div className="flex gap-2">
            {[['fisica', '👤 Persona Física'], ['juridica', '🏢 Persona Jurídica']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTipoPersona(v)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${tipoPersona === v ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={modo === 'nuevo'} onChange={() => { setModo('nuevo'); setClienteId('') }} />
              Cliente nuevo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={modo === 'existente'} onChange={() => setModo('existente')} />
              Actualizar cliente existente
            </label>
          </div>

          {modo === 'existente' && (
            <div>
              <label className="label text-xs">Cliente a actualizar</label>
              <select className="input text-sm" value={clienteId} onChange={e => elegirExistente(e.target.value)}>
                <option value="">— Seleccione el cliente —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Nombre del cliente</label>
              <input className="input text-sm" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre o razón social" />
            </div>
            <div>
              <label className="label text-xs">Correo del cliente *</label>
              <input className="input text-sm" type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </div>

          {/* Revisión del checklist + preguntas/documentos extra */}
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-700 select-none">
              Revisar checklist y agregar preguntas/documentos (opcional)
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Documentos que se pedirán (checklist {tipoPersona === 'juridica' ? 'jurídica' : 'física'})</p>
                <ul className="text-xs text-gray-500 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 max-h-32 overflow-y-auto">
                  {gruposChecklist(contextoCliente({ tipo_persona: tipoPersona })).flatMap(g => g.items).map(it => (
                    <li key={it.id}>• {it.label}{it.required ? ' *' : ''}</li>
                  ))}
                </ul>
              </div>

              {/* Preguntas extra */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Preguntas adicionales</p>
                {preguntasExtra.map((p, i) => (
                  <div key={p.clave} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1 mb-1">
                    <span>{p.label}</span>
                    <button type="button" onClick={() => setPreguntasExtra(a => a.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input className="input text-sm flex-1" value={nuevaPregunta} onChange={e => setNuevaPregunta(e.target.value)} placeholder="Ej. ¿Es usted PEP o familiar de uno?" />
                  <button type="button" onClick={() => { if (nuevaPregunta.trim()) { setPreguntasExtra(a => [...a, { clave: slug(nuevaPregunta), label: nuevaPregunta.trim() }]); setNuevaPregunta('') } }}
                    className="btn-secondary text-sm px-3">Agregar</button>
                </div>
              </div>

              {/* Documentos extra */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Documentos adicionales</p>
                {documentosExtra.map((d, i) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border border-gray-100 rounded px-2 py-1 mb-1">
                    <span>{d.label}{d.required ? ' *' : ''}</span>
                    <button type="button" onClick={() => setDocumentosExtra(a => a.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">×</button>
                  </div>
                ))}
                <div className="flex gap-2 items-center">
                  <input className="input text-sm flex-1" value={nuevoDoc} onChange={e => setNuevoDoc(e.target.value)} placeholder="Ej. Constancia salarial" />
                  <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={nuevoDocReq} onChange={e => setNuevoDocReq(e.target.checked)} /> Obligatorio</label>
                  <button type="button" onClick={() => { if (nuevoDoc.trim()) { setDocumentosExtra(a => [...a, { id: slug(nuevoDoc), label: nuevoDoc.trim(), required: nuevoDocReq }]); setNuevoDoc('') } }}
                    className="btn-secondary text-sm px-3">Agregar</button>
                </div>
              </div>
            </div>
          </details>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
              {guardando ? 'Creando…' : 'Crear y enviar al cliente'}
            </button>
          </div>
        </form>
      )}

      {/* Listado */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-2 font-semibold">Cliente</th>
              <th className="px-4 py-2 font-semibold">Tipo</th>
              <th className="px-4 py-2 font-semibold">Correo</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Enviada</th>
              <th className="px-4 py-2 font-semibold text-right">Enlace</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Todavía no hay solicitudes. Creá la primera.</td></tr>
            ) : solicitudes.map(s => {
              const est = ESTADO[s.estado] || ESTADO.enviada
              return (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{s.nombre_cliente || '—'}</td>
                  <td className="px-4 py-2">{s.tipo_persona === 'juridica' ? 'Jurídica' : 'Física'}</td>
                  <td className="px-4 py-2 text-gray-500">{s.correo_cliente}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${est.clase}`}>{est.label}</span></td>
                  <td className="px-4 py-2 text-gray-500">{fecha(s.enviada_en || s.creado_en)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      {(s.estado === 'recibida' || s.estado === 'aprobada' || s.estado === 'rechazada') ? (
                        <button onClick={() => abrirRevision(s)}
                          className={`text-xs font-semibold ${s.estado === 'recibida' ? 'text-violet-700 hover:underline' : 'text-gray-500 hover:text-brand-700'}`}>
                          {s.estado === 'recibida' ? '🔎 Revisar' : 'Ver'}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => copiar(s)} className="text-xs text-brand-600 hover:underline">
                            {copiado === s.id ? '¡Copiado!' : 'Copiar enlace'}
                          </button>
                          <button onClick={() => enviarCorreo(s)} className="text-xs text-gray-500 hover:text-brand-700">
                            {copiado === 'mail-' + s.id ? '✓ Enviado' : 'Reenviar correo'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Al crear una solicitud se abre tu correo con el enlace listo para enviar al cliente. Cuando el cliente envía su
        información, la solicitud pasa a <strong>Recibida</strong> y podés revisarla y aprobarla para volcar al gestor.
      </p>

      {/* Modal de revisión */}
      {revisar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => accion === '' && setRevisar(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{revisar.nombre_cliente || 'Solicitud'}</h2>
                <p className="text-xs text-gray-500">{revisar.tipo_persona === 'juridica' ? 'Persona jurídica' : 'Persona física'} · {revisar.correo_cliente}</p>
              </div>
              <button onClick={() => setRevisar(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
              {msgRev && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-3 py-2">{msgRev}</div>}

              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Información recibida</p>
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(revisar.datos || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-50">
                        <td className="py-1.5 pr-3 text-gray-500 align-top w-2/5">{k}</td>
                        <td className="py-1.5 font-medium text-gray-800">{String(v)}</td>
                      </tr>
                    ))}
                    {Object.keys(revisar.datos || {}).length === 0 && <tr><td className="py-2 text-gray-400 text-sm">Sin datos.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Documentos ({docsRev.length})</p>
                {docsRev.length === 0 ? <p className="text-sm text-gray-400">Sin documentos.</p> : (
                  <div className="space-y-1">
                    {docsRev.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm">
                        <span className="text-gray-700">📄 {doc.etiqueta || doc.doc_id} <span className="text-gray-400">· {doc.nombre_archivo}</span></span>
                        <button onClick={() => descargarDoc(doc)} className="text-xs text-brand-600 hover:underline">Descargar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 flex-wrap">
              <div className="flex gap-2">
                <button onClick={descargarExpediente} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                  📑 Informe (PDF)
                </button>
                {docsRev.length > 0 && (
                  <button onClick={descargarTodosDocs} className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    ⬇ Documentos
                  </button>
                )}
              </div>
              {revisar.estado === 'recibida' ? (
                <div className="flex gap-2">
                  <button onClick={rechazar} disabled={accion !== ''}
                    className="text-sm px-4 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {accion === 'rechazando' ? '…' : 'Rechazar'}
                  </button>
                  <button onClick={aprobar} disabled={accion !== ''}
                    className="btn-primary text-sm disabled:opacity-50">
                    {accion === 'aprobando' ? 'Aprobando…' : '✓ Aprobar y volcar al gestor'}
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-500">Estado: {revisar.estado}{revisar.cliente_id ? ' · vinculado al gestor' : ''}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
