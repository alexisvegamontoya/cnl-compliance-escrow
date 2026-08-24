/**
 * checklistDocumental.js
 * Fuente ÚNICA del checklist de documentación del cliente (Acuerdo SUGEF 13-19)
 * y del motor de calificación de cumplimiento por cliente y por sujeto obligado.
 *
 * Lo consumen:
 *   · Debida Diligencia (paso 4 — checklist)          → src/pages/DebilidaDiligencia.jsx
 *   · Perfil del cliente (Documentación presentada)   → src/pages/GestionClientes.jsx
 *   · Formulario de cliente (tab Documentación)       → src/components/clientes/ClienteFormCompleto.jsx
 *   · Plantilla de carga masiva Excel                 → src/components/clientes/CargaMasivaClientes.jsx
 *   · Dashboard de cumplimiento (ítem 1)              → src/pages/ComplianceDashboard.jsx
 *   · Expediente imprimible                           → src/components/clientes/InformeClienteCompleto.jsx
 *
 * El checklist se persiste en clientes.checklist_documental (JSONB):
 *   { id_vigente: { estado: 'disponible', nota: '...' }, ... }
 *
 * CATÁLOGO POR SUJETO OBLIGADO
 * El catálogo estándar de abajo es el punto de partida. Cada sujeto obligado
 * puede renombrar documentos, volverlos obligatorios u opcionales, excluirlos o
 * agregar requisitos propios; esas personalizaciones viven en la tabla
 * `catalogo_documentos` (sql/add_catalogo_documentos_tenant.sql) y se resuelven
 * con resolverCatalogo(). El catálogo resultante se distribuye por la app con
 * useCatalogoDocumental() (src/lib/CatalogoDocumentalContext.jsx) y se pasa a
 * todas las funciones de este módulo, porque determina qué documentos entran en
 * la calificación de cumplimiento del cliente.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE DOCUMENTOS
// ─────────────────────────────────────────────────────────────────────────────

export const CHECKLIST_DOCUMENTAL = {
  base: [
    { id: 'id_vigente',    label: 'Copia de identificación vigente (cédula / DIMEX / pasaporte)', required: true },
    { id: 'domicilio',     label: 'Comprobante de domicilio (no mayor a 3 meses)', required: true },
    { id: 'comp_ingreso',  label: 'Comprobante de ingreso (colilla CCSS, carta patronal o declaración)', required: true },
    { id: 'kyc_firmado',   label: 'Formulario de vinculación firmado por el cliente', required: true },
    { id: 'proposito',     label: 'Declaración de propósito de la relación comercial', required: true },
    { id: 'origen_fondos', label: 'Declaración de origen de fondos', required: true },
    { id: 'pep_check',     label: 'Verificación PEP (persona expuesta políticamente)', required: true },
    { id: 'listas_ok',     label: 'Verificación en listas internacionales (OFAC, ONU, UE)', required: true },
    { id: 'ccss_estado',   label: 'Verificación estado CCSS (mora patronal, si aplica)', required: false },
    { id: 'sugef_check',   label: 'Verificación SUGEF (si es sujeto obligado, Art. 15/15bis/15ter)', required: false },
  ],
  // Checklist de documentación para CLIENTES JURÍDICOS (reemplaza al checklist base;
  // el cliente jurídico ve exactamente esta lista, no la base). Orden y contenido
  // según el expediente estándar de CNL Craniley para persona jurídica.
  pj: [
    { id: 'jc_cedulas_representantes', label: '1. Copia de cédulas de identidad de los representantes', required: true },
    { id: 'jc_personeria',            label: '2. Personería jurídica reciente (≤1 mes, RNP Digital / Registro Nacional)', required: true },
    { id: 'jc_capital_rtbf',          label: '3. Certificación de Capital Accionario o RTBF (≤1 mes)', required: true },
    { id: 'jc_eeff',                  label: '4. Estados financieros de los últimos 3 periodos y un corte reciente', required: true },
    { id: 'jc_cert_ingresos',         label: '5. Certificados de ingresos de los últimos 3 periodos fiscales y un corte reciente', required: true },
    { id: 'jc_decl_impuestos',        label: '6. Declaración de impuestos (1. Hacienda · 2. CCSS)', required: true },
    { id: 'jc_perfil_cliente',        label: '7. Perfil del cliente', required: true },
    { id: 'jc_conozca_pj',            label: '8. Formulario Conozca a su Cliente – persona jurídica (firmado por el representante)', required: true },
    { id: 'jc_conozca_pf',            label: '9. Formulario Conozca a su Cliente – persona física (firmado)', required: true },
    { id: 'jc_cic_pj',                label: '10. Formulario CIC – persona jurídica (firmado por el representante)', required: true },
    { id: 'jc_cic_pf',                label: '11. Formulario CIC – persona física (firmado por el representante)', required: true },
    { id: 'jc_listas_internacionales',label: '12. Listas internacionales (OFAC, INTERPOL)', required: true },
    { id: 'jc_protectora_credito',    label: '13. Protectora de Crédito (Cero Riesgo) – jurídico y físico', required: true },
    { id: 'jc_clasificacion_riesgo',  label: '14. Clasificación de riesgo', required: true },
    { id: 'jc_info_internet',         label: '15. Información en internet de los clientes', required: false },
    { id: 'jc_autorizacion_info',     label: '16. Autorización de entrega de información (consentimiento informado)', required: true },
    { id: 'jc_art15_sugef',           label: '17. ¿Realiza actividades del Art. 15 o 15 bis de la Ley 7786? Si aplica, aportar inscripción ante SUGEF', required: false },
    { id: 'jc_consentimiento_informado', label: '18. Consentimiento informado (físico y jurídico)', required: true },
  ],
  pep: [
    { id: 'aprobacion_jd',   label: 'Aprobación de la Junta Directiva o nivel superior', required: true },
    { id: 'decl_jurada_pep', label: 'Declaración jurada de cargo y origen de fondos', required: true },
    { id: 'monitoreo_ref',   label: 'Monitoreo reforzado activado', required: true },
    { id: 'revision_anual',  label: 'Revisión anual programada', required: true },
  ],
}

// Alias histórico usado por el módulo de Debida Diligencia
export const CHECKLIST = CHECKLIST_DOCUMENTAL

/** Catálogo sin personalizar — el que aplica a un sujeto obligado sin ajustes. */
export const CATALOGO_ESTANDAR = CHECKLIST_DOCUMENTAL

