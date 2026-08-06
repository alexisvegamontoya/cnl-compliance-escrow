import { useState, useCallback, useMemo } from 'react'
import { supabase, traerTodo } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { imprimirDocumento, esc, escMultilinea, fechaLarga } from '../../utils/imprimirDocumento'

const anioActual = new Date().getFullYear()

const fmtUSD   = n => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })
const fmtFecha  = f => f
  ? new Date(String(f).length > 10 ? f : f + 'T12:00:00')
      .toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })
  : '—'
const plural = (n, sing, plu) => `${n} ${n === 1 ? sing : plu}`
const dentroDe = (fecha, anio) => !!fecha && String(fecha).substring(0, 4) === String(anio)

// La calificación efectiva es la manual cuando el Oficial la ajustó.
// Los valores en base son minúsculas: bajo / medio / alto / muy_alto.
const nivelDe = c => (c.calificacion_manual || c.calificacion || '').toLowerCase()
const esAlto  = c => ['alto', 'muy_alto'].includes(nivelDe(c))

const TIPO_INFORME_LABEL = {
  transaccional: 'Informe de monitoreo transaccional',
  labores:       'Informe de labores',
  plan_trabajo:  'Plan de trabajo',
  capacitacion:  'Plan de capacitación',
}

async function registrarInforme(tenantId, anio, profileId, profileNombre, resumen) {
  try {
    await supabase.from('informes_generados').insert({
      tenant_id: tenantId, tipo_informe: 'labores', periodo: String(anio),
      generado_por: profileId, generado_por_nombre: profileNombre,
      resumen_json: resumen,
    })
  } catch { /* tabla puede no existir aún */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de texto editable. Todo lo narrativo del informe pasa por acá: se
// muestra una redacción sugerida y el Oficial de Cumplimiento la ajusta.
// ─────────────────────────────────────────────────────────────────────────────
function TextoEditable({ valor, onChange, sugerido, filas = 4 }) {
  return (
    <div className="space-y-1">
      <textarea
        className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:border-[#0a1247] print:border-0"
        style={{ minHeight: filas * 26 }}
        value={valor}
        onChange={e => onChange(e.target.value)}
        placeholder={sugerido}
      />
      {!valor.trim() && (
        <p className="text-xs text-gray-400">
          Se usará el texto sugerido. Escriba acá para reemplazarlo.
        </p>
      )}
    </div>
  )
}

function Stats({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      {items.map(s => (
        <div key={s.label} className="bg-gray-50 rounded-lg p-3">
          <p className={`text-lg font-bold ${s.color || 'text-[#0a1247]'}`}>{s.val}</p>
          <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function Seccion({ num, titulo, children }) {
  return (
    <section className="card space-y-3">
      <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">{num}. {titulo}</h3>
      {children}
    </section>
  )
}

export default function InformeLaborales({ tenantEfectivo }) {
  const { tenant: tenantPropio, profile } = useAuth()
  const tenant = tenantEfectivo || tenantPropio
  const [anio, setAnio]         = useState(anioActual - 1)
  const [loading, setLoading]   = useState(false)
  const [generado, setGenerado] = useState(false)
  const [datos, setDatos]       = useState(null)
  const [guardado, setGuardado] = useState(false)

  // Todos los textos narrativos del informe, editables. Vacío = usar sugerido.
  const [textos, setTextos] = useState({})
  const setTexto = (k, v) => setTextos(p => ({ ...p, [k]: v }))

  // Fecha prevista de envío de la normativa a aprobación de Junta Directiva
  const [envioNormativa, setEnvioNormativa] = useState('')

  const cargar = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`
    const hastaTs = hasta + 'T23:59:59'

    const [
      { data: normativas },
      { data: txns },
      { data: periodos },
      { data: dds },
      { data: ros },
      { data: denuncias },
      { data: calificaciones },
      { data: seguimiento },
      { data: clientesNuevos },
      { data: clientesActualizados },
      { data: informes },
    ] = await Promise.all([
      // La columna es fecha_aprobacion_jd; se incluye también lo actualizado
      // en el período aunque su aprobación sea anterior.
      supabase.from('normativa').select('*').eq('tenant_id', tenant.id).eq('activo', true),
      // Paginado: con el tope de 1000 filas los totales del año salían cortos.
      traerTodo(() => supabase.from('transacciones').select('monto_movimiento, periodo')
        .eq('tenant_id', tenant.id)
        .gte('periodo', desde).lte('periodo', hasta).order('id')),
      supabase.from('periodos_declarados').select('*').eq('tenant_id', tenant.id)
        .gte('periodo', desde).lte('periodo', hasta),
      supabase.from('expedientes_dd').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hastaTs),
      supabase.from('reportes_ros').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hastaTs),
      supabase.from('denuncias').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hastaTs),
      supabase.from('calificaciones_riesgo').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hastaTs),
      supabase.from('compliance_seguimiento').select('*').eq('tenant_id', tenant.id).maybeSingle(),
      supabase.from('clientes').select('id, nombre_cliente, primer_apellido, nombre_empresa, numero_identificacion, created_at, updated_at, calificacion_riesgo, activo')
        .eq('tenant_id', tenant.id).gte('created_at', desde).lte('created_at', hastaTs)
        .order('created_at'),
      supabase.from('clientes').select('id, nombre_cliente, primer_apellido, nombre_empresa, numero_identificacion, created_at, updated_at, calificacion_riesgo, activo')
        .eq('tenant_id', tenant.id).gte('updated_at', desde).lte('updated_at', hastaTs)
        .order('updated_at'),
      supabase.from('informes_generados').select('*').eq('tenant_id', tenant.id)
        .gte('fecha_generacion', desde).lte('fecha_generacion', hastaTs)
        .order('fecha_generacion'),
    ])

    const nuevos = clientesNuevos || []
    const idsNuevos = new Set(nuevos.map(c => c.id))
    // Actualizados = modificados en el período pero dados de alta antes
    const actualizados = (clientesActualizados || []).filter(c => !idsNuevos.has(c.id))

    const norm = normativas || []
    const normAprobadas   = norm.filter(n => dentroDe(n.fecha_aprobacion_jd, anio))
    const normActualizada = norm.filter(n =>
      !dentroDe(n.fecha_aprobacion_jd, anio) &&
      (dentroDe(n.updated_at, anio) || dentroDe(n.created_at, anio)))

    const infs = informes || []
    const porTipo = t => infs.filter(i => i.tipo_informe === t)

    setDatos({
      normAprobadas,
      normActualizada,
      txns: txns || [],
      totalMonto: (txns || []).reduce((s, t) => s + Number(t.monto_movimiento || 0), 0),
      periodosConMov: (periodos || []).filter(p => p.tipo === 'con_movimiento').length,
      periodosSinMov: (periodos || []).filter(p => p.tipo === 'sin_movimiento').length,
      dds: dds || [],
      ros: ros || [],
      denuncias: denuncias || [],
      calificaciones: calificaciones || [],
      clientesNuevos: nuevos,
      clientesActualizados: actualizados,
      // Ítems del módulo de Nivel de Cumplimiento, acotados al período
      capacitacion:       seguimiento?.capacitacion_completa || false,
      fechaCapacitacion:  seguimiento?.fecha_capacitacion || null,
      uifActualizada:     !!seguimiento?.sistemas_actualizados && dentroDe(seguimiento?.fecha_sistemas, anio),
      fechaUif:           seguimiento?.fecha_sistemas || null,
      evalRiesgoEnPeriodo: dentroDe(seguimiento?.fecha_evaluacion_riesgo, anio),
      fechaEvalRiesgo:    seguimiento?.fecha_evaluacion_riesgo || null,
      informesMonitoreo:  porTipo('transaccional'),
      informesPlanTrabajo: porTipo('plan_trabajo'),
      informesCapacitacion: porTipo('capacitacion'),
    })
    setGenerado(true)
    setLoading(false)

    await registrarInforme(
      tenant.id, anio, profile?.id, profile?.nombre,
      { anio, txns_total: (txns || []).length, ros_total: (ros || []).length,
        dds_total: (dds || []).length, clientes_nuevos: nuevos.length,
        clientes_actualizados: actualizados.length }
    )
    setGuardado(true)
  }, [tenant, anio, profile])

  // ── Redacciones sugeridas, calculadas a partir de los datos del período ──
  const sug = useMemo(() => {
    const d = datos
    const entidad = tenant?.nombre || 'la entidad'
    if (!d) return {}
    return {
      intro: `El presente informe tiene por objeto rendir cuenta a la Junta Directiva de ${entidad} sobre las labores desarrolladas por el Oficial de Cumplimiento durante el período comprendido del 1 de enero al 31 de diciembre de ${anio}, en cumplimiento de las disposiciones establecidas en la Ley 7786 y sus reformas, así como los Acuerdos SUGEF vigentes en materia de prevención de Legitimación de Capitales, Financiamiento al Terrorismo y Financiamiento a la Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM).`,

      clientes: `Durante el período ${anio} se incorporaron ${plural(d.clientesNuevos.length, 'nuevo cliente', 'nuevos clientes')} a la cartera y se actualizaron los expedientes de ${plural(d.clientesActualizados.length, 'cliente', 'clientes')} ya vinculados. Cada incorporación se sometió al proceso de debida diligencia establecido en el Acuerdo SUGEF 13-19, verificando identidad, propósito de la relación comercial y origen de fondos.`,

      normativa: d.normAprobadas.length || d.normActualizada.length
        ? `Durante el período ${anio} se aprobaron ${plural(d.normAprobadas.length, 'documento normativo', 'documentos normativos')} por parte de la Junta Directiva y se actualizaron ${plural(d.normActualizada.length, 'documento', 'documentos')} del cuerpo normativo interno.`
        : `Durante el período ${anio} no se registraron aprobaciones ni actualizaciones de normativa interna.`,

      sicveca: `Durante el período ${anio} se realizó el monitoreo mensual de transacciones en el sistema SICVECA, reportando ${plural(d.periodosConMov, 'mes', 'meses')} con actividad transaccional y ${plural(d.periodosSinMov, 'mes', 'meses')} sin movimiento, totalizando ${d.txns.length} transacciones por un monto de USD ${fmtUSD(d.totalMonto)}.`,

      dd: d.dds.length
        ? `Se gestionaron ${plural(d.dds.length, 'expediente', 'expedientes')} de debida diligencia durante el período, conforme a los artículos 21 a 28 del Acuerdo SUGEF 13-19.`
        : `No se registraron expedientes de debida diligencia durante ${anio}.`,

      ros: d.ros.length
        ? `Durante el período ${anio} se elaboraron ${plural(d.ros.length, 'Reporte de Operación Sospechosa', 'Reportes de Operaciones Sospechosas')} y se remitieron a la Unidad de Inteligencia Financiera (UIF) del ICD.`
        : `Durante el período ${anio} no se identificaron operaciones que ameritaran la presentación de un Reporte de Operación Sospechosa ante la Unidad de Inteligencia Financiera del ICD.`,

      denuncias: d.denuncias.length
        ? `Durante el período ${anio} se recibieron ${plural(d.denuncias.length, 'denuncia', 'denuncias')} a través del canal confidencial, las cuales fueron atendidas conforme al procedimiento interno establecido.`
        : `No se recibieron denuncias a través del canal confidencial durante el período ${anio}.`,

      calificacion: `Se practicaron ${plural(d.calificaciones.length, 'calificación de riesgo', 'calificaciones de riesgo')} de clientes durante el período, aplicando la Metodología N06 conforme al Acuerdo SUGEF 13-19, de las cuales ${plural(d.calificaciones.filter(esAlto).length, 'resultó', 'resultaron')} en nivel alto.`,

      cumplimiento: [
        d.uifActualizada
          ? `La información de la entidad en los sistemas de SUGEF y de la Unidad de Inteligencia Financiera fue actualizada el ${fmtFecha(d.fechaUif)}.`
          : `No se registró actualización de la información en los sistemas de SUGEF y de la Unidad de Inteligencia Financiera dentro del período ${anio}.`,
        d.evalRiesgoEnPeriodo
          ? `La Evaluación de Riesgo institucional LC/FT/FPADM se actualizó el ${fmtFecha(d.fechaEvalRiesgo)}.`
          : `No se registró actualización de la Evaluación de Riesgo institucional LC/FT/FPADM dentro del período ${anio}.`,
      ].join('\n\n'),

      informes: `Durante el período se elaboraron ${plural(d.informesMonitoreo.length, 'informe de monitoreo', 'informes de monitoreo')}, ${plural(d.informesPlanTrabajo.length, 'plan de trabajo', 'planes de trabajo')} y ${plural(d.informesCapacitacion.length, 'plan de capacitación', 'planes de capacitación')}, los cuales fueron puestos en conocimiento de la Junta Directiva.`,

      capacitacion: d.capacitacion
        ? `El personal de la entidad recibió capacitación en materia de prevención de LC/FT/FPADM según lo establecido en el Acuerdo SUGEF 11-18${d.fechaCapacitacion ? `, realizada el ${fmtFecha(d.fechaCapacitacion)}` : ''}.`
        : `No se registró capacitación anual completada en el sistema durante el período ${anio}.`,

      otras: '',

      conclusiones: `Con base en las labores desarrolladas durante el período ${anio}, el suscrito Oficial de Cumplimiento concluye que la entidad ha mantenido los controles necesarios para prevenir el uso de sus servicios en actividades de LC/FT/FPADM.

Se recomienda a la Junta Directiva:
1. Continuar apoyando las iniciativas de cumplimiento y los recursos asignados al área.
2. Aprobar el Plan de Trabajo y el Plan de Capacitación para el año ${anio + 1}.
3. Mantener actualizados los expedientes de debida diligencia de clientes de alto riesgo.`,
    }
  }, [datos, anio, tenant])

  // Texto final de cada bloque: lo escrito por el usuario o la sugerencia
  const t = k => (textos[k]?.trim() ? textos[k] : (sug[k] || ''))

  const nombreCliente = c =>
    c.nombre_empresa || [c.nombre_cliente, c.primer_apellido].filter(Boolean).join(' ') || c.numero_identificacion || '—'

  const imprimir = () => {
    if (!datos) return
    const d = datos

    const stat = (val, lbl, color = '') =>
      `<div class="stat"><div class="val ${color}">${esc(val)}</div><div class="lbl">${esc(lbl)}</div></div>`
    const texto = s => `<div class="texto">${escMultilinea(s)}</div>`

    const tablaClientes = (lista, campoFecha, etiqueta) => lista.length
      ? `<table class="datos" style="margin-top:8px">
           <thead><tr><th>Cliente</th><th style="width:22%">Identificación</th><th style="width:24%">${esc(etiqueta)}</th><th class="centro" style="width:14%">Riesgo</th></tr></thead>
           <tbody>${lista.map(c => `
             <tr>
               <td>${esc(nombreCliente(c))}</td>
               <td>${esc(c.numero_identificacion || '—')}</td>
               <td>${esc(fmtFecha(String(c[campoFecha] || '').substring(0, 10)))}</td>
               <td class="centro">${esc(c.calificacion_riesgo || '—')}</td>
             </tr>`).join('')}</tbody>
         </table>`
      : ''

    const tablaNormativa = lista => lista.length
      ? `<table class="datos" style="margin-top:8px">
           <thead><tr><th>Documento</th><th style="width:20%">Tipo</th><th style="width:22%">Fecha</th><th class="centro" style="width:10%">Versión</th></tr></thead>
           <tbody>${lista.map(n => `
             <tr>
               <td>${esc(n.nombre)}</td>
               <td>${esc(n.tipo_documento || n.tipo || '—')}</td>
               <td>${esc(fmtFecha(n.fecha_aprobacion_jd || String(n.updated_at || '').substring(0, 10)))}</td>
               <td class="centro">${esc(n.version || '1.0')}</td>
             </tr>`).join('')}</tbody>
         </table>`
      : ''

    const tablaInformes = lista => lista.length
      ? `<table class="datos" style="margin-top:8px">
           <thead><tr><th>Informe</th><th style="width:20%">Período</th><th style="width:24%">Fecha</th><th style="width:26%">Elaborado por</th></tr></thead>
           <tbody>${lista.map(i => `
             <tr>
               <td>${esc(TIPO_INFORME_LABEL[i.tipo_informe] || i.tipo_informe)}</td>
               <td>${esc(i.periodo || '—')}</td>
               <td>${esc(fmtFecha(String(i.fecha_generacion || i.created_at || '').substring(0, 10)))}</td>
               <td>${esc(i.generado_por_nombre || '—')}</td>
             </tr>`).join('')}</tbody>
         </table>`
      : `<p class="vacio">No se registraron informes de este tipo durante ${anio}.</p>`

    const avisoEnvio = envioNormativa.trim()
      ? `<div class="aviso warn" style="margin-top:8px"><strong>Envío a aprobación de Junta Directiva:</strong> ${esc(envioNormativa)}</div>`
      : ''

    const todosInformes = [...d.informesMonitoreo, ...d.informesPlanTrabajo, ...d.informesCapacitacion]

    const cuerpo = `
      <div class="portada">
        <div class="confidencial">Confidencial — Uso exclusivo Junta Directiva</div>
        <h1>INFORME DE LABORES</h1>
        <h2>Oficial de Cumplimiento ALA/CFT</h2>
        <div class="periodo">Período: 1 de enero al 31 de diciembre de ${anio}</div>
        <div class="meta-grid">
          <div class="meta-item"><div class="lbl">Entidad</div><div class="val">${esc(tenant?.nombre || '—')}</div></div>
          <div class="meta-item"><div class="lbl">Actividad APNFD</div><div class="val">${esc(tenant?.actividad_apnfd || '—')}</div></div>
          <div class="meta-item"><div class="lbl">Oficial de Cumplimiento</div><div class="val">${esc(profile?.nombre || '—')}</div></div>
          <div class="meta-item"><div class="lbl">Fecha de elaboración</div><div class="val">${esc(fechaLarga())}</div></div>
        </div>
      </div>

      <section class="bloque"><h3>I. Introducción</h3>${texto(t('intro'))}</section>

      <section class="bloque">
        <h3>II. Gestión de Clientes</h3>
        <div class="stats c3">
          ${stat(d.clientesNuevos.length, 'Clientes incorporados', 'verde')}
          ${stat(d.clientesActualizados.length, 'Expedientes actualizados')}
          ${stat(d.clientesNuevos.length + d.clientesActualizados.length, 'Total gestionados')}
        </div>
        ${texto(t('clientes'))}
        ${tablaClientes(d.clientesNuevos, 'created_at', 'Fecha de incorporación')}
        ${tablaClientes(d.clientesActualizados, 'updated_at', 'Última actualización')}
      </section>

      <section class="bloque">
        <h3>III. Normativa Interna</h3>
        ${texto(t('normativa'))}
        ${tablaNormativa(d.normAprobadas)}
        ${tablaNormativa(d.normActualizada)}
        ${avisoEnvio}
      </section>

      <section class="bloque">
        <h3>IV. Monitoreo Transaccional SICVECA</h3>
        <div class="stats c4">
          ${stat(d.txns.length, 'Total transacciones')}
          ${stat('USD ' + fmtUSD(d.totalMonto), 'Monto total reportado')}
          ${stat(d.periodosConMov, 'Meses con movimiento', 'verde')}
          ${stat(d.periodosSinMov, 'Meses sin movimiento', 'naranja')}
        </div>
        ${texto(t('sicveca'))}
      </section>

      <section class="bloque">
        <h3>V. Debida Diligencia de Clientes</h3>
        <div class="stats c2">
          ${stat(d.dds.length, 'Expedientes gestionados')}
          ${stat(d.clientesNuevos.length, 'Clientes nuevos con expediente')}
        </div>
        ${texto(t('dd'))}
      </section>

      <section class="bloque">
        <h3>VI. Reportes de Operaciones Sospechosas (ROS)</h3>
        ${texto(t('ros'))}
        ${d.ros.length ? `<table class="datos" style="margin-top:8px">
          <thead><tr><th class="centro" style="width:10%">N° ROS</th><th>Cliente</th><th style="width:24%">Fecha</th><th style="width:16%">Estado</th></tr></thead>
          <tbody>${d.ros.map((r, i) => `
            <tr>
              <td class="centro">${String(i + 1).padStart(3, '0')}</td>
              <td>${esc(r.nombre_sujeto || r.numero_identificacion || '—')}</td>
              <td>${esc(fmtFecha(String(r.created_at || '').substring(0, 10)))}</td>
              <td>${esc(r.estado || 'elaborado')}</td>
            </tr>`).join('')}</tbody></table>` : ''}
      </section>

      <section class="bloque">
        <h3>VII. Atención de Denuncias — Canal Confidencial</h3>
        <div class="stats c3">
          ${stat(d.denuncias.length, 'Denuncias recibidas')}
          ${stat(d.denuncias.filter(x => x.estado === 'en_proceso' || x.estado === 'en_revision').length, 'En proceso')}
          ${stat(d.denuncias.filter(x => x.estado === 'resuelta' || x.estado === 'resuelto' || x.estado === 'cerrada').length, 'Resueltas', 'verde')}
        </div>
        ${texto(t('denuncias'))}
      </section>

      <section class="bloque">
        <h3>VIII. Calificación de Riesgo de Clientes</h3>
        <div class="stats c3">
          ${stat(d.calificaciones.length, 'Calificaciones realizadas')}
          ${stat(d.calificaciones.filter(esAlto).length, 'Riesgo alto / muy alto', 'rojo')}
          ${stat(d.calificaciones.filter(c => !esAlto(c)).length, 'Riesgo bajo/medio', 'verde')}
        </div>
        ${texto(t('calificacion'))}
      </section>

      <section class="bloque">
        <h3>IX. Estado de Cumplimiento en el Período</h3>
        <div class="stats c2">
          ${stat(d.uifActualizada ? 'Sí' : 'No', 'Sistemas SUGEF/UIF actualizados', d.uifActualizada ? 'verde' : 'naranja')}
          ${stat(d.evalRiesgoEnPeriodo ? 'Sí' : 'No', 'Evaluación de Riesgo actualizada', d.evalRiesgoEnPeriodo ? 'verde' : 'naranja')}
        </div>
        ${texto(t('cumplimiento'))}
      </section>

      <section class="bloque">
        <h3>X. Informes Elaborados en el Período</h3>
        ${texto(t('informes'))}
        ${tablaInformes(todosInformes)}
      </section>

      <section class="bloque">
        <h3>XI. Capacitación en Materia ALA/CFT</h3>
        <div class="aviso ${d.capacitacion ? 'ok' : 'warn'}">${escMultilinea(t('capacitacion'))}</div>
      </section>

      ${t('otras').trim() ? `<section class="bloque">
        <h3>XII. Otras Labores Realizadas</h3>
        ${texto(t('otras'))}
      </section>` : ''}

      <section class="bloque">
        <h3>${t('otras').trim() ? 'XIII' : 'XII'}. Conclusiones y Recomendaciones</h3>
        ${texto(t('conclusiones'))}
      </section>

      <div class="firmas">
        <div class="firma">
          <div class="linea"></div>
          <div class="nombre">${esc(profile?.nombre || '—')}</div>
          <div class="cargo">Oficial de Cumplimiento ALA/CFT</div>
          <div class="fecha">${esc(tenant?.nombre || '')}</div>
        </div>
        <div class="firma">
          <div class="linea"></div>
          <div class="nombre">Recibido por Junta Directiva</div>
          <div class="cargo">Representante Legal</div>
          <div class="fecha">Fecha: ________________________</div>
        </div>
      </div>

      <div class="pie">
        Informe elaborado el ${esc(fechaLarga())} · CNL Craniley Compliance Services<br>
        Documento confidencial — Uso exclusivo de Junta Directiva
      </div>`

    imprimirDocumento({
      titulo: `Informe de Labores ${anio}`,
      subtitulo: 'Oficial de Cumplimiento ALA/CFT',
      cuerpo, tenant, profile,
    })
  }

  const d = datos

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Informe de Labores — Oficial de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Dirigido a Junta Directiva · Todo el texto es editable antes de imprimir</p>
        </div>
        {generado && (
          <button onClick={imprimir} className="btn-primary text-sm print:hidden">🖨️ Imprimir / PDF</button>
        )}
      </div>

      {/* Selector año */}
      <div className="card flex items-end gap-4">
        <div>
          <label className="label">Año del informe</label>
          <select className="input-field w-36" value={anio}
            onChange={e => { setAnio(Number(e.target.value)); setGenerado(false) }}>
            {[anioActual, anioActual - 1, anioActual - 2, anioActual - 3].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button onClick={cargar} disabled={loading} className="btn-primary">
          {loading ? 'Cargando…' : '▶ Generar informe'}
        </button>
        {tenant && (
          <div className="ml-auto text-sm text-gray-500">
            <p><span className="font-medium">Entidad:</span> {tenant.nombre}</p>
          </div>
        )}
      </div>

      {generado && d && (
        <div id="informe-labores" className="space-y-8 print:text-sm">

          {/* ── PORTADA ── */}
          <div className="card border-2 border-[#0a1247] bg-blue-50 print:border-0">
            <div className="text-center py-6 space-y-2">
              <p className="text-xs uppercase tracking-widest text-[#0a1247] font-semibold">Confidencial — Uso exclusivo Junta Directiva</p>
              <h2 className="text-2xl font-bold text-[#0a1247]">INFORME DE LABORES</h2>
              <h3 className="text-lg font-semibold text-gray-700">Oficial de Cumplimiento ALA/CFT</h3>
              <p className="text-gray-500">Período: 1 de enero al 31 de diciembre de {anio}</p>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-left">
                <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Entidad</p><p className="font-semibold text-gray-800">{tenant?.nombre}</p></div>
                <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Actividad APNFD</p><p className="font-semibold text-gray-800">{tenant?.actividad_apnfd || '—'}</p></div>
                <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Oficial de Cumplimiento</p><p className="font-semibold text-gray-800">{profile?.nombre}</p></div>
                <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Fecha de elaboración</p><p className="font-semibold text-gray-800">{new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div>
              </div>
            </div>
          </div>

          <Seccion num="I" titulo="Introducción">
            <TextoEditable valor={textos.intro || ''} onChange={v => setTexto('intro', v)} sugerido={sug.intro} filas={5} />
          </Seccion>

          {/* ── CLIENTES ── */}
          <Seccion num="II" titulo="Gestión de Clientes">
            <Stats items={[
              { label: 'Clientes incorporados', val: d.clientesNuevos.length, color: 'text-green-700' },
              { label: 'Expedientes actualizados', val: d.clientesActualizados.length },
              { label: 'Total gestionados', val: d.clientesNuevos.length + d.clientesActualizados.length },
            ]} />
            <TextoEditable valor={textos.clientes || ''} onChange={v => setTexto('clientes', v)} sugerido={sug.clientes} />
            {[
              { lista: d.clientesNuevos, campo: 'created_at', tit: 'Clientes incorporados en el período' },
              { lista: d.clientesActualizados, campo: 'updated_at', tit: 'Expedientes actualizados en el período' },
            ].map(g => g.lista.length > 0 && (
              <div key={g.tit}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2 mb-1">{g.tit}</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-2 px-2">Cliente</th>
                    <th className="text-left py-2 px-2">Identificación</th>
                    <th className="text-left py-2 px-2">Fecha</th>
                    <th className="text-left py-2 px-2">Riesgo</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.lista.map(c => (
                      <tr key={c.id}>
                        <td className="py-2 px-2 font-medium text-gray-800">{nombreCliente(c)}</td>
                        <td className="py-2 px-2 text-gray-500">{c.numero_identificacion || '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{fmtFecha(String(c[g.campo] || '').substring(0, 10))}</td>
                        <td className="py-2 px-2 text-gray-500">{c.calificacion_riesgo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Seccion>

          {/* ── NORMATIVA ── */}
          <Seccion num="III" titulo="Normativa Interna">
            <TextoEditable valor={textos.normativa || ''} onChange={v => setTexto('normativa', v)} sugerido={sug.normativa} />
            {[
              { lista: d.normAprobadas, tit: 'Aprobada por Junta Directiva en el período' },
              { lista: d.normActualizada, tit: 'Actualizada en el período' },
            ].map(g => g.lista.length > 0 && (
              <div key={g.tit}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2 mb-1">{g.tit}</p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-2 px-2">Documento</th>
                    <th className="text-left py-2 px-2">Tipo</th>
                    <th className="text-left py-2 px-2">Fecha</th>
                    <th className="text-left py-2 px-2">Versión</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.lista.map(n => (
                      <tr key={n.id}>
                        <td className="py-2 px-2 font-medium text-gray-800">{n.nombre}</td>
                        <td className="py-2 px-2 text-gray-500">{n.tipo_documento || n.tipo || '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{fmtFecha(n.fecha_aprobacion_jd || String(n.updated_at || '').substring(0, 10))}</td>
                        <td className="py-2 px-2 text-gray-500">{n.version || '1.0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {d.normAprobadas.length === 0 && d.normActualizada.length === 0 && (
              <p className="text-sm text-gray-400 italic">No se registraron aprobaciones ni actualizaciones de normativa durante {anio}.</p>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <label className="label text-xs">Envío de normativa a aprobación de Junta Directiva</label>
              <input
                className="input-field text-sm"
                placeholder="Ej: Se remitirá a la Junta Directiva en la sesión de marzo de 2027"
                value={envioNormativa}
                onChange={e => setEnvioNormativa(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Si lo completa, aparecerá en el informe. Déjelo vacío para omitirlo.
              </p>
            </div>
          </Seccion>

          {/* ── SICVECA ── */}
          <Seccion num="IV" titulo="Monitoreo Transaccional SICVECA">
            <Stats items={[
              { label: 'Total transacciones', val: d.txns.length },
              { label: 'Monto total reportado', val: 'USD ' + fmtUSD(d.totalMonto), color: 'text-gray-800' },
              { label: 'Meses con movimiento', val: d.periodosConMov, color: 'text-green-700' },
              { label: 'Meses sin movimiento', val: d.periodosSinMov, color: 'text-orange-600' },
            ]} />
            <TextoEditable valor={textos.sicveca || ''} onChange={v => setTexto('sicveca', v)} sugerido={sug.sicveca} />
          </Seccion>

          {/* ── DEBIDA DILIGENCIA ── */}
          <Seccion num="V" titulo="Debida Diligencia de Clientes">
            <Stats items={[
              { label: 'Expedientes gestionados', val: d.dds.length },
              { label: 'Clientes nuevos con expediente', val: d.clientesNuevos.length },
            ]} />
            <p className="text-xs text-gray-400">
              El nivel de riesgo no se desglosa acá: la calificación se asigna en el módulo de
              Calificación de Riesgo y se reporta en la sección VIII.
            </p>
            <TextoEditable valor={textos.dd || ''} onChange={v => setTexto('dd', v)} sugerido={sug.dd} />
          </Seccion>

          {/* ── ROS ── */}
          <Seccion num="VI" titulo="Reportes de Operaciones Sospechosas (ROS)">
            <TextoEditable valor={textos.ros || ''} onChange={v => setTexto('ros', v)} sugerido={sug.ros} />
            {d.ros.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2">N° ROS</th>
                  <th className="text-left py-2 px-2">Cliente</th>
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Estado</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {d.ros.map((r, i) => (
                    <tr key={r.id}>
                      <td className="py-2 px-2 text-gray-500 font-mono text-xs">{String(i + 1).padStart(3, '0')}</td>
                      <td className="py-2 px-2 font-medium text-gray-800">{r.nombre_sujeto || r.numero_identificacion || '—'}</td>
                      <td className="py-2 px-2 text-gray-600">{fmtFecha(String(r.created_at || '').substring(0, 10))}</td>
                      <td className="py-2 px-2"><span className={`text-xs px-2 py-0.5 rounded-full ${r.estado === 'enviado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.estado || 'elaborado'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Seccion>

          {/* ── DENUNCIAS ── */}
          <Seccion num="VII" titulo="Atención de Denuncias — Canal Confidencial">
            <Stats items={[
              { label: 'Denuncias recibidas', val: d.denuncias.length },
              { label: 'En proceso', val: d.denuncias.filter(x => x.estado === 'en_proceso' || x.estado === 'en_revision').length },
              { label: 'Resueltas', val: d.denuncias.filter(x => x.estado === 'resuelta' || x.estado === 'resuelto' || x.estado === 'cerrada').length, color: 'text-green-700' },
            ]} />
            <TextoEditable valor={textos.denuncias || ''} onChange={v => setTexto('denuncias', v)} sugerido={sug.denuncias} />
          </Seccion>

          {/* ── CALIFICACIÓN ── */}
          <Seccion num="VIII" titulo="Calificación de Riesgo de Clientes">
            <Stats items={[
              { label: 'Calificaciones realizadas', val: d.calificaciones.length },
              { label: 'Riesgo alto / muy alto', val: d.calificaciones.filter(esAlto).length, color: 'text-red-600' },
              { label: 'Riesgo bajo/medio', val: d.calificaciones.filter(c => !esAlto(c)).length, color: 'text-green-700' },
            ]} />
            <TextoEditable valor={textos.calificacion || ''} onChange={v => setTexto('calificacion', v)} sugerido={sug.calificacion} />
          </Seccion>

          {/* ── ESTADO DE CUMPLIMIENTO ── */}
          <Seccion num="IX" titulo="Estado de Cumplimiento en el Período">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { ok: d.uifActualizada, tit: 'Sistemas SUGEF / UIF', fecha: d.fechaUif,
                  txtOk: 'Actualizados en el período', txtNo: 'Sin actualización registrada en el período' },
                { ok: d.evalRiesgoEnPeriodo, tit: 'Evaluación de Riesgo LC/FT', fecha: d.fechaEvalRiesgo,
                  txtOk: 'Actualizada en el período', txtNo: 'Sin actualización registrada en el período' },
              ].map(x => (
                <div key={x.tit} className={`rounded-lg p-3 border ${x.ok ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                  <p className="text-sm font-semibold text-gray-800">{x.ok ? '✅' : '⚠'} {x.tit}</p>
                  <p className={`text-sm mt-0.5 ${x.ok ? 'text-green-700' : 'text-orange-700'}`}>{x.ok ? x.txtOk : x.txtNo}</p>
                  {x.ok && x.fecha && <p className="text-xs text-gray-500 mt-0.5">Fecha: {fmtFecha(x.fecha)}</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Estos datos provienen del módulo de Nivel de Cumplimiento. Si no coinciden, actualícelos ahí y vuelva a generar.
            </p>
            <TextoEditable valor={textos.cumplimiento || ''} onChange={v => setTexto('cumplimiento', v)} sugerido={sug.cumplimiento} filas={5} />
          </Seccion>

          {/* ── INFORMES ELABORADOS ── */}
          <Seccion num="X" titulo="Informes Elaborados en el Período">
            <Stats items={[
              { label: 'Informes de monitoreo', val: d.informesMonitoreo.length },
              { label: 'Planes de trabajo', val: d.informesPlanTrabajo.length },
              { label: 'Planes de capacitación', val: d.informesCapacitacion.length },
            ]} />
            <TextoEditable valor={textos.informes || ''} onChange={v => setTexto('informes', v)} sugerido={sug.informes} />
            {[...d.informesMonitoreo, ...d.informesPlanTrabajo, ...d.informesCapacitacion].length > 0 ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2">Informe</th>
                  <th className="text-left py-2 px-2">Período</th>
                  <th className="text-left py-2 px-2">Fecha</th>
                  <th className="text-left py-2 px-2">Elaborado por</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {[...d.informesMonitoreo, ...d.informesPlanTrabajo, ...d.informesCapacitacion].map(i => (
                    <tr key={i.id}>
                      <td className="py-2 px-2 font-medium text-gray-800">{TIPO_INFORME_LABEL[i.tipo_informe] || i.tipo_informe}</td>
                      <td className="py-2 px-2 text-gray-500">{i.periodo || '—'}</td>
                      <td className="py-2 px-2 text-gray-600">{fmtFecha(String(i.fecha_generacion || i.created_at || '').substring(0, 10))}</td>
                      <td className="py-2 px-2 text-gray-500">{i.generado_por_nombre || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 italic">No se registraron informes de monitoreo, plan de trabajo ni plan de capacitación durante {anio}.</p>
            )}
          </Seccion>

          {/* ── CAPACITACIÓN ── */}
          <Seccion num="XI" titulo="Capacitación en Materia ALA/CFT">
            <div className={`p-3 rounded-lg border ${d.capacitacion ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className={`text-sm ${d.capacitacion ? 'text-green-800' : 'text-orange-800'}`}>
                {d.capacitacion ? '✅ Capacitación anual completada' : '⚠ Sin capacitación anual registrada en el período'}
              </p>
            </div>
            <TextoEditable valor={textos.capacitacion || ''} onChange={v => setTexto('capacitacion', v)} sugerido={sug.capacitacion} />
          </Seccion>

          {/* ── OTRAS LABORES ── */}
          <Seccion num="XII" titulo="Otras Labores Realizadas">
            <p className="text-sm text-gray-500 italic">
              Espacio libre para labores adicionales no cubiertas por las secciones anteriores.
              Si lo deja vacío, la sección no aparece en el informe impreso.
            </p>
            <TextoEditable
              valor={textos.otras || ''}
              onChange={v => setTexto('otras', v)}
              sugerido={'Ej: atención de consultas de la Junta Directiva, coordinación con auditoría externa, actualización de matrices de riesgo, asesoría a las áreas operativas…'}
              filas={6}
            />
          </Seccion>

          {/* ── CONCLUSIONES ── */}
          <Seccion num={textos.otras?.trim() ? 'XIII' : 'XII'} titulo="Conclusiones y Recomendaciones">
            <TextoEditable valor={textos.conclusiones || ''} onChange={v => setTexto('conclusiones', v)} sugerido={sug.conclusiones} filas={7} />
          </Seccion>

          {/* ── PIE ── */}
          <div className="card bg-gray-50 text-center text-sm text-gray-500">
            <p className="font-semibold text-gray-700">{profile?.nombre}</p>
            <p>Oficial de Cumplimiento ALA/CFT</p>
            <p className="mt-1">{tenant?.nombre}</p>
            <p className="text-xs mt-2">Informe elaborado el {new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })} · CNL Craniley Compliance Services</p>
            <p className="text-xs mt-1 text-gray-400">Documento confidencial — Uso exclusivo de Junta Directiva</p>
            {guardado && <p className="text-xs mt-1 text-green-600">✅ Informe registrado en el sistema</p>}
          </div>
        </div>
      )}
    </div>
  )
}
