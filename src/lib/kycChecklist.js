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