export const GRUPOS_DOC = ['base', 'pj', 'pep']

export const TITULOS_GRUPO = {
  base: 'Persona Física — Documentación requerida',
  pj:   'Persona Jurídica — Documentación requerida',
  pep:  '🏛️ PEP — DDC Ampliada — Art. 38',
}

/** Todos los documentos de un catálogo, en orden, con su grupo. */
export function todosLosDocumentos(catalogo = CATALOGO_ESTANDAR) {
  return GRUPOS_DOC.flatMap(g => (catalogo[g] || []).map(it => ({ ...it, grupo: g })))
}

/** ¿El documento viene del catálogo estándar SUGEF? */
export function esDocEstandar(docId) {
  return GRUPOS_DOC.some(g => CHECKLIST_DOCUMENTAL[g].some(it => it.id === docId))
}

export const ESTADOS_CHECKLIST = [
  { value: 'pendiente',     label: '⏳ Pendiente' },
  { value: 'disponible',    label: '✅ Disponible' },
  { value: 'no_disponible', label: '❌ No disponible' },
  { value: 'no_aplica',     label: '➖ No aplica' },
]

export const ESTADO_LABEL = {
  pendiente:     '⏳ Pendiente',
  disponible:    '✅ Disponible',
  no_disponible: '❌ No disponible',
  no_aplica:     '➖ No aplica',
}

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO PERSONALIZADO POR SUJETO OBLIGADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica las personalizaciones de un sujeto obligado sobre el catálogo estándar.
 *
 * Reglas:
 *   · label / required en NULL heredan el valor del estándar (así una
 *     actualización normativa del catálogo base llega sola a quien no lo tocó).
 *   · activo = false saca el documento del checklist y de la calificación.
 *   · las filas cuyo doc_id no existe en el estándar son requisitos propios y
 *     se agregan al final de su grupo, ordenadas por `orden`.
 *
 * @param {Array} personalizaciones filas de la tabla `catalogo_documentos`
 * @returns {{ base: Array, pj: Array, pep: Array }}
 */
