// ============================================================
// Nivel de Cumplimiento — cálculo compartido (fuente única de verdad)
// Usado por el módulo por-sujeto (ComplianceDashboard) y por el tablero
// global de superadmin. Si se agrega/quita un ítem aquí, ambos lo reflejan.
// ============================================================
import { calcularCumplimientoGlobal } from './checklistDocumental'

// Peso de cada ítem sobre el total (suma 100).
export const PESOS = { i1: 25, i2: 7, i3: 20, i4: 15, i5: 5, i6: 8, i7: 15, i8: 5 }

export function mesesDesde(fecha) {
  if (!fecha) return 999
  const desde = new Date(fecha)
  const ahora = new Date()
  return (ahora.getFullYear() - desde.getFullYear()) * 12 + (ahora.getMonth() - desde.getMonth())
}

// Deriva los ítems manuales desde el registro compliance_seguimiento del tenant.
export function derivarSeguimiento(seg) {
  return {
    fCapacitacion: { completa: seg?.capacitacion_completa || false, fecha: seg?.fecha_capacitacion || '' },
    fSistemas:     { actualizado: seg?.sistemas_actualizados || false, fecha: seg?.fecha_sistemas || '' },
    fEvalRiesgo:   { fecha: seg?.fecha_evaluacion_riesgo || '' },
    fInformes: {
      labores:           seg?.fecha_informe_labores      || '',
      plan_trabajo:      seg?.fecha_plan_trabajo         || '',
      plan_capacitacion: seg?.fecha_plan_capacitacion    || '',
    },
  }
}

export function etiquetaCumplimiento(scoreGlobal) {
  return scoreGlobal >= 80 ? 'Cumplimiento alto'
    : scoreGlobal >= 60 ? 'Cumplimiento moderado'
    : scoreGlobal >= 40 ? 'Cumplimiento bajo'
    : 'Cumplimiento crítico'
}

// Etiquetas de los ítems (para columnas de la matriz).
export const ITEMS_LABELS = [
  'Actualización información de clientes',
  'Capacitación anual del personal',
  'Normativa interna vigente',
  'Reporte SICVECA actualizado',
  'Sistemas SUGEF/UIF actualizados',
  'Informe de monitoreo actualizado',
  'Evaluación de Riesgo LC/FT actualizada',
  'Informes ALA/CFT (Labores, PT, PC)',
]

