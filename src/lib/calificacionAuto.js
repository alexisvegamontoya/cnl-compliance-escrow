// Calificación de riesgo AUTOMÁTICA (headless) para el flujo de aprobación KYC.
// Replica el mapeo cliente→factores de CalificacionRiesgo.preLlenarDesdeDB y el
// cálculo/persistencia de guardar(), sin UI ni transacciones (el cliente es nuevo).
import { supabase } from './supabase'
import {
  calcularScoreFactor, calcularScoreTotal, clasificar,
  criteriosPerfil, pesosPerfil, listaPaisPerfil,
  PAISES_RIESGO, PAISES_ALTO_RIESGO_FT, ACTIVIDADES_PROFESIONES,
} from './metodologiaRiesgo'

const conListas = (n) => ['COINCIDENCIA', 'REVISAR', 'alerta', 'revisar'].includes(n)

export function construirRespuestas(c, { claseDato = 0, variante = null, listasNivel = null, tipoPersona = null } = {}) {
  const tipoId = Number(c?.tipo_identificacion)
  const esFisica = tipoPersona ? tipoPersona === 'fisica' : [1, 3, 5].includes(tipoId)
  const listaPais = listaPaisPerfil(claseDato, variante) || []
  const usaFT = listaPais.includes('FT')
  const riesgoDe = (nombre) => {
    if (!nombre) return 1
    if (usaFT && PAISES_ALTO_RIESGO_FT.some(p => p.toLowerCase().includes(nombre.toLowerCase()))) return 3
    return PAISES_RIESGO.find(p => p.pais?.toLowerCase().includes(nombre.toLowerCase()))?.riesgo || 1
  }
  const paisOrigen = c?.pais_nacimiento || c?.pais_constitucion || c?.nacionalidad || ''
  const paisRes = c?.pais_ubicacion || c?.pais_residencia || ''
  const rOrig = riesgoDe(paisOrigen)
  const rRes = riesgoDe(paisRes)
  const respGeo = {
    pais_origen_nombre: paisOrigen, pais_origen: rOrig,
    residencia_nombre: paisRes, residencia: rRes,
    ubicacion_geo: rOrig, casa_matriz: rOrig,
    transfronterizo: c?.opera_transfronterizo ?? (rOrig > 1 || rRes > 1 ? 2 : 0.5),
    op_nacional: (c?.canton || c?.provincia) ? 0.5 : 1,
    op_internacional: c?.opera_internacional ?? 0.5,
  }
  const actVal = esFisica
    ? (Number(c?.profesion_valor) || (c?.profesion_nombre ? (ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === c.profesion_nombre.toLowerCase())?.valor || 1) : 1))
    : (Number(c?.actividad_eco_valor) || (c?.actividad_eco_nombre ? (ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === c.actividad_eco_nombre.toLowerCase())?.valor || 1) : 1))
  const ing = parseFloat(c?.ingreso_mensual_est) || 0
  const ingVal = ing > 6000 ? 1 : ing > 4000 ? 1.5 : ing > 2000 ? 2 : ing > 1000 ? 2.5 : ing > 0 ? 3 : 1
  const actNombre = esFisica ? (c?.profesion_nombre || '') : (c?.actividad_eco_nombre || '')
  let anosVal = 1
  if (c?.fecha_constitucion) {
    const anos = (Date.now() - new Date(c.fecha_constitucion).getTime()) / (365.25 * 24 * 3600 * 1000)
    anosVal = anos > 8 ? 0.5 : anos >= 6 ? 1 : anos >= 3 ? 2 : 3
  }
  const listasVal = conListas(listasNivel) ? 3 : 1
  const respCliente = {
    profesion: actVal, profesion_nombre: c?.profesion_nombre || '',
    actividad_eco: actVal, actividad_eco_nombre: c?.actividad_eco_nombre || '',
    ingreso_mensual: ingVal, info_ingreso: ingVal,
    pep: c?.pep ? 3 : 1,
    acceso_info: 1,
    listas_obs: listasVal,
    efectivo: c?.manejo_efectivo ?? undefined,
    struct_admin: esFisica ? undefined : (c?.cant_personal ?? 1),
    struct_acc: c?.niveles_societarios ?? 1,
    anos_operacion: anosVal,
    vol_trans: 0.5, cant_trans: 0.5, // cliente nuevo: aún sin transacciones
  }
  const respProductos = {
    servicios: actVal, servicios_nombre: actNombre, anos_exp: anosVal,
    posicion_mkt: c?.posicion_mercado ?? undefined,
    struct_ventas: c?.estructura_ventas ?? undefined,
  }
  const respCanales = {
    como_labor: c?.situacion_laboral ?? undefined,
    cant_lugares: c?.cant_lugares ?? undefined,
    cant_sucursales: c?.cant_sucursales ?? undefined,
    tipo_vendedor: c?.tipo_vendedor ?? undefined,
  }
  return { respCliente, respGeo, respProductos, respCanales, esFisica }
}