export function resolverCatalogo(personalizaciones = []) {
  const filas  = Array.isArray(personalizaciones) ? personalizaciones : []
  const porId  = new Map(filas.map(f => [f.doc_id, f]))
  const catalogo = { base: [], pj: [], pep: [] }

  // 1) Documentos del catálogo estándar, con el ajuste del sujeto obligado
  GRUPOS_DOC.forEach(grupo => {
    CHECKLIST_DOCUMENTAL[grupo].forEach(item => {
      const ajuste = porId.get(item.id)
      if (ajuste && ajuste.activo === false) return
      const label = ajuste?.label?.trim()
      catalogo[grupo].push({
        id:          item.id,
        label:       label || item.label,
        required:    ajuste?.required == null ? item.required : !!ajuste.required,
        ayuda:       ajuste?.ayuda || '',
        grupo,
        estandar:    true,
        // el nombre o la obligatoriedad difieren de la norma base
        ajustado:    !!(label && label !== item.label) ||
                     (ajuste?.required != null && !!ajuste.required !== item.required),
      })
    })
  })

  // 2) Requisitos propios del sujeto obligado
  filas
    .filter(f => f.activo !== false && !esDocEstandar(f.doc_id) && f.label?.trim())
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.creado_en || '').localeCompare(String(b.creado_en || '')))
    .forEach(f => {
      const grupo = GRUPOS_DOC.includes(f.grupo) ? f.grupo : 'base'
      catalogo[grupo].push({
        id:       f.doc_id,
        label:    f.label.trim(),
        required: f.required !== false,
        ayuda:    f.ayuda || '',
        grupo,
        estandar: false,
        ajustado: false,
      })
    })

  return catalogo
}

const RE_NO_SLUG = new RegExp('[^a-z0-9]+', 'g')

/**
 * doc_id estable para un requisito propio, derivado de su nombre.
 * Se prefija para no colisionar nunca con el catálogo estándar y se persiste
 * tal cual: es la clave con la que queda guardado el estado en cada cliente,
 * por lo que NO debe recalcularse al renombrar el documento.
 */
