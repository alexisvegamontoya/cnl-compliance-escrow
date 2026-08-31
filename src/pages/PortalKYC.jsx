// ============================================================
// Portal público de Recolección KYC (sin login) — /portal/:token
// Asistente por etapas con bloqueo: el cliente no avanza sin completar la etapa,
// y no puede enviar hasta subir el KYC firmado. Incluye preguntas y documentos
// extra que agregó el sujeto obligado. Toda escritura va por /api/kyc.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { docsKyc } from '../lib/kycChecklist'
import { generarKycHTML } from '../utils/kycDocumento'
import EstructuraKyc from '../components/kyc/EstructuraKyc'
import TelInput from '../components/kyc/TelInput'
import { PAISES_RIESGO, PROVINCIAS_CR, CANTONES_CR, ACTIVIDADES_PROFESIONES, ORIGENES_FONDOS } from '../lib/metodologiaRiesgo'

const PAISES = PAISES_RIESGO.map(p => p.pais).sort((a, b) => a.localeCompare(b, 'es'))
const ACTIVIDADES = ACTIVIDADES_PROFESIONES.map(a => a.label)
const ORIGEN_FONDOS_OPTS = ORIGENES_FONDOS.map(o => [o, o])
const cantonesDe = (prov) => CANTONES_CR.filter(c => c.provincia === prov).map(c => c.canton)

const CAMPOS_FISICA = [
  { k: 'nombre_cliente', l: 'Nombre', req: true }, { k: 'primer_apellido', l: 'Primer apellido', req: true },
  { k: 'segundo_apellido', l: 'Segundo apellido' },
  { k: 'tipo_identificacion', l: 'Tipo de identificación', type: 'select', opts: [['1', 'Cédula'], ['3', 'DIMEX'], ['4', 'Pasaporte']], req: true },
  { k: 'numero_identificacion', l: 'Número de identificación', req: true },
  { k: 'venc_identificacion', l: 'Fecha de caducidad del documento de identificación', type: 'date' },
  { k: 'fecha_nacimiento', l: 'Fecha de nacimiento', type: 'date' },
  { k: 'genero', l: 'Género', type: 'select', opts: [['M', 'Masculino'], ['F', 'Femenino'], ['otro', 'Otro']] },
  { k: 'estado_civil', l: 'Estado civil' }, { k: 'profesion_nombre', l: 'Profesión u oficio' },
  { k: 'actividad_economica', l: 'Actividad económica', type: 'actividad', req: true },
  { k: 'pais_nacimiento', l: 'País de nacimiento', type: 'pais' }, { k: 'pais_residencia', l: 'País de residencia', type: 'pais' },
  { k: 'provincia', l: 'Provincia', type: 'provincia' }, { k: 'canton', l: 'Cantón', type: 'canton' },
  { k: 'distrito', l: 'Distrito' },
  { k: 'direccion_exacta', l: 'Dirección exacta', full: true, req: true },
  { k: 'telefono', l: 'Teléfono', type: 'tel', req: true }, { k: 'correo_electronico', l: 'Correo electrónico', type: 'email', req: true },
  { k: 'proposito_relacion', l: 'Propósito de la relación comercial', full: true, req: true },
  { k: 'origen_fondos', l: 'Origen / fuente de los fondos', type: 'select', opts: ORIGEN_FONDOS_OPTS, req: true, full: true },
  { k: 'ingreso_mensual_est', l: 'Ingreso mensual estimado (USD)', type: 'number' },
  { k: 'actividad_descripcion', l: 'Describa ampliamente su actividad económica', type: 'textarea', full: true, req: true },
  { k: 'pep', l: '¿Es usted una persona expuesta políticamente (PEP)?', type: 'select', opts: [['no', 'No'], ['si', 'Sí']], req: true, full: true },
]