// Cálculo principal. Recibe el tenant y sus datos ya cargados.
export function calcularNivelCumplimiento({
  tenant, clientes = [], normativa = [], transacciones = [], informes = [],
  seguimiento = null, seguimientoDerivado = null, catalogoDoc = undefined,
}) {
  const tipoSujeto = Number(tenant?.tipo_sujeto) || 1
  // El dashboard pasa su estado editable en vivo (seguimientoDerivado); el
  // tablero global pasa el registro crudo (seguimiento).
  const { fCapacitacion, fSistemas, fEvalRiesgo, fInformes } = seguimientoDerivado || derivarSeguimiento(seguimiento)

  // Ítem 1: actualización de la información de clientes (calificación global de la cartera).
  const globalClientes = calcularCumplimientoGlobal(clientes, catalogoDoc)
  const scoreI1 = globalClientes.score
  const pendientesI1 = globalClientes.detalle
    .filter(d => d.score < 100)
    .slice(0, 10)
    .map(d => {
      const c = d.cliente
      const nombre = c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim() || c.numero_identificacion
      const top = d.faltantes.slice(0, 3).join(' · ')
      return `${nombre} (${d.score}/100): ${top}${d.faltantes.length > 3 ? ` …y ${d.faltantes.length - 3} más` : ''}`
    })

  // Ítem 2: capacitación anual.
  const scoreI2 = fCapacitacion.completa ? 100 : 0

  // Ítem 3: normativa interna vigente.
  const mesesValidezNorm = tipoSujeto === 1 ? 12 : tipoSujeto === 2 ? 24 : 36
  const pendientesI3 = []
  let normVigentes = 0
  for (const doc of normativa) {
    const fechaBase = doc.fecha_aprobacion_jd || doc.fecha_vigencia
    if (!fechaBase) {
      pendientesI3.push(`"${doc.nombre || doc.tipo}" sin fecha de aprobación JD`)
      continue
    }
    const meses = mesesDesde(fechaBase)
    if (meses > mesesValidezNorm) {
      pendientesI3.push(`"${doc.nombre || doc.tipo}" desactualizado (aprobado hace ${meses} meses, máx ${mesesValidezNorm})`)
    } else {
      normVigentes++
    }
  }
  const scoreI3 = normativa.length === 0 ? 0 : (normVigentes / normativa.length) * 100

  // Ítem 4: reporte SICVECA.
  const mesesFrecSicveca = tipoSujeto === 1 ? 2 : tipoSujeto === 2 ? 3 : 4
  const pendientesI4 = []
  let scoreI4 = 0
  if (transacciones.length > 0 && transacciones[0].periodo) {
    const meses = mesesDesde(transacciones[0].periodo)
    if (meses <= mesesFrecSicveca) {
      scoreI4 = 100
    } else {
      scoreI4 = Math.max(0, 100 - ((meses - mesesFrecSicveca) / mesesFrecSicveca) * 100)
      pendientesI4.push(`Último período: ${transacciones[0].periodo} (hace ${meses} meses; tipo ${tipoSujeto} debe reportar cada ${mesesFrecSicveca} meses)`)
    }
  } else {
    pendientesI4.push('No hay transacciones SICVECA registradas.')
  }

  // Ítem 5: sistemas SUGEF/UIF.
  const scoreI5 = fSistemas.actualizado ? 100 : 0

  // Ítem 6: informe de monitoreo.
  const pendientesI6 = []
  let scoreI6 = 0
  if (informes.length > 0) {
    const meses = mesesDesde(informes[0].fecha_generacion)
    if (meses <= 6) scoreI6 = 100
    else if (meses <= 12) { scoreI6 = 50; pendientesI6.push(`Informe generado hace ${meses} meses (recomendado: máx 6)`) }
    else { scoreI6 = 0; pendientesI6.push(`Informe de monitoreo desactualizado (${meses} meses) — generar nuevo informe`) }
  } else {
    pendientesI6.push('No se ha generado ningún informe de monitoreo.')
  }

  // Ítem 7: evaluación de riesgo LC/FT.
  const mesesVigenciaEval = tipoSujeto === 1 ? 24 : 12
  const pendientesI7 = []
  let scoreI7 = 0
  if (fEvalRiesgo.fecha) {
    const meses = mesesDesde(fEvalRiesgo.fecha)
    if (meses <= mesesVigenciaEval) {
      scoreI7 = 100
      if (meses > mesesVigenciaEval - 2) {
        pendientesI7.push(`Evaluación próxima a vencer (${meses} meses, vigencia máx ${mesesVigenciaEval} meses)`)
      }
    } else {
      scoreI7 = 0
      pendientesI7.push(`Evaluación de riesgo VENCIDA (realizada hace ${meses} meses, vigencia máx ${mesesVigenciaEval} meses — Tipo ${tipoSujeto})`)
    }
  } else {
    pendientesI7.push('No se ha registrado la fecha de la última evaluación de riesgo LC/FT/FPADM.')
  }

  // Ítem 8: informes ALA/CFT (Labores, Plan de Trabajo, Plan de Capacitación).
  const pendientesI8 = []
  const informesDefs = [
    { key: 'labores',           label: 'Informe de Labores',    fecha: fInformes.labores },
    { key: 'plan_trabajo',      label: 'Plan de Trabajo',       fecha: fInformes.plan_trabajo },
    { key: 'plan_capacitacion', label: 'Plan de Capacitación',  fecha: fInformes.plan_capacitacion },
  ]
  let informesVigentes = 0
  for (const inf of informesDefs) {
    if (!inf.fecha) {
      pendientesI8.push(`${inf.label}: no registrado`)
    } else {
      const m = mesesDesde(inf.fecha)
      if (m > 12) pendientesI8.push(`${inf.label}: vencido (elaborado hace ${m} meses, máx 12)`)
      else informesVigentes++
    }
  }
  const scoreI8 = (informesVigentes / 3) * 100

  // Score global (ponderado).
  const scoreGlobal = (
    scoreI1 * PESOS.i1 + scoreI2 * PESOS.i2 + scoreI3 * PESOS.i3 + scoreI4 * PESOS.i4 +
    scoreI5 * PESOS.i5 + scoreI6 * PESOS.i6 + scoreI7 * PESOS.i7 + scoreI8 * PESOS.i8
  ) / 100

  const items = [
    { num: 1, label: ITEMS_LABELS[0], score: scoreI1, peso: PESOS.i1, pendientes: pendientesI1 },
    { num: 2, label: ITEMS_LABELS[1], score: scoreI2, peso: PESOS.i2, pendientes: fCapacitacion.completa ? [] : ['Registrar capacitación anual completada'] },
    { num: 3, label: ITEMS_LABELS[2], score: scoreI3, peso: PESOS.i3, pendientes: pendientesI3 },
    { num: 4, label: ITEMS_LABELS[3], score: scoreI4, peso: PESOS.i4, pendientes: pendientesI4 },
    { num: 5, label: ITEMS_LABELS[4], score: scoreI5, peso: PESOS.i5, pendientes: fSistemas.actualizado ? [] : ['Confirmar actualización en sistemas SUGEF/UIF'] },
    { num: 6, label: ITEMS_LABELS[5], score: scoreI6, peso: PESOS.i6, pendientes: pendientesI6 },
    { num: 7, label: ITEMS_LABELS[6], score: scoreI7, peso: PESOS.i7, pendientes: pendientesI7 },
    { num: 8, label: ITEMS_LABELS[7], score: scoreI8, peso: PESOS.i8, pendientes: pendientesI8 },
  ]

  return {
    items, scoreGlobal, etiqueta: etiquetaCumplimiento(scoreGlobal),
    globalClientes, tipoSujeto,
    fCapacitacion, fSistemas, fEvalRiesgo, fInformes,
    // Valores derivados que usa el detalle del dashboard por-sujeto.
    mesesValidezNorm, normVigentes, mesesFrecSicveca, mesesVigenciaEval, informesVigentes,
  }
}
