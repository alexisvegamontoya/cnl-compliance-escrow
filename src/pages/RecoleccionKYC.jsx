// ============================================================
// Recolección KYC — lado del oficial (Fase A/B)
// Crea solicitudes de recolección (cliente nuevo o existente), envía el enlace
// al cliente y lista el estado de cada una. El portal del cliente (/portal/:token)
// y la bandeja de revisión llegan en las siguientes fases.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { generarExpedienteKycHTML } from '../utils/kycExpediente'
import { docsKyc } from '../lib/kycChecklist'
import { tamizarPersona, ETIQUETA_LISTAS } from '../lib/tamizaje'
import { calificarCliente, persistirCalificacion } from '../lib/calificacionAuto'
import { ACTIVIDADES_PROFESIONES } from '../lib/metodologiaRiesgo'
import { logAudit } from '../lib/auditLog'

const slug = (s) => 'x_' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

// Columnas del cliente que se pueden llenar desde el portal.
const CLIENTE_COLS = [
  'nombre_cliente', 'primer_apellido', 'segundo_apellido', 'tipo_identificacion', 'numero_identificacion',
  'venc_identificacion',
  'fecha_nacimiento', 'genero', 'estado_civil', 'profesion_nombre', 'actividad_economica',
  'pais_nacimiento', 'pais_residencia', 'provincia', 'canton', 'distrito', 'direccion_exacta', 'nombre_contacto',
  'telefono', 'correo_electronico', 'proposito_relacion', 'origen_fondos', 'ingreso_mensual_est',
  'nombre_empresa', 'cedula_juridica', 'pais_constitucion', 'fecha_constitucion',
  'pagina_web', 'distrito', 'paises_ingresos', 'ccss_estado', 'sugef_estado',
]
const DOC_NO_CHECKLIST = (id) => id === 'kyc_firmado' || String(id).startsWith('machote_')

// Claves de datos jurídica que son estructuras (arreglos) — se muestran aparte, no en la tabla plana.
const ESTRUCTURA_KEYS = ['representantes', 'junta', 'socios', 'socios_empresas']
const TID_LBL = { cedula: 'Cédula', dimex: 'DIMEX', pasaporte: 'Pasaporte' }