// Datos de la empresa donde labora (persona física).
const CAMPOS_EMPLEADOR = [
  { k: 'empleador_nombre_comercial', l: 'Nombre comercial' },
  { k: 'empleador_razon_social', l: 'Razón social' },
  { k: 'empleador_tipo_sociedad', l: 'Tipo de sociedad' },
  { k: 'empleador_actividad', l: 'Actividad de la empresa', full: true },
  { k: 'empleador_telefono', l: 'Teléfono', type: 'tel' },
  { k: 'empleador_correo', l: 'Correo de contacto', type: 'email' },
  { k: 'empleador_web', l: 'Página web' },
  { k: 'empleador_puesto', l: 'Puesto que desempeña' },
  { k: 'empleador_antiguedad', l: 'Tiempo de laborar en la empresa' },
]

const CAMPOS_JURIDICA = [
  { k: 'nombre_empresa', l: 'Razón social', req: true, full: true },
  { k: 'cedula_juridica', l: 'Cédula jurídica', req: true },
  { k: 'pagina_web', l: 'Página web' },
  { k: 'pais_constitucion', l: 'País de constitución', type: 'pais' }, { k: 'fecha_constitucion', l: 'Fecha de constitución', type: 'date' },
  { k: 'actividad_economica', l: 'Actividad económica', type: 'actividad', full: true, req: true },
  { k: 'actividad_descripcion', l: 'Describa ampliamente la actividad de la empresa', type: 'textarea', full: true, req: true },
  { k: 'paises_ingresos', l: 'País(es) donde la empresa genera la mayoría de sus ingresos', full: true, req: true },
  { k: 'provincia', l: 'Provincia', type: 'provincia' }, { k: 'canton', l: 'Cantón', type: 'canton' },
  { k: 'distrito', l: 'Distrito' },
  { k: 'direccion_exacta', l: 'Dirección exacta', full: true, req: true },
  { k: 'nombre_contacto', l: 'Persona de contacto' },
  { k: 'telefono', l: 'Teléfono', type: 'tel', req: true }, { k: 'correo_electronico', l: 'Correo electrónico', type: 'email', req: true },
  { k: 'proposito_relacion', l: 'Propósito de la relación comercial', full: true, req: true },
  { k: 'origen_fondos', l: 'Origen / fuente de los fondos', req: true, full: true },
  { k: 'ingreso_mensual_est', l: 'Ingreso mensual estimado (USD)', type: 'number' },
]

const PLAN_OPCIONES = [
  ['capital_trabajo', 'Capital de trabajo'], ['compra_propiedades', 'Compra de propiedades'],
  ['cancelacion_pasivos', 'Cancelación de pasivos'], ['compra_vehiculos', 'Compra de vehículos'],
  ['compra_edificio', 'Compra de edificio'], ['construccion', 'Construcción de un proyecto'], ['otros', 'Otros'],
]
const GARANTIA_OPCIONES = [
  ['uso_empresa', 'Bienes en uso de la empresa cliente'],
  ['tercero', 'Bienes de un tercero'],
  ['rep_socios', 'Bienes del representante legal o socios (no a nombre de la empresa)'],
]
// Documentos fijos para facilidades crediticias.
const DOCS_CREDITO = [
  { id: 'credito_plano_catastro', label: 'Plano catastro de la propiedad', required: true },
  { id: 'credito_estudio_registro', label: 'Estudio de registro (propiedad / vehículo / garantía)', required: true },
  { id: 'credito_eeff_deudora', label: 'Estados financieros de la empresa deudora (últimos 3 cierres fiscales + corte ≤90 días)', required: true },
  { id: 'credito_eeff_codeudores', label: 'Estados financieros de codeudores (si aplica)', required: false },
  { id: 'credito_eeff_fiadora', label: 'Estados financieros de la empresa fiadora (si aplica)', required: false },
]

async function api(body) {
  const r = await fetch('/api/kyc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Error')
  return j
}

