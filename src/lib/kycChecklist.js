// ============================================================
// kycChecklist.js — Checklist de documentos del PORTAL KYC.
// Es propio del portal (distinto del checklist del gestor de clientes):
// no incluye listas internacionales, protectora de crédito, información de
// internet, perfil del cliente ni clasificación de riesgo (esos se hacen en el
// gestor). Ver requerimientos del cliente (2026-08).
// ============================================================

const DOCS_FISICA = [
  { id: 'kyc_id_vigente',      label: 'Copia de identificación vigente (cédula / DIMEX / pasaporte)', required: true },
  { id: 'kyc_domicilio',       label: 'Comprobante de domicilio (no mayor a 3 meses)', required: true },
  { id: 'kyc_comp_ingreso',    label: 'Comprobante de ingreso', required: true },
  { id: 'kyc_autorizacion_info', label: 'Autorización de entrega de información (consentimiento informado)', required: true },
]

const DOCS_JURIDICA = [
  { id: 'kyc_cedulas_rep',     label: 'Copia de cédulas de identidad de los representantes', required: true },
  { id: 'kyc_personeria',      label: 'Personería jurídica reciente (≤1 mes)', required: true },
  { id: 'kyc_capital_rtbf',    label: 'Certificación de capital accionario o RTBF (≤1 mes)', required: true },
  { id: 'kyc_eeff_o_ingresos', label: 'Estados financieros O certificación de ingresos (últimos 3 periodos + corte reciente)', required: true },
  { id: 'kyc_decl_impuestos',  label: 'Declaración de impuestos (Hacienda y CCSS)', required: true },
  { id: 'kyc_cic_pj',          label: 'Formulario CIC – persona jurídica (firmado por el representante)', required: true },
  { id: 'kyc_cedulas_junta',   label: 'Copia de cédula/pasaporte de los miembros de la junta directiva', required: true },
  { id: 'kyc_id_socios_fisicos', label: 'Copia de identificación de los socios (personas físicas)', required: false },
  { id: 'kyc_personeria_socios', label: 'Personería jurídica de las empresas socias (si aplica)', required: false },
  { id: 'kyc_autorizacion_info', label: 'Autorización de entrega de información (consentimiento informado)', required: true },
  { id: 'kyc_art15_sugef',     label: '¿Realiza actividades del Art. 15 o 15 bis de la Ley 7786? Si aplica, aportar inscripción ante SUGEF', required: false },
]

/** Documentos del portal KYC según tipo de persona. */
export function docsKyc(tipoPersona) {
  return (tipoPersona === 'juridica' ? DOCS_JURIDICA : DOCS_FISICA).map(d => ({ ...d }))
}

// ── Mapeo doc_id del portal KYC → id del catálogo del gestor (checklistDocumental.js)
// Necesario para que la "Documentación presentada" del cliente se marque al aprobar.
const MAP_FISICA = {
  kyc_id_vigente: 'id_vigente',
  kyc_domicilio: 'domicilio',
  kyc_comp_ingreso: 'comp_ingreso',
  kyc_firmado: 'kyc_firmado',
}
const MAP_JURIDICA = {
  kyc_cedulas_rep: 'jc_cedulas_representantes',
  kyc_personeria: 'jc_personeria',
  kyc_capital_rtbf: 'jc_capital_rtbf',
  kyc_eeff_o_ingresos: 'jc_eeff',
  credito_eeff_deudora: 'jc_eeff',
  kyc_decl_impuestos: 'jc_decl_impuestos',
  kyc_cic_pj: 'jc_cic_pj',
  kyc_autorizacion_info: 'jc_autorizacion_info',
  kyc_firmado: 'jc_conozca_pj',
}

/**
 * Construye el checklist con las claves del catálogo del gestor a partir de lo
 * recibido en el portal KYC, para que la ficha del cliente lo refleje al aprobar.
 * Marca también las gestiones que se hacen automáticamente al aprobar (listas,
 * PEP, riesgo, consentimiento).
 */
export function checklistGestorDesdeKyc({ tipoPersona, docIdsRecibidos = [], datos = {}, consintio = false }) {
  const esJ = String(tipoPersona || '').toLowerCase().startsWith('jurid')
  const recibidos = new Set(docIdsRecibidos)
  const out = {}
  const marca = (id, nota) => { if (id && !out[id]) out[id] = { estado: 'disponible', nota: nota || 'Recibido por portal KYC' } }
  const MAP = esJ ? MAP_JURIDICA : MAP_FISICA

  recibidos.forEach(docId => {
    if (MAP[docId]) marca(MAP[docId])
    if (esJ && String(docId).startsWith('machote_')) marca('jc_cic_pf', 'CIC del representante (portal)')
  })

  if (esJ) {
    if (recibidos.has('kyc_firmado')) marca('jc_conozca_pf', 'KYC firmado por el representante')
    if (recibidos.has('kyc_eeff_o_ingresos') || recibidos.has('credito_eeff_deudora')) marca('jc_cert_ingresos')
    marca('jc_listas_internacionales', 'Tamizaje automático al aprobar')
    marca('jc_clasificacion_riesgo', 'Calificación automática al aprobar')
    if (consintio) marca('jc_consentimiento_informado', 'Consentimiento otorgado en el portal')
    if (datos.sugef_estado && datos.sugef_estado !== 'no') marca('jc_art15_sugef')
  } else {
    if (datos.proposito_relacion) marca('proposito', 'Declarado en el portal')
    if (datos.origen_fondos) marca('origen_fondos', 'Declarado en el portal')
    marca('pep_check', 'Consulta PEP automática al aprobar')
    marca('listas_ok', 'Tamizaje automático al aprobar')
    if (datos.ccss_estado) marca('ccss_estado', 'Declarado en el portal')
    if (datos.sugef_estado) marca('sugef_check', 'Declarado en el portal')
  }
  return out
}