export function docIdDesdeLabel(label, idsExistentes = []) {
  const base = String(label || '')
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase().replace(RE_NO_SLUG, '_').replace(/^_+|_+$/g, '')
    .slice(0, 45)
  const raiz = `doc_${base || 'requisito'}`
  const usados = new Set(idsExistentes)
  if (!usados.has(raiz)) return raiz
  let n = 2
  while (usados.has(`${raiz}_${n}`)) n++
  return `${raiz}_${n}`
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECCIÓN DE DOCUMENTOS APLICABLES
// ─────────────────────────────────────────────────────────────────────────────

const esJuridica = (tipoPersona) => String(tipoPersona || '').toLowerCase().startsWith('jurid')

/**
 * Grupos de documentos que aplican a un cliente.
 * @param {{ tipoPersona?: string, esPEP?: boolean }} ctx
 * @param {object} [catalogo] catálogo del sujeto obligado (por defecto, el estándar)
 */
export function gruposChecklist({ tipoPersona = 'fisica', esPEP = false } = {}, catalogo = CATALOGO_ESTANDAR) {
  const cat = catalogo || CATALOGO_ESTANDAR
  // El cliente jurídico usa SU propia lista de documentos (grupo pj) en lugar de
  // la base; el físico usa la base. La base y la pj son excluyentes por tipo.
  const grupos = esJuridica(tipoPersona)
    ? [{ id: 'pj',   titulo: TITULOS_GRUPO.pj,   items: cat.pj   || [] }]
    : [{ id: 'base', titulo: TITULOS_GRUPO.base, items: cat.base || [] }]
  if (esPEP) grupos.push({ id: 'pep', titulo: TITULOS_GRUPO.pep, items: cat.pep || [] })
  return grupos.filter(g => g.items.length > 0)
}

/** Lista plana de documentos aplicables a un cliente. */
export function itemsChecklist(ctx, catalogo = CATALOGO_ESTANDAR) {
  return gruposChecklist(ctx, catalogo).flatMap(g => g.items)
}

/** Contexto de checklist a partir de una fila de la tabla clientes. */
export function contextoCliente(cliente = {}) {
  return {
    tipoPersona: cliente.tipo_persona || (cliente.cedula_juridica || cliente.nombre_empresa ? 'juridica' : 'fisica'),
    esPEP: !!cliente.pep,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURA / NORMALIZACIÓN DEL CHECKLIST GUARDADO
// ─────────────────────────────────────────────────────────────────────────────

/** Estado de un documento — tolera el formato antiguo (booleano). */
export function estadoItem(checklist, id) {
  const v = checklist?.[id]
  if (v === true)  return 'disponible'
  if (v === false || v == null) return 'pendiente'
  if (typeof v === 'string') return v
  return v.estado || 'pendiente'
}

export function notaItem(checklist, id) {
  const v = checklist?.[id]
  if (!v || typeof v !== 'object') return ''
  return v.nota || ''
}

/** Convierte cualquier formato guardado al formato canónico { id: { estado, nota } }. */
export function normalizarChecklist(checklist) {
  const out = {}
  Object.keys(checklist || {}).forEach(id => {
    out[id] = { estado: estadoItem(checklist, id), nota: notaItem(checklist, id) }
  })
  return out
}

/**
 * Resumen del avance documental.
 * Los documentos marcados "no aplica" salen del denominador.
 */
export function resumenChecklist(checklist, items) {
  let ok = 0, noAplica = 0, faltantesReq = []
  items.forEach(it => {
    const e = estadoItem(checklist, it.id)
    if (e === 'disponible') ok++
    else if (e === 'no_aplica') noAplica++
    else if (it.required) faltantesReq.push(it.label)
  })
  const total       = items.length
  const evaluables  = total - noAplica
  const pendientes  = evaluables - ok
  return {
    ok, total, noAplica, evaluables, pendientes,
    faltantesRequeridos: faltantesReq,
    pct: evaluables === 0 ? 0 : (ok / evaluables) * 100,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALIFICACIÓN DE CUMPLIMIENTO POR CLIENTE (1 a 100)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pesos de la calificación.
 * El checklist documental pesa más que el resto: es la evidencia del expediente.
 */
export const PESOS_CUMPLIMIENTO = {
  documentacion: 60,  // checklist de documentos presentados
  informacion:   25,  // completitud del expediente del cliente
  gestiones:     15,  // DD, listas y calificación de riesgo realizadas
}

/** Campos del expediente que se consideran "información necesaria del cliente". */
function camposInformacion(cliente) {
  const juridica = esJuridica(cliente.tipo_persona)
  const actividad = cliente.actividad_eco_nombre || cliente.profesion_nombre || cliente.actividad_economica
  const comunes = [
    { key: 'identificacion',      label: 'número de identificación', ok: !!(cliente.numero_identificacion || cliente.cedula_juridica) },
    { key: 'nombre',              label: 'nombre / razón social',    ok: !!(juridica ? cliente.nombre_empresa : cliente.nombre_cliente) },
    { key: 'actividad',           label: 'actividad económica / profesión', ok: !!actividad },
    { key: 'pais_ubicacion',      label: 'país de ubicación',        ok: !!(cliente.pais_ubicacion || cliente.pais_residencia) },
    { key: 'direccion_exacta',    label: 'dirección exacta',         ok: !!cliente.direccion_exacta },
    { key: 'telefono',            label: 'teléfono',                 ok: !!cliente.telefono },
    { key: 'correo_electronico',  label: 'correo electrónico',       ok: !!cliente.correo_electronico },
    { key: 'fecha_vinculacion',   label: 'fecha de vinculación',     ok: !!cliente.fecha_vinculacion },
    { key: 'proposito_relacion',  label: 'propósito de la relación', ok: !!cliente.proposito_relacion },
    { key: 'origen_fondos',       label: 'origen de fondos',         ok: !!cliente.origen_fondos },
    { key: 'ingreso_mensual_est', label: 'ingreso mensual estimado', ok: cliente.ingreso_mensual_est != null && cliente.ingreso_mensual_est !== '' },
  ]
  const especificos = juridica
    ? [
        { key: 'fecha_constitucion', label: 'fecha de constitución',  ok: !!cliente.fecha_constitucion },
        { key: 'pais_constitucion',  label: 'país de constitución',   ok: !!cliente.pais_constitucion },
      ]
    : [
        { key: 'fecha_nacimiento',   label: 'fecha de nacimiento',    ok: !!cliente.fecha_nacimiento },
        { key: 'pais_nacimiento',    label: 'país de nacimiento',     ok: !!cliente.pais_nacimiento },
      ]
  return [...comunes, ...especificos]
}

/** Gestiones de cumplimiento realizadas sobre el cliente. */
function camposGestiones(cliente) {
  return [
    { key: 'calificacion', label: 'calificación de riesgo', ok: !!(cliente.nivel_riesgo_actual || cliente.calificacion_riesgo || cliente.estado_calificacion === 'completado') },
    { key: 'dd',           label: 'debida diligencia',      ok: cliente.estado_dd === 'completado' },
    { key: 'listas',       label: 'consulta en listas',     ok: !!cliente.estado_listas && cliente.estado_listas !== 'pendiente' },
  ]
}

export const SEMAFOROS = {
  verde:    { id: 'verde',    label: 'Cumplimiento adecuado', color: '#1f6d45', clase: 'text-green-700',  fondo: 'bg-green-50 border-green-200' },
  amarillo: { id: 'amarillo', label: 'Cumplimiento parcial',  color: '#c89116', clase: 'text-yellow-700', fondo: 'bg-yellow-50 border-yellow-200' },
  rojo:     { id: 'rojo',     label: 'Cumplimiento crítico',  color: '#c31b26', clase: 'text-red-700',    fondo: 'bg-red-50 border-red-200' },
}

/** Semáforo a partir del puntaje: ≥80 verde · 50-79 amarillo · <50 rojo. */
export function semaforoDe(score) {
  if (score >= 80) return SEMAFOROS.verde
  if (score >= 50) return SEMAFOROS.amarillo
  return SEMAFOROS.rojo
}

/**
 * Catálogo que aplica a un cliente concreto.
 * Acepta un catálogo fijo o un resolutor `(cliente) => catálogo`, para las
 * pantallas que listan clientes de varios sujetos obligados a la vez.
 */
function catalogoAplicable(catalogo, cliente) {
  const cat = typeof catalogo === 'function' ? catalogo(cliente) : catalogo
  return cat || CATALOGO_ESTANDAR
}

/**
 * Calificación de cumplimiento de un cliente (1 a 100).
 * @param {object} cliente  fila de la tabla `clientes`
 * @param {{ checklist?: object, catalogo?: object|Function }} [opts]
 *        checklist: estado alternativo (p. ej. el que se está editando)
 *        catalogo:  catálogo del sujeto obligado, o `(cliente) => catálogo`
 *                   (por defecto, el estándar)
 */
export function calcularCumplimientoCliente(cliente = {}, opts = {}) {
  const checklist = opts.checklist ?? cliente.checklist_documental ?? {}
  const items     = itemsChecklist(contextoCliente(cliente), catalogoAplicable(opts.catalogo, cliente))
  const doc       = resumenChecklist(checklist, items)

  const info      = camposInformacion(cliente)
  const infoOk    = info.filter(f => f.ok).length
  const infoPct   = info.length === 0 ? 0 : (infoOk / info.length) * 100

  const gest      = camposGestiones(cliente)
  const gestOk    = gest.filter(f => f.ok).length
  const gestPct   = (gestOk / gest.length) * 100

  const bruto = (
    doc.pct  * PESOS_CUMPLIMIENTO.documentacion +
    infoPct  * PESOS_CUMPLIMIENTO.informacion +
    gestPct  * PESOS_CUMPLIMIENTO.gestiones
  ) / 100

  const score = Math.max(1, Math.min(100, Math.round(bruto)))

  const faltantes = [
    ...doc.faltantesRequeridos.map(l => `Documento obligatorio pendiente: ${l}`),
    ...info.filter(f => !f.ok).map(f => `Falta ${f.label}`),
    ...gest.filter(f => !f.ok).map(f => `Pendiente: ${f.label}`),
  ]

  return {
    score,
    semaforo: semaforoDe(score),
    checklist,
    items,
    documentacion: { pct: doc.pct, peso: PESOS_CUMPLIMIENTO.documentacion, ok: doc.ok, total: doc.total, evaluables: doc.evaluables, noAplica: doc.noAplica },
    informacion:   { pct: infoPct, peso: PESOS_CUMPLIMIENTO.informacion, ok: infoOk, total: info.length, campos: info },
    gestiones:     { pct: gestPct, peso: PESOS_CUMPLIMIENTO.gestiones, ok: gestOk, total: gest.length, campos: gest },
    faltantes,
  }
}

/**
 * Calificación GLOBAL de la cartera de clientes de un sujeto obligado.
 * Es el promedio simple de la calificación de los clientes activos y es el
 * valor que alimenta el ítem 1 del Dashboard de Cumplimiento.
 *
 * En la vista consolidada del superadmin la cartera mezcla varios sujetos
 * obligados: pásele el resolutor `(cliente) => catálogo` para que cada cliente
 * se califique con los documentos que exige el suyo.
 *
 * @param {Array} clientes
 * @param {object|Function} [catalogo] catálogo fijo o `(cliente) => catálogo`
 */
export function calcularCumplimientoGlobal(clientes = [], catalogo = CATALOGO_ESTANDAR) {
  const activos = clientes.filter(c => c.activo !== false && !c.fecha_termino_relacion)
  const detalle = activos.map(c => ({ cliente: c, ...calcularCumplimientoCliente(c, { catalogo }) }))

  const score = detalle.length === 0
    ? 100
    : Math.round(detalle.reduce((s, d) => s + d.score, 0) / detalle.length)

  const distribucion = { verde: 0, amarillo: 0, rojo: 0 }
  detalle.forEach(d => { distribucion[d.semaforo.id]++ })

  return {
    score,
    semaforo: semaforoDe(score),
    total: activos.length,
    distribucion,
    detalle: detalle.sort((a, b) => a.score - b.score),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOPORTE PARA LA PLANTILLA EXCEL DE CARGA MASIVA
// ─────────────────────────────────────────────────────────────────────────────

const NOTA_GRUPO = {
  base: 'Todos los clientes',
  pj:   'Solo persona jurídica',
  pep:  'Solo si el cliente es PEP',
}

/** Nombre de la columna de Excel de un documento (los propios ya vienen con prefijo). */
export const columnaExcelDoc = (id) => (String(id).startsWith('doc_') ? String(id) : `doc_${id}`)

/** Columnas `doc_*` (SI / NO / NA) que se agregan a la hoja «Clientes». */
export function columnasDocumentos(catalogo = CATALOGO_ESTANDAR) {
  return todosLosDocumentos(catalogo).map(it => ({
    key:     columnaExcelDoc(it.id),
    id:      it.id,
    grupo:   it.grupo,
    label:   it.label,
    req:     false,
    ejemplo: 'SI',
    nota:    `${NOTA_GRUPO[it.grupo]} · SI | NO | NA (no aplica) · ${it.label}`,
  }))
}

const RE_DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

const SI = ['si', 'sí', 's', 'true', '1', 'x', 'yes', 'disponible']
const NO = ['no', 'n', 'false', '0', 'no_disponible']
const NA = ['na', 'n/a', 'no aplica', 'no_aplica', 'aplica no']

/** SI / NO / NA (celda de Excel) → estado del checklist. */
export function estadoDesdeCelda(valor) {
  const v = String(valor ?? '')
    .normalize('NFD').replace(RE_DIACRITICOS, '')
    .toLowerCase().trim()
  if (!v) return null
  if (NA.includes(v)) return 'no_aplica'
  if (SI.includes(v)) return 'disponible'
  if (NO.includes(v)) return 'no_disponible'
  return null
}

/** Construye el checklist a partir de las columnas `doc_*` de una fila del Excel. */
export function checklistDesdeFilaExcel(fila = {}, catalogo = CATALOGO_ESTANDAR) {
  const out = {}
  todosLosDocumentos(catalogo).forEach(it => {
    const estado = estadoDesdeCelda(fila[columnaExcelDoc(it.id)])
    if (estado) out[it.id] = { estado, nota: '' }
  })
  return out
}