export function calificarCliente(c, { claseDato = 0, variante = null, listasNivel = null, tipoPersona: tp = null } = {}) {
  const { respCliente, respGeo, respProductos, respCanales, esFisica } =
    construirRespuestas(c, { claseDato, variante, listasNivel, tipoPersona: tp })
  const tipoPersona = tp || (esFisica ? 'fisica' : 'juridica')
  const scoreCli = calcularScoreFactor(respCliente, criteriosPerfil(claseDato, tipoPersona, 'cliente', variante))
  const scoreGeo = calcularScoreFactor(respGeo, criteriosPerfil(claseDato, tipoPersona, 'geo', variante))
  const scoreProd = calcularScoreFactor(respProductos, criteriosPerfil(claseDato, tipoPersona, 'productos', variante))
  const scoreCan = calcularScoreFactor(respCanales, criteriosPerfil(claseDato, tipoPersona, 'canales', variante))
  const pesos = pesosPerfil(claseDato, tipoPersona, variante)
  const scoreTotal = calcularScoreTotal(
    { cliente: scoreCli, geo: scoreGeo, productos: scoreProd, canales: scoreCan }, tipoPersona, pesos)
  const calificacionAuto = clasificar(scoreTotal)
  let calificacionManual = null
  let observaciones = 'Calificación preliminar generada automáticamente al aprobar la recolección KYC.'
  if (c?.sugef_estado === 'pendiente') {
    calificacionManual = 'alto'
    observaciones += ' ALERTA: cliente con inscripción SUGEF pendiente (Ley 7786); no se recomienda aceptar hasta regularizar.'
  }
  const calificacionFinal = calificacionManual || calificacionAuto
  return {
    tipoPersona, respCliente, respGeo, respProductos, respCanales,
    scoreCli, scoreGeo, scoreProd, scoreCan, scoreTotal,
    calificacionAuto, calificacionManual, calificacionFinal, observaciones,
  }
}

export async function persistirCalificacion({ tenantId, clienteId, calificadorId, result }) {
  const hoy = new Date().toISOString().slice(0, 10)
  await supabase.from('calificaciones_riesgo').update({ vigente: false }).eq('cliente_id', clienteId)
  await supabase.from('calificaciones_riesgo').insert({
    tenant_id: tenantId, cliente_id: clienteId, tipo_persona: result.tipoPersona,
    resp_cliente: result.respCliente, resp_geo: result.respGeo,
    resp_productos: result.respProductos, resp_canales: result.respCanales,
    score_cliente: result.scoreCli, score_geo: result.scoreGeo,
    score_productos: result.scoreProd, score_canales: result.scoreCan,
    score_total: result.scoreTotal,
    calificacion: result.calificacionAuto, calificacion_manual: result.calificacionManual,
    observaciones: result.observaciones, calificador_id: calificadorId,
    fecha_calificacion: hoy, vigente: true,
  })
  await supabase.from('clientes').update({ calificacion_riesgo: result.calificacionFinal }).eq('id', clienteId)
  try {
    await supabase.from('clientes').update({
      nivel_riesgo_actual: result.calificacionFinal, estado_calificacion: 'completado',
      fecha_ultima_calificacion: hoy, fecha_calificacion_riesgo: hoy,
    }).eq('id', clienteId)
  } catch { /* columnas extendidas opcionales */ }
  return result
}
