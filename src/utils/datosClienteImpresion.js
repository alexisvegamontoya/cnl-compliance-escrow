/**
 * datosClienteImpresion.js — Campos del cliente (incluidos los que llegan por el
 * portal KYC) listos para imprimir: página web, distrito, países de ingresos,
 * caducidad del documento, CCSS/SUGEF, origen de fondos, empresa donde labora,
 * condición PEP ampliada y la estructura (representantes, junta, socios).
 *
 * Cada función devuelve pares [etiqueta, valor] ya convertidos a texto y SIN
 * valores vacíos: quien imprime solo decide el estilo. Nunca devuelve objetos
 * (adiós al «[object Object]»).
 */
import { supabase } from '../lib/supabase'

// Escapa texto para insertarlo en HTML.
export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Convierte cualquier valor a texto imprimible ('' si no hay nada que mostrar).
export function texto(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    // Objetos sueltos: «clave: valor» de lo que tenga contenido.
    return Object.entries(v).map(([k, x]) => { const t = texto(x); return t ? `${k}: ${t}` : '' })
      .filter(Boolean).join(' · ')
  }
  return String(v).trim()
}

// Fecha ISO (AAAA-MM-DD) → DD/MM/AAAA; cualquier otra cosa se deja igual.
export function fechaCorta(v) {
  const t = texto(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t
}

// Solo los pares con valor.
const conValor = (pares) => pares
  .map(([l, v]) => [l, texto(v)])
  .filter(([, v]) => v !== '')

export const CCSS_LABEL = {
  al_dia: 'Inscrito — al día', morosidad: 'Inscrito — en morosidad',
  arreglo: 'Inscrito — arreglo de pago', no_inscrito: 'No inscrito',
}
export const SUGEF_LABEL = {
  no: 'No es sujeto obligado', 15: 'Sujeto obligado — Art. 15', '15bis': 'Sujeto obligado — Art. 15 bis',
  '15ter': 'Sujeto obligado — Art. 15 ter', pendiente: 'Inscripción pendiente / en trámite',
}
const TIPO_ID_PERSONA = {
  cedula: 'Cédula de identidad', 'cédula': 'Cédula de identidad', dimex: 'DIMEX', pasaporte: 'Pasaporte',
  'cédula jurídica': 'Cédula jurídica', 'cedula juridica': 'Cédula jurídica',
}
const SEXO_LABEL = { M: 'Masculino', F: 'Femenino', otro: 'Otro' }
const siNo = (v) => v === 'si' || v === true ? 'Sí' : v === 'no' || v === false ? 'No' : texto(v)

// Datos generales que llegan por el KYC (además de los clásicos de la ficha).
export function camposAdicionalesCliente(c = {}) {
  return conValor([
    ['Página web', c.pagina_web],
    ['Distrito', c.distrito],
    ['País(es) donde genera sus ingresos', c.paises_ingresos],
    ['Caducidad del documento de identidad', fechaCorta(c.venc_identificacion)],
    ['Origen de los fondos', c.origen_fondos],
    ['Inscripción CCSS', CCSS_LABEL[c.ccss_estado] || c.ccss_estado],
    ['Condición SUGEF (Ley 7786)', SUGEF_LABEL[c.sugef_estado] || c.sugef_estado],
  ])
}

// Empresa donde labora (persona física) — columna jsonb `empleador`.
export function camposEmpleador(emp) {
  if (!emp || typeof emp !== 'object') return []
  return conValor([
    ['Nombre comercial', emp.nombre_comercial],
    ['Razón social', emp.razon_social],
    ['Tipo de sociedad', emp.tipo_sociedad],
    ['Actividad', emp.actividad],
    ['Teléfono', emp.telefono],
    ['Correo de contacto', emp.correo],
    ['Página web', emp.web],
    ['Puesto que desempeña', emp.puesto],
    ['Tiempo de laborar en la empresa', emp.antiguedad],
  ])
}

// Condición PEP ampliada. Los detalles (puesto, tiempo, relación) viven en los
// datos de la solicitud KYC aprobada; si algún día pasan a columnas del cliente,
// se toman de ahí primero.
export function camposPep(c = {}, kyc = {}) {
  const k = kyc || {}
  const pick = (campo) => c[campo] ?? k[campo]
  const relacion = pick('pep_relacion')
  const junta = pick('pep_junta') ?? pick('pep_relacionados')
  return conValor([
    ['¿Es persona expuesta políticamente (PEP)?', c.pep === true ? 'Sí' : (k.pep ? siNo(k.pep) : (c.pep === false ? 'No' : ''))],
    ['Puesto PEP que ocupa u ocupó', pick('pep_puesto')],
    ['Tiempo desde que dejó el cargo', pick('pep_tiempo')],
    ['¿Algún miembro de junta, representante o socio es PEP?', junta ? siNo(junta) : ''],
    ['Detalle (quién, cargo y periodo)', pick('pep_junta_detalle')],
    ['¿Relación (consanguinidad/afinidad) con un PEP?', relacion ? siNo(relacion) : ''],
    ['Detalle de la relación con el PEP', pick('pep_relacion_detalle')],
  ])
}

// Hay algo PEP que valga la pena imprimir además del «No».
export const hayDetallePep = (pares) => pares.some(([l, v]) => !l.startsWith('¿Es persona') || v === 'Sí')

// Busca los datos de la última solicitud KYC aprobada del cliente (para el
// detalle PEP). Si no hay o falla, devuelve {} — nunca bloquea la impresión.
export async function datosKycDeCliente(clienteId) {
  if (!clienteId) return {}
  try {
    const { data } = await supabase.from('solicitudes_kyc').select('datos')
      .eq('cliente_id', clienteId).eq('estado', 'aprobada')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle()
    return data?.datos || {}
  } catch { return {} }
}

// ── Estructura de la persona jurídica ──
export function agruparPersonas(personas = []) {
  const ps = (personas || []).filter(p => p && p.nombre)
  return {
    representantes: ps.filter(p => p.tipo_relacion === 'representante_legal'),
    junta:          ps.filter(p => p.tipo_relacion === 'junta_directiva'),
    socios:         ps.filter(p => p.tipo_relacion === 'socio' && p.tipo_entidad !== 'persona_juridica'),
    sociosEmpresa:  ps.filter(p => p.tipo_relacion === 'socio' && p.tipo_entidad === 'persona_juridica'),
    otros:          ps.filter(p => !['representante_legal', 'junta_directiva', 'socio'].includes(p.tipo_relacion)),
  }
}

export function identificacionPersona(p = {}) {
  const tipo = TIPO_ID_PERSONA[String(p.tipo_id || p.tipo_identificacion || '').toLowerCase()] || texto(p.tipo_id || p.tipo_identificacion)
  return [tipo, texto(p.identificacion)].filter(Boolean).join(' ')
}

// Campos ampliados del representante legal (y de cualquier persona física).
export function camposPersona(p = {}) {
  return conValor([
    ['Identificación', identificacionPersona(p)],
    ['Caducidad del documento', fechaCorta(p.venc_identificacion)],
    ['Nacionalidad', p.nacionalidad],
    ['Fecha de nacimiento', fechaCorta(p.fecha_nacimiento)],
    ['País de nacimiento', p.pais_nacimiento],
    ['País de residencia', p.pais_residencia],
    ['Ocupación', p.ocupacion],
    ['Estado civil', p.estado_civil],
    ['Sexo', SEXO_LABEL[p.sexo] || p.sexo],
    ['Cargo', p.cargo],
    ['Dirección', p.direccion],
    ['Teléfono', p.telefono],
    ['Correo', p.correo],
  ])
}

// Representante(s) de un socio-empresa (sub_personas jsonb) en una línea.
export function subPersonasTexto(p = {}) {
  const subs = Array.isArray(p.sub_personas) ? p.sub_personas : []
  return subs.map(s => {
    if (!s || typeof s !== 'object') return texto(s)
    const rol = s.tipo_relacion === 'representante_legal' ? 'Rep. legal' : texto(s.tipo_relacion).replace(/_/g, ' ')
    const pct = s.porcentaje_participacion != null && s.porcentaje_participacion !== '' ? ` (${s.porcentaje_participacion}%)` : ''
    return [rol, [texto(s.nombre), texto(s.identificacion)].filter(Boolean).join(' — ')].filter(Boolean).join(': ') + pct
  }).filter(Boolean).join(' · ')
}

export const porcentaje = (v) => (v === null || v === undefined || v === '') ? '' : `${v}%`