export default function PortalKYC() {
  const { token } = useParams()
  const [cfg, setCfg]         = useState(null)
  const [datos, setDatos]     = useState({})
  const [docs, setDocs]       = useState([])
  const [paso, setPaso]       = useState(1)
  const [cargando, setCargando] = useState(true)
  const [fatal, setFatal]     = useState('')
  const [error, setError]     = useState('')
  const [subiendo, setSubiendo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/kyc?token=${encodeURIComponent(token)}`)
        const j = await r.json()
        if (!r.ok) { setFatal(j.error || 'Enlace no válido.'); setCargando(false); return }
        setCfg(j); setDatos(j.datos || {}); setDocs(j.docs || [])
        if (j.estado === 'recibida') setEnviado(true)
      } catch { setFatal('No se pudo cargar el formulario. Intente más tarde.') }
      setCargando(false)
    })()
  }, [token])

  const set = (k, v) => setDatos(prev => ({ ...prev, [k]: v }))
  const guardar = useCallback(async (d) => { try { await api({ token, action: 'guardar', datos: d }) } catch { /* autosave silencioso */ } }, [token])

  const esJ = cfg?.tipoPersona === 'juridica'
  const esCredito = cfg?.sector === 'credito'
  const campos = esJ ? CAMPOS_JURIDICA : CAMPOS_FISICA
  const preguntasExtra = cfg?.preguntasExtra || []
  const excluidos = new Set(cfg?.documentosExcluidos || [])
  // En crédito, los EEFF detallados van en la sección de crédito: no repetir el general.
  const docsBase = cfg
    ? docsKyc(cfg.tipoPersona).filter(d => !excluidos.has(d.id) && !(esCredito && d.id === 'kyc_eeff_o_ingresos'))
    : []
  const docsExtra = cfg?.documentosExtra || []
  const machotesDocs = (cfg?.machotes || [])
    .filter(m => {
      const tp = m.tipo_persona || 'ambos'
      // La jurídica ve todos (la CIC física es del representante legal); la física no ve los solo-jurídica.
      return esJ ? true : tp !== 'juridica'
    })
    .map(m => {
      const esFisicaEnJuridica = esJ && m.tipo_persona === 'fisica'
      return { id: `machote_${m.id}`, label: m.nombre + (esFisicaEnJuridica ? ' (del representante legal)' : ''), required: true, machote: m }
    })
  const docsCredito = esCredito
    ? [...DOCS_CREDITO, ...(datos.credito_plan_tipo === 'construccion'
        ? [{ id: 'credito_presupuesto_obra', label: 'Presupuesto de la obra', required: true }] : [])]
    : []
  const docSubido = (id) => docs.find(d => d.doc_id === id)

  async function subir(docId, etiqueta, file) {
    if (!file) return
    setError(''); setSubiendo(docId)
    try {
      const { path, token: upToken } = await api({ token, action: 'upload-url', docId, filename: file.name })
      const { error: e } = await supabase.storage.from('kyc').uploadToSignedUrl(path, upToken, file)
      if (e) throw new Error(e.message)
      await api({ token, action: 'registrar-doc', docId, etiqueta, path, filename: file.name })
      setDocs(prev => [...prev.filter(d => d.doc_id !== docId), { doc_id: docId, nombre_archivo: file.name }])
    } catch (err) { setError(`No se pudo subir el documento: ${err.message}`) }
    setSubiendo(null)
  }

  function descargarKyc() {
    guardar(datos)
    const html = generarKycHTML({ tenant: cfg.tenant, tipoPersona: cfg.tipoPersona, datos, logo: cfg.logo })
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { setError('Permita ventanas emergentes para descargar el KYC.'); return }
    w.document.write(html); w.document.close()
  }

  // ── Validación por etapa (bloqueo de avance) ──
  function faltantesPaso1() {
    const f = campos.filter(c => c.req && !String(datos[c.k] || '').trim()).map(c => c.l)
    preguntasExtra.forEach(p => { if (!String(datos[p.clave] || '').trim()) f.push(p.label) })
    if (esJ) {
      if (!(datos.representantes?.length && String(datos.representantes[0].nombre || '').trim())) f.push('Al menos un representante legal')
      if (!datos.pep_junta) f.push('Pregunta PEP (junta/representante/socios)')
      if (datos.pep_junta === 'si' && !String(datos.pep_junta_detalle || '').trim()) f.push('Detalle del PEP (quién/cargo/periodo)')
      if (!datos.pep_relacion) f.push('Pregunta relación con PEP')
      if (datos.pep_relacion === 'si' && !String(datos.pep_relacion_detalle || '').trim()) f.push('Detalle de la relación con PEP')
    } else {
      if (datos.pep === 'si' && !String(datos.pep_puesto || '').trim()) f.push('Puesto PEP que ocupa u ocupó')
      if (!datos.pep_relacion) f.push('¿Relación con un PEP?')
      if (datos.pep_relacion === 'si' && !String(datos.pep_relacion_detalle || '').trim()) f.push('Tipo de relación con el PEP')
    }
    if (esCredito) {
      if (!String(datos.credito_monto || '').trim()) f.push('Monto del crédito')
      if (!String(datos.credito_plan_tipo || '').trim()) f.push('Plan de inversión')
      if (!String(datos.credito_plan_desc || '').trim()) f.push('Descripción del plan de inversión')
      if (!String(datos.credito_garantia_tipo || '').trim()) f.push('Tipo de garantía')
      if (datos.credito_garantia_tipo === 'tercero' && !String(datos.credito_tercero_relacion || '').trim()) f.push('Relación con el tercero')
    }
    return f
  }
  function faltantesPaso2() {
    return [...docsCredito, ...docsBase, ...docsExtra].filter(it => it.required && !docSubido(it.id)).map(it => it.label)
      .concat(machotesDocs.filter(m => !docSubido(m.id)).map(m => m.label))
  }

  function siguiente() {
    setError('')
    if (paso === 1) {
      const f = faltantesPaso1()
      if (f.length) { setError('Complete los campos obligatorios: ' + f.slice(0, 6).join(', ') + (f.length > 6 ? '…' : '')); return }
      guardar(datos); setPaso(2); window.scrollTo({ top: 0 })
    } else if (paso === 2) {
      const f = faltantesPaso2()
      if (f.length) { setError('Adjunte los documentos obligatorios: ' + f.slice(0, 5).join(', ') + (f.length > 5 ? '…' : '')); return }
      setPaso(3); window.scrollTo({ top: 0 })
    }
  }

  async function enviar() {
    setError('')
    if (!docSubido('kyc_firmado')) { setError('Debe descargar el KYC, firmarlo y subirlo antes de enviar.'); return }
    setEnviando(true)
    try { await api({ token, action: 'enviar', datos }); setEnviado(true) }
    catch (err) { setError('No se pudo enviar: ' + err.message) }
    setEnviando(false)
  }

  if (cargando) return <Centro><p className="text-gray-500">Cargando…</p></Centro>
  if (fatal) return <Centro><div className="text-center"><p className="text-4xl mb-2">🔒</p><h1 className="text-lg font-bold text-gray-800">{fatal}</h1></div></Centro>
  if (enviado) return (
    <Centro><div className="text-center max-w-md">
      <p className="text-5xl mb-3">✅</p>
      <h1 className="text-xl font-bold text-gray-900">¡Información enviada!</h1>
      <p className="text-gray-500 mt-2">Gracias. {cfg?.tenant} recibió su información y documentos. No necesita hacer nada más.</p>
    </div></Centro>
  )

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500'
  const PASOS = ['Información', 'Documentos', 'Firmar y enviar']

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Encabezado con el sujeto obligado */}
        <header className="rounded-2xl overflow-hidden shadow-lg">
          <div className="bg-brand-900 px-6 py-7 text-center relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400"></div>
            {cfg.logo && (
              <img src={cfg.logo} alt={cfg.tenant} className="h-14 mx-auto mb-3 object-contain" />
            )}
            <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-[0.22em]">Sujeto obligado</p>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-1.5 leading-tight">{cfg.tenant}</h2>
            <div className="h-0.5 w-14 bg-amber-400 mx-auto my-3.5 rounded-full"></div>
            <h1 className="text-base font-semibold text-white/95">Formulario de Debida Diligencia (KYC)</h1>
            <p className="text-xs text-white/60 mt-1.5">Ley 7786 · Acuerdo SUGEF 13-19 · Su información es confidencial</p>
          </div>
        </header>

        {/* Pasos */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-1.5">
              <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${paso === i + 1 ? 'bg-brand-700 text-white shadow-sm' : paso > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-400 border border-gray-200'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${paso > i + 1 ? 'bg-emerald-600 text-white' : paso === i + 1 ? 'bg-white/25' : 'bg-gray-200'}`}>{paso > i + 1 ? '✓' : i + 1}</span>
                {p}
              </div>
              {i < PASOS.length - 1 && <span className="text-gray-300">·</span>}
            </div>
          ))}
        </div>

        {cfg.estado === 'rechazada' && cfg.motivo && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm px-4 py-3">
            <strong>Su información fue devuelta para corrección.</strong> Motivo: {cfg.motivo}. Por favor corrija lo indicado y vuelva a enviar.
          </div>
        )}
        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        {/* PASO 1 — Información */}
        {paso === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4" onBlur={() => guardar(datos)}>
            <h2 className="text-base font-bold text-gray-900">{esJ ? 'Datos de la empresa' : 'Datos personales'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {campos.map(c => (
                <Campo key={c.k} c={c} v={datos[c.k]} onChange={v => set(c.k, v)} cls={inputCls} provincia={datos.provincia} />
              ))}
            </div>

            {!esJ && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <h3 className="text-sm font-bold text-gray-800">Empresa donde labora</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CAMPOS_EMPLEADOR.map(c => (
                    <Campo key={c.k} c={c} v={datos[c.k]} onChange={v => set(c.k, v)} cls={inputCls} />
                  ))}
                </div>
              </div>
            )}

            {!esJ && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <h3 className="text-sm font-bold text-gray-800">Personas expuestas políticamente (PEP)</h3>
                {datos.pep === 'si' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Puesto que ocupa u ocupó *</label>
                      <input className={inputCls} value={datos.pep_puesto || ''} onChange={e => set('pep_puesto', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tiempo desde que dejó el cargo</label>
                      <input className={inputCls} value={datos.pep_tiempo || ''} onChange={e => set('pep_tiempo', e.target.value)} placeholder="Ej. 2 años / Aún en el cargo" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">¿Tiene relación directa (consanguinidad) o indirecta (afinidad) con una persona expuesta políticamente (PEP)? *</label>
                  <select className={inputCls} value={datos.pep_relacion || ''} onChange={e => set('pep_relacion', e.target.value)}>
                    <option value="">— Seleccione —</option><option value="no">No</option><option value="si">Sí</option>
                  </select>
                </div>
                {datos.pep_relacion === 'si' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">¿Cuál es el tipo de relación? *</label>
                    <input className={inputCls} value={datos.pep_relacion_detalle || ''} onChange={e => set('pep_relacion_detalle', e.target.value)} placeholder="Indique el vínculo y el nombre/cargo del PEP" />
                  </div>
                )}
              </div>
            )}

            {esJ && (
              <div className="pt-2 border-t border-gray-100">
                <EstructuraKyc datos={datos} set={set} />
              </div>
            )}

            {esJ && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <h3 className="text-sm font-bold text-gray-800">Personas expuestas políticamente (PEP)</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">¿Algún miembro de junta directiva, representante legal o socio es una persona expuesta políticamente (PEP)? *</label>
                  <select className={inputCls} value={datos.pep_junta || ''} onChange={e => set('pep_junta', e.target.value)}>
                    <option value="">— Seleccione —</option><option value="no">No</option><option value="si">Sí</option>
                  </select>
                </div>
                {datos.pep_junta === 'si' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Indique quién, qué cargo ocupa u ocupó y durante qué periodo *</label>
                    <textarea className={inputCls} rows={2} value={datos.pep_junta_detalle || ''} onChange={e => set('pep_junta_detalle', e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">¿Algún Socio, Director o Representante de la empresa tiene relación directa (consanguinidad) o indirecta (afinidad) con una persona expuesta políticamente (PEP)? *</label>
                  <select className={inputCls} value={datos.pep_relacion || ''} onChange={e => set('pep_relacion', e.target.value)}>
                    <option value="">— Seleccione —</option><option value="no">No</option><option value="si">Sí</option>
                  </select>
                </div>
                {datos.pep_relacion === 'si' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Detalle del tipo de actividad *</label>
                    <textarea className={inputCls} rows={2} value={datos.pep_relacion_detalle || ''} onChange={e => set('pep_relacion_detalle', e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {esCredito && (
              <div className="pt-2 space-y-3">
                <h3 className="text-sm font-bold text-gray-800">Información del crédito</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto del crédito solicitado (USD) *</label>
                    <input className={inputCls} type="number" value={datos.credito_monto || ''} onChange={e => set('credito_monto', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Plan de inversión *</label>
                    <select className={inputCls} value={datos.credito_plan_tipo || ''} onChange={e => set('credito_plan_tipo', e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {PLAN_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción amplia del plan de inversión *</label>
                  <textarea className={inputCls} rows={4} value={datos.credito_plan_desc || ''} onChange={e => set('credito_plan_desc', e.target.value)}
                    placeholder="Explique en detalle el destino y uso del crédito…" />
                </div>
                {datos.credito_plan_tipo === 'construccion' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Al ser construcción de un proyecto, en el paso de documentos deberá adjuntar el <strong>presupuesto de la obra</strong>.
                  </p>
                )}

                <h3 className="text-sm font-bold text-gray-800 pt-2">Garantía</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de garantía *</label>
                  <select className={inputCls} value={datos.credito_garantia_tipo || ''} onChange={e => set('credito_garantia_tipo', e.target.value)}>
                    <option value="">— Seleccione —</option>
                    {GARANTIA_OPCIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la garantía</label>
                  <textarea className={inputCls} rows={3} value={datos.credito_garantia_desc || ''} onChange={e => set('credito_garantia_desc', e.target.value)} />
                </div>
                {datos.credito_garantia_tipo === 'tercero' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Descripción amplia de la relación de la empresa con ese tercero *</label>
                    <textarea className={inputCls} rows={3} value={datos.credito_tercero_relacion || ''} onChange={e => set('credito_tercero_relacion', e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {preguntasExtra.length > 0 && (
              <>
                <h3 className="text-sm font-bold text-gray-800 pt-2">Preguntas adicionales</h3>
                <div className="space-y-3">
                  {preguntasExtra.map(p => (
                    <div key={p.clave}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{p.label} *</label>
                      <input className={inputCls} value={datos[p.clave] || ''} onChange={e => set(p.clave, e.target.value)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* PASO 2 — Documentos */}
        {paso === 2 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-gray-900">Documentos de respaldo</h2>
            <p className="text-xs text-gray-500">Adjunte cada documento (PDF o imagen). Los marcados con * son obligatorios.</p>
            {machotesDocs.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Descargue, complete/firme y vuelva a subir:</p>
                {machotesDocs.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                    <a href={m.machote.archivo_url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">⬇ {m.label}</a>
                    <SubirDoc id={m.id} subiendo={subiendo} subido={docSubido(m.id)} onFile={f => subir(m.id, m.label, f)} />
                  </div>
                ))}
              </div>
            )}
            {docsCredito.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase pt-1">Documentos del crédito</p>
                {docsCredito.map(it => (
                  <div key={it.id} className="flex items-center justify-between gap-3 flex-wrap border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">{it.label}{it.required && ' *'}</span>
                    <SubirDoc id={it.id} subiendo={subiendo} subido={docSubido(it.id)} onFile={f => subir(it.id, it.label, f)} />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {docsCredito.length > 0 && <p className="text-xs font-semibold text-gray-600 uppercase pt-1">Documentación general</p>}
              {[...docsBase, ...docsExtra].map(it => (
                <div key={it.id} className="flex items-center justify-between gap-3 flex-wrap border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700">{it.label}{it.required && ' *'}</span>
                  <SubirDoc id={it.id} subiendo={subiendo} subido={docSubido(it.id)} onFile={f => subir(it.id, it.label, f)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 3 — Firmar y enviar */}
        {paso === 3 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-gray-900">Formulario KYC firmado</h2>
            <p className="text-xs text-gray-500">Descargue el KYC con su información, imprímalo, fírmelo y vuelva a subirlo. No podrá enviar hasta subir el KYC firmado.</p>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={descargarKyc} className="px-4 py-2 rounded-lg border border-brand-300 text-brand-700 text-sm font-semibold hover:bg-brand-50">
                📄 Descargar KYC para firmar
              </button>
              <SubirDoc id="kyc_firmado" subiendo={subiendo} subido={docSubido('kyc_firmado')} onFile={f => subir('kyc_firmado', 'KYC firmado', f)} />
            </div>
          </div>
        )}

        {/* Navegación */}
        <div className="flex items-center justify-between pb-10">
          <button onClick={() => { setError(''); setPaso(p => Math.max(1, p - 1)) }} disabled={paso === 1}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">← Atrás</button>
          {paso < 3 ? (
            <button onClick={siguiente} className="btn-primary px-8 py-2.5 text-sm">Siguiente →</button>
          ) : (
            <button onClick={enviar} disabled={enviando || !docSubido('kyc_firmado')}
              className="btn-primary px-8 py-2.5 text-base disabled:opacity-50">
              {enviando ? 'Enviando…' : '📨 Enviar información'}
            </button>
          )}
        </div>

        <footer className="text-center text-xs text-gray-400 pb-6">
          <span className="font-medium text-gray-500">{cfg.tenant}</span> · Recolección de debida diligencia · Sus datos son tratados de forma confidencial conforme a la Ley 7786.
        </footer>
      </div>
    </div>
  )
}

function Campo({ c, v, onChange, cls, provincia }) {
  let control
  if (c.type === 'select') {
    control = (
      <select className={cls} value={v || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Seleccione —</option>
        {c.opts.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
      </select>
    )
  } else if (c.type === 'pais') {
    control = (
      <select className={cls} value={v || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Seleccione —</option>
        {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    )
  } else if (c.type === 'provincia') {
    control = (
      <select className={cls} value={v || ''} onChange={e => onChange(e.target.value)}>
        <option value="">— Seleccione —</option>
        {PROVINCIAS_CR.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    )
  } else if (c.type === 'canton') {
    const cs = cantonesDe(provincia)
    control = (
      <select className={cls} value={v || ''} onChange={e => onChange(e.target.value)} disabled={!provincia}>
        <option value="">{provincia ? '— Seleccione —' : 'Seleccione provincia primero'}</option>
        {cs.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
    )
  } else if (c.type === 'actividad') {
    control = (
      <>
        <input className={cls} list="kyc-actividades" value={v || ''} onChange={e => onChange(e.target.value)} placeholder="Escriba o elija…" />
        <datalist id="kyc-actividades">{ACTIVIDADES.map(a => <option key={a} value={a} />)}</datalist>
      </>
    )
  } else if (c.type === 'tel') {
    control = <TelInput value={v} onChange={onChange} cls={cls} />
  } else if (c.type === 'textarea') {
    control = <textarea className={cls} rows={3} value={v || ''} onChange={e => onChange(e.target.value)} />
  } else {
    control = <input className={cls} type={c.type || 'text'} value={v || ''} onChange={e => onChange(e.target.value)} />
  }
  return (
    <div className={c.full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{c.l}{c.req && ' *'}</label>
      {control}
    </div>
  )
}

function Centro({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">{children}</div>
}

function SubirDoc({ id, onFile, subiendo, subido }) {
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
      subido ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
    }`}>
      {subiendo === id ? 'Subiendo…' : subido ? `✓ ${(subido.nombre_archivo || 'Cargado').slice(0, 22)}` : '⬆ Subir archivo'}
      <input type="file" className="hidden" accept="application/pdf,image/*"
        onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}