// Render legible de las estructuras jurídicas (representantes, junta, socios) en el modal de revisión.
function bloquesEstructura(d) {
  const reps = Array.isArray(d.representantes) ? d.representantes.filter(r => r && r.nombre) : []
  const junta = Array.isArray(d.junta) ? d.junta.filter(m => m && m.nombre) : []
  const socios = Array.isArray(d.socios) ? d.socios.filter(s => s && s.nombre) : []
  const sociosEmp = Array.isArray(d.socios_empresas) ? d.socios_empresas.filter(s => s && s.nombre) : []
  if (!reps.length && !junta.length && !socios.length && !sociosEmp.length) return null
  const H = ({ children }) => <p className="text-[11px] font-semibold text-gray-500 uppercase mt-3 mb-1">{children}</p>
  return (
    <div className="mt-2 space-y-1">
      {reps.map((r, i) => (
        <div key={'r' + i} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs">
          <H>Representante legal {reps.length > 1 ? i + 1 : ''}</H>
          <div className="font-semibold text-gray-800">{r.nombre} {r.es_pep === 'si' && <span className="text-amber-600">· PEP</span>}</div>
          <div className="text-gray-500">{TID_LBL[r.tipo_id] || r.tipo_id} {r.num_id} · {r.nacionalidad} · {r.ocupacion}</div>
          {(r.correo || r.telefono) && <div className="text-gray-500">{r.correo} {r.telefono}</div>}
        </div>
      ))}
      {junta.length > 0 && (
        <div><H>Junta directiva</H>
          {junta.map((m, i) => <div key={'j' + i} className="text-xs text-gray-700">• {m.nombre} — {m.cedula} — <span className="text-gray-500">{m.cargo}</span></div>)}
        </div>
      )}
      {socios.length > 0 && (
        <div><H>Socios / accionistas (≥10%)</H>
          {socios.map((s, i) => <div key={'s' + i} className="text-xs text-gray-700">• {s.nombre} — {s.identificacion} — <span className="text-gray-500">{s.participacion}%</span></div>)}
        </div>
      )}
      {sociosEmp.length > 0 && (
        <div><H>Socios que son empresas</H>
          {sociosEmp.map((s, i) => (
            <div key={'se' + i} className="text-xs text-gray-700">• {s.nombre} — {s.identificacion} — <span className="text-gray-500">{s.participacion}%</span>
              {s.rep_nombre && <span className="text-gray-500"> · Rep: {s.rep_nombre}</span>}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const ESTADO = {
  enviada:   { label: 'Enviada',    clase: 'bg-blue-50 text-blue-700' },
  en_proceso:{ label: 'En proceso', clase: 'bg-amber-50 text-amber-700' },
  recibida:  { label: 'Recibida',   clase: 'bg-violet-50 text-violet-700' },
  aprobada:  { label: 'Aprobada',   clase: 'bg-green-50 text-green-700' },
  rechazada: { label: 'Devuelta',   clase: 'bg-amber-50 text-amber-700' },
  cancelada: { label: 'Cancelada',  clase: 'bg-gray-100 text-gray-500' },
}
const FILTROS = [
  ['todas', 'Todas'], ['recibida', 'Por revisar'], ['enviada', 'Enviadas'],
  ['en_proceso', 'En proceso'], ['aprobada', 'Aprobadas'], ['rechazada', 'Devueltas'], ['cancelada', 'Canceladas'],
]

function fecha(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

export default function RecoleccionKYC() {
  const { tenant, session, isSuperAdmin } = useAuth()
  // El superadmin puede elegir de qué sujeto obligado se envía la solicitud.
  const [soList, setSoList] = useState([])
  const [soId, setSoId]     = useState('')
  const soActivo = isSuperAdmin ? (soId || tenant?.id) : tenant?.id
  const soActividad = isSuperAdmin
    ? (soList.find(t => t.id === soActivo)?.actividad_apnfd || '')
    : (tenant?.actividad_apnfd || '')
  const soNombre = isSuperAdmin
    ? (soList.find(t => t.id === soActivo)?.nombre || tenant?.nombre)
    : tenant?.nombre
  const esCreditoTenant = /cr[eé]dit|financ|prestamist|ahorro|cooperativ/i.test(soActividad || '')

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
  const [excluidos, setExcluidos]             = useState([]) // ids del checklist que el oficial quita
  const [nuevaPregunta, setNuevaPregunta]     = useState('')
  const [nuevoDoc, setNuevoDoc]               = useState('')
  const [nuevoDocReq, setNuevoDocReq]         = useState(true)
  // Facilidades crediticias: documentos opcionales que el oficial puede solicitar
  const [pedirAvaluo, setPedirAvaluo]         = useState(false)
  const [pedirFlujo, setPedirFlujo]           = useState(false)

  // Revisión / bandeja
  const [revisar, setRevisar]         = useState(null)   // solicitud en revisión
  const [docsRev, setDocsRev]         = useState([])
  const [accion, setAccion]           = useState('')     // '' | 'aprobando' | 'rechazando'
  const [msgRev, setMsgRev]           = useState('')
  const [alertaListas, setAlertaListas] = useState(null) // { cliente, estado, n } tras tamizaje al aprobar
  const [filtro, setFiltro]           = useState('todas')
  const [editando, setEditando]       = useState(false)
  const [guardandoEd, setGuardandoEd] = useState(false)

  const cargar = useCallback(async () => {
    if (!soActivo) { setLoading(false); return }
    setLoading(true); setError('')
    const [s, c] = await Promise.all([
      supabase.from('solicitudes_kyc').select('*').eq('tenant_id', soActivo).order('creado_en', { ascending: false }),
      supabase.from('clientes').select('id, nombre_cliente, primer_apellido, nombre_empresa, correo_electronico, tipo_persona')
        .eq('tenant_id', soActivo).order('id', { ascending: false }),
    ])
    if (s.error) { setError(s.error.message); setLoading(false); return }
    setSolicitudes(s.data || [])
    setClientes(c.data || [])
    setLoading(false)
  }, [soActivo])

  useEffect(() => { cargar() }, [cargar])

  // Superadmin: cargar la lista de sujetos obligados para el selector.
  useEffect(() => {
    if (!isSuperAdmin) return
    tenantsDeLaApp('id, nombre, actividad_apnfd, logo_url').then(({ data }) => {
      setSoList(data || [])
      setSoId(prev => prev || tenant?.id || (data?.[0]?.id ?? ''))
    })
  }, [isSuperAdmin, tenant?.id])

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
    if (!soActivo) { setError('Seleccione el sujeto obligado.'); return }
    setGuardando(true)
    // Sector para secciones extra (facilidades crediticias → machote CIC, plan de inversión…)
    const sector = /cr[eé]dit|financ|prestamist|ahorro|cooperativ/i.test(soActividad || '') ? 'credito' : null
    const { data, error } = await supabase.from('solicitudes_kyc').insert({
      tenant_id:      soActivo,
      tipo_persona:   tipoPersona,
      cliente_id:     modo === 'existente' ? clienteId : null,
      correo_cliente: correo.trim(),
      nombre_cliente: nombre.trim() || null,
      sector,
      preguntas_extra:  preguntasExtra,
      documentos_excluidos: excluidos,
      documentos_extra: [
        ...documentosExtra,
        ...(esCreditoTenant && pedirAvaluo ? [{ id: 'credito_avaluo', label: 'Avalúo', required: false }] : []),
        ...(esCreditoTenant && pedirFlujo ? [{ id: 'credito_flujo_caja', label: 'Flujo de caja proyectado a un año', required: false }] : []),
      ],
      estado:         'enviada',
      creado_por:     session?.user?.id,
      correo_oficial: session?.user?.email || null,
      enviada_en:     new Date().toISOString(),
      vence_en:       new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('*').single()
    setGuardando(false)
    if (error) { setError(error.message); return }
    // Reset y refrescar
    setShowForm(false); setTipoPersona('fisica'); setModo('nuevo'); setClienteId(''); setCorreo(''); setNombre('')
    setPreguntasExtra([]); setDocumentosExtra([]); setExcluidos([]); setPedirAvaluo(false); setPedirFlujo(false)
    setSolicitudes(prev => [data, ...prev])
    logAudit({ accion: 'crear', tabla: 'solicitudes_kyc', registro_id: data.id, descripcion: `Solicitud KYC creada: ${data.nombre_cliente || correo.trim()}`, tenant_id: soActivo })
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
    setRevisar(sol); setMsgRev(''); setDocsRev([]); setEditando(false)
    const { data } = await supabase.from('solicitudes_kyc_documentos')
      .select('*').eq('solicitud_id', sol.id).order('subido_en')
    setDocsRev(data || [])
  }

  // Editar antes de aprobar: corregir un dato del cliente y guardarlo en la solicitud.
  const setDatoRev = (k, v) => setRevisar(r => ({ ...r, datos: { ...(r.datos || {}), [k]: v } }))
  async function guardarEdicion() {
    if (!revisar) return
    setGuardandoEd(true); setMsgRev('')
    const { error } = await supabase.from('solicitudes_kyc').update({ datos: revisar.datos }).eq('id', revisar.id)
    setGuardandoEd(false)
    if (error) { setMsgRev('No se pudo guardar: ' + error.message); return }
    setSolicitudes(prev => prev.map(s => s.id === revisar.id ? { ...s, datos: revisar.datos } : s))
    setEditando(false)
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
      const esJ = revisar.tipo_persona === 'juridica'
      const tid = revisar.tenant_id  // el cliente pertenece al SO dueño de la solicitud, no al superadmin
      const payload = { tenant_id: tid, tipo_persona: revisar.tipo_persona }
      CLIENTE_COLS.forEach(c => { if (d[c] !== undefined && d[c] !== '' && d[c] !== null) payload[c] = d[c] })
      if (esJ) {
        payload.tipo_identificacion = 2 // cédula jurídica
        if (!payload.numero_identificacion && d.cedula_juridica) payload.numero_identificacion = d.cedula_juridica
      } else {
        // Empresa donde labora (persona física) → columna jsonb
        const emp = {
          nombre_comercial: d.empleador_nombre_comercial, razon_social: d.empleador_razon_social,
          tipo_sociedad: d.empleador_tipo_sociedad, actividad: d.empleador_actividad,
          telefono: d.empleador_telefono, correo: d.empleador_correo, web: d.empleador_web,
          puesto: d.empleador_puesto, antiguedad: d.empleador_antiguedad,
        }
        if (Object.values(emp).some(v => v)) payload.empleador = emp
      }
      // checklist con lo recibido
      const checklist = {}
      docsRev.forEach(doc => { if (!DOC_NO_CHECKLIST(doc.doc_id)) checklist[doc.doc_id] = { estado: 'disponible', nota: 'Recibido por portal KYC' } })
      payload.checklist_documental = checklist
      // Estructura jurídica recibida por el portal
      const reps = Array.isArray(d.representantes) ? d.representantes.filter(r => r && r.nombre) : []
      const junta = Array.isArray(d.junta) ? d.junta.filter(m => m && m.nombre) : []
      const socios = Array.isArray(d.socios) ? d.socios.filter(s => s && s.nombre) : []
      const sociosEmp = Array.isArray(d.socios_empresas) ? d.socios_empresas.filter(s => s && s.nombre) : []
      // PEP: física (d.pep) o jurídica (preguntas de empresa o algún representante)
      payload.pep = (d.pep === 'si' || d.pep_junta === 'si' || d.pep_relacion === 'si' || d.pep_relacionados === 'si' || reps.some(r => r.es_pep === 'si'))
      // Notas con la información adicional recibida por el portal
      const notasPartes = []
      if (d.actividad_descripcion) notasPartes.push(`Actividad: ${d.actividad_descripcion}`)
      if (d.paises_ingresos) notasPartes.push(`Ingresos generados en: ${d.paises_ingresos}`)
      if (d.pep === 'si' && (d.pep_puesto || d.pep_tiempo)) notasPartes.push(`PEP: ${d.pep_puesto || ''}${d.pep_tiempo ? ' — tiempo desde que dejó el cargo: ' + d.pep_tiempo : ''}`)
      if (d.pep_junta === 'si' && d.pep_junta_detalle) notasPartes.push(`PEP (junta/rep/socio): ${d.pep_junta_detalle}`)
      if (d.pep_relacion === 'si' && d.pep_relacion_detalle) notasPartes.push(`Relación con PEP: ${d.pep_relacion_detalle}`)
      // Compatibilidad con solicitudes viejas (campos de texto plano)
      if (typeof d.junta_nombres === 'string' && d.junta_nombres) notasPartes.push(`Junta directiva: ${d.junta_nombres}`)
      if (typeof d.socios_fisicos_nombres === 'string' && d.socios_fisicos_nombres) notasPartes.push(`Socios (físicos): ${d.socios_fisicos_nombres}`)
      if (typeof d.socios_empresas === 'string' && d.socios_empresas) notasPartes.push(`Socios (empresas): ${d.socios_empresas}`)
      if (d.credito_monto || d.credito_plan_desc || d.credito_garantia_tipo) {
        notasPartes.push(`[Crédito] Monto: ${d.credito_monto || '—'} · Plan: ${d.credito_plan_desc || '—'} · Garantía: ${d.credito_garantia_desc || '—'}`)
      }
      if (notasPartes.length) payload.notas = notasPartes.join(' · ')
      // Fecha de vinculación = fecha de aprobación (si no venía)
      if (!payload.fecha_vinculacion) payload.fecha_vinculacion = new Date().toISOString().slice(0, 10)
      // País: la jurídica captura país de constitución; se usa también como ubicación/residencia.
      if (esJ) {
        if (!payload.pais_residencia && d.pais_constitucion) payload.pais_residencia = d.pais_constitucion
        if (!payload.pais_ubicacion && d.pais_constitucion) payload.pais_ubicacion = d.pais_constitucion
      } else if (!payload.pais_ubicacion && d.pais_residencia) {
        payload.pais_ubicacion = d.pais_residencia
      }
      // Enriquecer la actividad para la calificación de riesgo (nombre + valor 1-3)
      const actLabel = (esJ ? d.actividad_economica : (d.profesion_nombre || d.actividad_economica)) || ''
      if (actLabel) {
        const m = ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === actLabel.toLowerCase())
        if (esJ) { payload.actividad_eco_nombre = actLabel; if (m) payload.actividad_eco_valor = m.valor }
        else { payload.profesion_nombre = payload.profesion_nombre || actLabel; if (m) payload.profesion_valor = m.valor }
      }
      // crear o actualizar cliente
      let clienteId = revisar.cliente_id
      // Si no viene vinculado, buscar por cédula: el cliente puede ya existir en el gestor.
      if (!clienteId && payload.numero_identificacion) {
        const { data: existente } = await supabase.from('clientes')
          .select('id').eq('tenant_id', tid).eq('numero_identificacion', payload.numero_identificacion).maybeSingle()
        if (existente) clienteId = existente.id
      }
      if (clienteId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', clienteId)
        if (error) throw error
      } else {
        const { data: nuevo, error } = await supabase.from('clientes').insert(payload).select('id').single()
        if (error) throw error
        clienteId = nuevo.id
      }
      // Volcado de la estructura jurídica → personas relacionadas
      if (esJ) {
        const rel = []
        reps.forEach((r, i) => rel.push({
          tipo_relacion: 'representante_legal', tipo_entidad: 'persona_fisica',
          nombre: r.nombre, identificacion: r.num_id || null, tipo_id: r.tipo_id || null,
          venc_identificacion: r.venc_id || null, nacionalidad: r.nacionalidad || null,
          fecha_nacimiento: r.fecha_nac || null, pais_nacimiento: r.pais_nac || null,
          ocupacion: r.ocupacion || null, estado_civil: r.estado_civil || null, sexo: r.sexo || null,
          correo: r.correo || null, telefono: r.telefono || null, es_pep: r.es_pep === 'si',
          direccion: r.direccion || null, orden: i, activo: true,
        }))
        // Compatibilidad: representante en campos de texto plano (solicitudes viejas)
        if (!reps.length && d.rep_nombre) rel.push({
          tipo_relacion: 'representante_legal', tipo_entidad: 'persona_fisica',
          nombre: d.rep_nombre, identificacion: d.rep_identificacion || null,
          telefono: d.rep_telefono || null, correo: d.rep_correo || null, es_pep: false, orden: 0, activo: true,
        })
        junta.forEach((m, i) => rel.push({
          tipo_relacion: 'junta_directiva', tipo_entidad: 'persona_fisica',
          nombre: m.nombre, identificacion: m.cedula || null, cargo: m.cargo || null, es_pep: false, orden: i, activo: true,
        }))
        socios.forEach((s, i) => rel.push({
          tipo_relacion: 'socio', tipo_entidad: 'persona_fisica',
          nombre: s.nombre, identificacion: s.identificacion || null,
          porcentaje_participacion: s.participacion ? Number(s.participacion) : null, es_pep: false, orden: i, activo: true,
        }))
        sociosEmp.forEach((s, i) => rel.push({
          tipo_relacion: 'socio', tipo_entidad: 'persona_juridica',
          nombre: s.nombre, identificacion: s.identificacion || null,
          porcentaje_participacion: s.participacion ? Number(s.participacion) : null,
          sub_personas: s.rep_nombre ? [{ tipo_relacion: 'representante_legal', nombre: s.rep_nombre }] : [],
          notas: s.socios ? `Socios: ${s.socios}` : null, es_pep: false, orden: i, activo: true,
        }))
        if (rel.length) {
          // Reemplazar la estructura previa (evita duplicar si el cliente ya existía).
          await supabase.from('clientes_personas_relacionadas').delete().eq('cliente_id', clienteId)
          // Normalizar claves: PostgREST rellena con NULL las columnas ausentes en un
          // insert múltiple, y es_pep es NOT NULL. Aseguramos que toda fila la traiga.
          const filas = rel.map(r => ({ es_pep: false, ...r, tenant_id: tid, cliente_id: clienteId }))
          const { error } = await supabase.from('clientes_personas_relacionadas').insert(filas)
          if (error) throw error
        }
      }
      // ── Automatización al aprobar: tamizaje + calificación + DD (no bloquean si fallan) ──
      let alerta = null
      const hoyAuto = new Date().toISOString().slice(0, 10)
      const nombreCli = esJ
        ? (d.nombre_empresa || '')
        : `${d.nombre_cliente || ''} ${d.primer_apellido || ''} ${d.segundo_apellido || ''}`.trim()
      const identCli = esJ ? (d.cedula_juridica || d.numero_identificacion) : d.numero_identificacion
      let estadoListas = null, hayPEP = false, resListas = []
      // 1) Listas internacionales
      try {
        const t = await tamizarPersona(nombreCli, identCli)
        estadoListas = t.estado_listas; hayPEP = t.hayPEP; resListas = t.res
        await supabase.from('clientes').update({
          estado_listas: t.estado_listas, aparece_en_listas: t.hayAlerta,
          pep: payload.pep || t.hayPEP, fecha_consulta_listas: hoyAuto,
        }).eq('id', clienteId)
        if (t.estado_listas !== 'verificado') {
          alerta = { cliente: revisar.nombre_cliente || nombreCli, estado: t.estado_listas, n: t.coincidencias.length }
        }
      } catch { /* el tamizaje no debe impedir la aprobación */ }
      // 2) Calificación de riesgo preliminar
      try {
        const { data: tRow } = await supabase.from('tenants').select('clase_dato').eq('id', tid).maybeSingle()
        const result = calificarCliente({ ...payload, id: clienteId }, {
          claseDato: Number(tRow?.clase_dato) || 0,
          listasNivel: estadoListas,
          tipoPersona: revisar.tipo_persona,
        })
        await persistirCalificacion({ tenantId: tid, clienteId, calificadorId: session?.user?.id, result })
      } catch { /* la calificación no debe impedir la aprobación */ }
      // 3) Expediente de debida diligencia automático
      try {
        const nivelDD = estadoListas === 'alerta' ? 'ALERTA' : estadoListas === 'revisar' ? 'REVISAR' : 'SIN_COINCIDENCIA'
        const participantes = [...reps, ...junta, ...socios, ...sociosEmp]
          .map(p => ({ nombre: p.nombre, identificacion: p.identificacion || p.num_id || p.cedula || null }))
        await supabase.from('expedientes_dd').insert({
          tenant_id: tid, tipo: esJ ? 'J' : 'F',
          datos_cliente: d, participantes,
          resultados_listas: { [nombreCli]: { nivel: nivelDD, esPEP: hayPEP, resultados: resListas } },
          perfil_ia: null,
          justificacion_manual: 'Expediente generado automáticamente al aprobar la recolección KYC.',
          checklist, estado: 'completado', created_by: session?.user?.id,
        })
        await supabase.from('clientes').update({ estado_dd: 'completado', fecha_debida_diligencia: hoyAuto }).eq('id', clienteId)
      } catch { /* la DD no debe impedir la aprobación */ }

      await supabase.from('solicitudes_kyc').update({ estado: 'aprobada', cliente_id: clienteId }).eq('id', revisar.id)
      setSolicitudes(prev => prev.map(s => s.id === revisar.id ? { ...s, estado: 'aprobada', cliente_id: clienteId } : s))
      logAudit({ accion: 'aprobar', tabla: 'solicitudes_kyc', registro_id: revisar.id, descripcion: `KYC aprobado y volcado al gestor: ${revisar.nombre_cliente || nombreCli}${alerta ? ' [ALERTA en listas]' : ''}`, tenant_id: tid })
      setAlertaListas(alerta)
      setRevisar(null)
    } catch (err) { setMsgRev('No se pudo aprobar: ' + err.message) }
    setAccion('')
  }

  // Devuelve la solicitud al cliente para corrección: guarda el motivo, reabre el
  // enlace y le envía un correo indicando qué corregir.
  async function rechazar() {
    if (!revisar) return
    const motivo = window.prompt('Motivo de la devolución (se le enviará al cliente para que corrija):', '')
    if (motivo == null) return // canceló
    setAccion('rechazando')
    const nuevoVence = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('solicitudes_kyc')
      .update({ estado: 'rechazada', motivo_rechazo: motivo.trim() || null, vence_en: nuevoVence }).eq('id', revisar.id)
    try {
      await supabase.functions.invoke('enviar-correo-kyc', {
        body: { token: revisar.token, link: enlacePortal(revisar.token), motivo: motivo.trim() },
      })
    } catch { /* si falla el correo, la devolución igual queda registrada */ }
    setSolicitudes(prev => prev.map(s => s.id === revisar.id ? { ...s, estado: 'rechazada', motivo_rechazo: motivo.trim() } : s))
    logAudit({ accion: 'devolver', tabla: 'solicitudes_kyc', registro_id: revisar.id, descripcion: `KYC devuelto para corrección: ${motivo.trim() || 'sin motivo'}`, tenant_id: revisar.tenant_id })
    setAccion(''); setRevisar(null)
  }

  // Extiende la vigencia del enlace 3 días más (para solicitudes aún abiertas).
  async function extender(sol) {
    const nuevo = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('solicitudes_kyc').update({ vence_en: nuevo, recordatorio_vencimiento_en: null }).eq('id', sol.id)
    setSolicitudes(prev => prev.map(s => s.id === sol.id ? { ...s, vence_en: nuevo } : s))
    setCopiado('ext-' + sol.id); setTimeout(() => setCopiado(null), 1800)
  }

  // Cancela una solicitud (no borra datos): el enlace deja de funcionar.
  async function cancelar(sol) {
    if (!window.confirm(`¿Cancelar la solicitud de "${sol.nombre_cliente || sol.correo_cliente}"? El enlace dejará de funcionar.`)) return
    await supabase.from('solicitudes_kyc').update({ estado: 'cancelada' }).eq('id', sol.id)
    setSolicitudes(prev => prev.map(s => s.id === sol.id ? { ...s, estado: 'cancelada' } : s))
    logAudit({ accion: 'cancelar', tabla: 'solicitudes_kyc', registro_id: sol.id, descripcion: `Solicitud KYC cancelada: ${sol.nombre_cliente || sol.correo_cliente}`, tenant_id: sol.tenant_id })
  }

  // Informe (PDF independiente) con toda la información + índice de documentos.
  function descargarExpediente() {
    setMsgRev('')
    const logo = soList.find(t => t.id === revisar?.tenant_id)?.logo_url || tenant?.logo_url || null
    const html = generarExpedienteKycHTML({ tenant: soNombre, solicitud: revisar, anexos: docsRev, logo })
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { setMsgRev('Permita ventanas emergentes para el expediente.'); return }
    w.document.write(html); w.document.close()
  }

  // Genera en el navegador los 3 informes en PDF (listas, riesgo, DD) del cliente
  // ya aprobado. No deja nada en el servidor: devuelve [{ nombre, blob }].
  async function armarInformesPdf() {
    if (!revisar?.cliente_id) return []
    try {
      const { data: cli } = await supabase.from('clientes').select('*').eq('id', revisar.cliente_id).maybeSingle()
      if (!cli) return []
      const logo = soList.find(t => t.id === revisar.tenant_id)?.logo_url || tenant?.logo_url || null
      const nombreCli = cli.nombre_empresa || `${cli.nombre_cliente || ''} ${cli.primer_apellido || ''} ${cli.segundo_apellido || ''}`.trim()
      const screening = await tamizarPersona(nombreCli, cli.numero_identificacion || cli.cedula_juridica).catch(() => null)
      const { data: calif } = await supabase.from('calificaciones_riesgo').select('*')
        .eq('cliente_id', cli.id).eq('vigente', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const chkItems = docsKyc(cli.tipo_persona === 'juridica' ? 'juridica' : 'fisica')
      const { htmlAPdfBlob } = await import('../lib/htmlPdf')
      const { informeListasHTML, informeRiesgoHTML, informeDDHTML } = await import('../utils/informesCliente')
      const base = { tenant: soNombre, logo, cliente: cli }
      return [
        { nombre: 'Informe-Listas-Internacionales.pdf', blob: await htmlAPdfBlob(informeListasHTML({ ...base, screening })) },
        { nombre: 'Calificacion-de-Riesgo.pdf', blob: await htmlAPdfBlob(informeRiesgoHTML({ ...base, calificacion: calif })) },
        { nombre: 'Debida-Diligencia.pdf', blob: await htmlAPdfBlob(informeDDHTML({ ...base, screening, checklistItems: chkItems })) },
      ]
    } catch { return [] }
  }

  // Descarga los documentos + los 3 informes en PDF. Si el navegador lo permite,
  // deja ELEGIR la carpeta (File System Access API) y guarda todo ahí; si no,
  // descarga uno por uno. Nada se almacena en el servidor.
  async function descargarTodosDocs() {
    setMsgRev('Preparando documentos e informes…')
    const extras = await armarInformesPdf()
    const total = docsRev.length + extras.length
    if (total === 0) { setMsgRev(''); return }
    if (window.showDirectoryPicker) {
      let dir
      try { dir = await window.showDirectoryPicker() }
      catch (e) { if (e.name === 'AbortError') { setMsgRev(''); return } dir = null }
      if (dir) {
        let ok = 0
        for (const doc of docsRev) {
          try {
            const { data } = await supabase.storage.from('kyc').createSignedUrl(doc.archivo_path, 600)
            if (!data?.signedUrl) continue
            const blob = await (await fetch(data.signedUrl)).blob()
            const nombre = (doc.nombre_archivo || `${doc.doc_id}`).replace(/[\\/:*?"<>|]+/g, '_')
            const fh = await dir.getFileHandle(nombre, { create: true })
            const w = await fh.createWritable(); await w.write(blob); await w.close(); ok++
          } catch { /* sigue con el resto */ }
        }
        for (const ex of extras) {
          try {
            const fh = await dir.getFileHandle(ex.nombre, { create: true })
            const w = await fh.createWritable(); await w.write(ex.blob); await w.close(); ok++
          } catch { /* sigue */ }
        }
        setMsgRev(`Se guardaron ${ok}/${total} archivos (documentos + informes) en la carpeta elegida.`)
        return
      }
    }
    // Respaldo: descarga individual
    for (const doc of docsRev) {
      const { data } = await supabase.storage.from('kyc').createSignedUrl(doc.archivo_path, 600, { download: doc.nombre_archivo || true })
      if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); await new Promise(r => setTimeout(r, 400)) }
    }
    for (const ex of extras) {
      const url = URL.createObjectURL(ex.blob)
      const a = document.createElement('a'); a.href = url; a.download = ex.nombre; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      await new Promise(r => setTimeout(r, 400))
    }
    setMsgRev(extras.length ? `Se descargaron los documentos y ${extras.length} informes.` : '')
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

      {isSuperAdmin && (
        <div className="flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <label className="text-sm font-medium text-amber-800">Enviar desde el sujeto obligado:</label>
          <select value={soActivo || ''} onChange={e => setSoId(e.target.value)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-gray-700 flex-1 min-w-[220px]">
            {soList.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {alertaListas && (
        <div className={`p-3 rounded-lg border text-sm flex items-start justify-between gap-3 ${alertaListas.estado === 'alerta' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
          <div>
            <strong>⚠ {alertaListas.estado === 'alerta' ? 'Coincidencia en listas internacionales' : 'Posible coincidencia en listas'}</strong> — el tamizaje automático de <strong>{alertaListas.cliente}</strong> arrojó {alertaListas.n} resultado(s) ({ETIQUETA_LISTAS[alertaListas.estado]}). Revise la Consulta de Listas antes de operar con este cliente.
          </div>
          <button onClick={() => setAlertaListas(null)} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>
        </div>
      )}

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
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Documentos que se pedirán (checklist {tipoPersona === 'juridica' ? 'jurídica' : 'física'}) — destildá para quitar</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-40 overflow-y-auto">
                  {docsKyc(tipoPersona).filter(it => !(esCreditoTenant && it.id === 'kyc_eeff_o_ingresos')).map(it => (
                    <label key={it.id} className="flex items-start gap-2 text-xs text-gray-600">
                      <input type="checkbox" className="mt-0.5" checked={!excluidos.includes(it.id)}
                        onChange={e => setExcluidos(prev => e.target.checked ? prev.filter(x => x !== it.id) : [...prev, it.id])} />
                      <span>{it.label}{it.required ? ' *' : ''}</span>
                    </label>
                  ))}
                </div>
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

          {esCreditoTenant && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-800">Facilidades crediticias — documentos opcionales a solicitar</p>
              <label className="flex items-center gap-2 text-sm text-amber-900">
                <input type="checkbox" checked={pedirAvaluo} onChange={e => setPedirAvaluo(e.target.checked)} /> Solicitar avalúo de la garantía
              </label>
              <label className="flex items-center gap-2 text-sm text-amber-900">
                <input type="checkbox" checked={pedirFlujo} onChange={e => setPedirFlujo(e.target.checked)} /> Solicitar flujo de caja proyectado a un año
              </label>
              <p className="text-[11px] text-amber-700">El plan de inversión, la garantía, plano catastro, estudio de registro y estados financieros ya se piden automáticamente en el portal.</p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
              {guardando ? 'Creando…' : 'Crear y enviar al cliente'}
            </button>
          </div>
        </form>
      )}

      {/* Filtros + contador de pendientes */}
      {solicitudes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTROS.map(([v, l]) => {
            const n = v === 'todas' ? solicitudes.length : solicitudes.filter(s => s.estado === v).length
            if (v !== 'todas' && n === 0) return null
            const activo = filtro === v
            const esPend = v === 'recibida' && n > 0
            return (
              <button key={v} onClick={() => setFiltro(v)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${activo ? 'bg-brand-700 text-white border-brand-700' : esPend ? 'bg-violet-50 text-violet-700 border-violet-300' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'}`}>
                {l} <span className={`ml-1 ${activo ? 'opacity-80' : 'opacity-50'}`}>{n}</span>
              </button>
            )
          })}
        </div>
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
              <th className="px-4 py-2 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const visibles = filtro === 'todas' ? solicitudes : solicitudes.filter(s => s.estado === filtro)
              if (visibles.length === 0) {
                return <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{solicitudes.length === 0 ? 'Todavía no hay solicitudes. Creá la primera.' : 'No hay solicitudes en este filtro.'}</td></tr>
              }
              return visibles.map(s => {
              const est = ESTADO[s.estado] || ESTADO.enviada
              const abierta = s.estado !== 'recibida' && s.estado !== 'aprobada' && s.estado !== 'cancelada'
              return (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{s.nombre_cliente || '—'}</td>
                  <td className="px-4 py-2">{s.tipo_persona === 'juridica' ? 'Jurídica' : 'Física'}</td>
                  <td className="px-4 py-2 text-gray-500">{s.correo_cliente}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${est.clase}`}>{est.label}</span></td>
                  <td className="px-4 py-2 text-gray-500">{fecha(s.enviada_en || s.creado_en)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      {(s.estado === 'recibida' || s.estado === 'aprobada' || s.estado === 'rechazada') && (
                        <button onClick={() => abrirRevision(s)}
                          className={`text-xs font-semibold ${s.estado === 'recibida' ? 'text-violet-700 hover:underline' : 'text-gray-500 hover:text-brand-700'}`}>
                          {s.estado === 'recibida' ? '🔎 Revisar' : 'Ver'}
                        </button>
                      )}
                      {abierta && (
                        <>
                          <button onClick={() => copiar(s)} className="text-xs text-brand-600 hover:underline">
                            {copiado === s.id ? '¡Copiado!' : 'Copiar enlace'}
                          </button>
                          <button onClick={() => enviarCorreo(s)} className="text-xs text-gray-500 hover:text-brand-700">
                            {copiado === 'mail-' + s.id ? '✓ Enviado' : 'Reenviar'}
                          </button>
                          <button onClick={() => extender(s)} className="text-xs text-gray-500 hover:text-brand-700">
                            {copiado === 'ext-' + s.id ? '✓ +3 días' : 'Extender'}
                          </button>
                          <button onClick={() => cancelar(s)} className="text-xs text-red-500 hover:text-red-700">Cancelar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
            })()}
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

              {revisar.consentimiento_datos && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">
                  🔒 El cliente otorgó su consentimiento para el tratamiento de datos (Ley 8968){revisar.consentimiento_en ? ` el ${fecha(revisar.consentimiento_en)}` : ''}.
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase">Información recibida</p>
                  {revisar.estado === 'recibida' && (
                    editando ? (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditando(false); }} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                        <button onClick={guardarEdicion} disabled={guardandoEd} className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">{guardandoEd ? 'Guardando…' : 'Guardar cambios'}</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditando(true)} className="text-xs text-brand-600 hover:underline">✎ Editar datos</button>
                    )
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(revisar.datos || {})
                      .filter(([k, v]) => (editando || (v !== '' && v != null)) && !ESTRUCTURA_KEYS.includes(k) && !Array.isArray(v) && typeof v !== 'object')
                      .map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-50">
                        <td className="py-1.5 pr-3 text-gray-500 align-top w-2/5">{k}</td>
                        <td className="py-1.5 font-medium text-gray-800">
                          {editando
                            ? <input className="w-full rounded border border-gray-200 px-2 py-1 text-sm" value={v == null ? '' : String(v)} onChange={e => setDatoRev(k, e.target.value)} />
                            : String(v)}
                        </td>
                      </tr>
                    ))}
                    {Object.keys(revisar.datos || {}).length === 0 && <tr><td className="py-2 text-gray-400 text-sm">Sin datos.</td></tr>}
                  </tbody>
                </table>
                {!editando && bloquesEstructura(revisar.datos || {})}
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
                    ⬇ Guardar documentos{revisar.cliente_id ? ' + informes' : ''}
                  </button>
                )}
              </div>
              {revisar.estado === 'recibida' ? (
                <div className="flex gap-2">
                  <button onClick={rechazar} disabled={accion !== ''}
                    className="text-sm px-4 py-1.5 border border-amber-300 rounded-lg text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                    {accion === 'rechazando' ? '…' : '↩ Devolver para corrección'}
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
