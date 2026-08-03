import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { imprimirDocumento, esc, escMultilinea, fechaLarga } from '../../utils/imprimirDocumento'

const anioActual = new Date().getFullYear()

const introDefault = (entidad, anio) =>
  `El presente informe tiene por objeto rendir cuenta a la Junta Directiva de ${entidad} sobre las labores desarrolladas por el Oficial de Cumplimiento durante el período comprendido del 1 de enero al 31 de diciembre de ${anio}, en cumplimiento de las disposiciones establecidas en la Ley 7786 y sus reformas, así como los Acuerdos SUGEF vigentes en materia de prevención de Legitimación de Capitales, Financiamiento al Terrorismo y Financiamiento a la Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM).`

const conclusionesDefault = (anio) =>
  `Con base en las labores desarrolladas durante el período ${anio}, el suscrito Oficial de Cumplimiento concluye que la entidad ha mantenido los controles necesarios para prevenir el uso de sus servicios en actividades de LC/FT/FPADM.

Se recomienda a la Junta Directiva:
1. Continuar apoyando las iniciativas de cumplimiento y los recursos asignados al área.
2. Aprobar el Plan de Trabajo y el Plan de Capacitación para el año ${anio + 1}.
3. Mantener actualizados los expedientes de debida diligencia de clientes de alto riesgo.`

async function registrarInforme(tenantId, anio, profileId, profileNombre, resumen) {
  try {
    await supabase.from('informes_generados').insert({
      tenant_id: tenantId, tipo_informe: 'labores', periodo: String(anio),
      generado_por: profileId, generado_por_nombre: profileNombre,
      resumen_json: resumen,
    })
  } catch { /* tabla puede no existir aún */ }
}

export default function InformeLaborales({ tenantEfectivo }) {
  const { tenant: tenantPropio, profile } = useAuth()
  const tenant = tenantEfectivo || tenantPropio
  const [anio, setAnio]         = useState(anioActual - 1)
  const [loading, setLoading]   = useState(false)
  const [generado, setGenerado] = useState(false)
  const [datos, setDatos]       = useState(null)
  const [intro, setIntro]       = useState('')
  const [conclusiones, setConclusiones] = useState('')
  const [guardado, setGuardado] = useState(false)

  const cargar = useCallback(async () => {
    if (!tenant) return
    setLoading(true)
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`

    const [
      { data: normativas },
      { data: txns },
      { data: periodos },
      { data: dds },
      { data: ros },
      { data: denuncias },
      { data: calificaciones },
      { data: seguimiento },
    ] = await Promise.all([
      supabase.from('normativa').select('*').eq('tenant_id', tenant.id)
        .gte('fecha_aprobacion', desde).lte('fecha_aprobacion', hasta),
      supabase.from('transacciones').select('*').eq('tenant_id', tenant.id)
        .gte('periodo', desde).lte('periodo', hasta),
      supabase.from('periodos_declarados').select('*').eq('tenant_id', tenant.id)
        .gte('periodo', desde).lte('periodo', hasta),
      supabase.from('expedientes_dd').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),
      supabase.from('reportes_ros').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),
      supabase.from('denuncias').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),
      supabase.from('calificaciones_riesgo').select('*').eq('tenant_id', tenant.id)
        .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),
      supabase.from('compliance_seguimiento').select('*').eq('tenant_id', tenant.id).single(),
    ])

    const totalMonto = (txns || []).reduce((s, t) => s + Number(t.monto_movimiento || 0), 0)
    const periodosConMov = (periodos || []).filter(p => p.tipo === 'con_movimiento').length
    const periodosSinMov = (periodos || []).filter(p => p.tipo === 'sin_movimiento').length

    setDatos({
      normativas: normativas || [],
      txns: txns || [],
      totalMonto,
      periodosConMov,
      periodosSinMov,
      dds: dds || [],
      ros: ros || [],
      denuncias: denuncias || [],
      calificaciones: calificaciones || [],
      capacitacion: seguimiento?.capacitacion_completa || false,
      fechaCapacitacion: seguimiento?.fecha_capacitacion || null,
    })
    setGenerado(true)
    setLoading(false)

    // Persistir el informe en la base de datos
    await registrarInforme(
      tenant.id, anio, profile?.id, profile?.nombre,
      { anio, txns_total: (txns || []).length, ros_total: (ros || []).length, dds_total: (dds || []).length }
    )
    setGuardado(true)
  }, [tenant, anio, profile])

  const fmtUSD = n => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })
  const fmtFecha = f => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  const textoIntro        = intro.trim() || introDefault(tenant?.nombre || 'la entidad', anio)
  const textoConclusiones = conclusiones.trim() || conclusionesDefault(anio)

  const imprimir = () => {
    if (!datos) return

    const stat = (val, lbl, color = '') =>
      `<div class="stat"><div class="val ${color}">${esc(val)}</div><div class="lbl">${esc(lbl)}</div></div>`

    const seccionNormativa = datos.normativas.length > 0
      ? `<table class="datos">
           <thead><tr><th>Documento</th><th style="width:20%">Tipo</th><th style="width:22%">Fecha aprobación</th><th class="centro" style="width:10%">Versión</th></tr></thead>
           <tbody>${datos.normativas.map(n => `
             <tr>
               <td>${esc(n.nombre)}</td>
               <td>${esc(n.tipo_documento) || '—'}</td>
               <td>${esc(fmtFecha(n.fecha_aprobacion))}</td>
               <td class="centro">${esc(n.version || '1.0')}</td>
             </tr>`).join('')}</tbody>
         </table>`
      : `<p class="vacio">No se registraron aprobaciones de normativa interna durante ${anio}.</p>`

    const seccionRos = datos.ros.length > 0
      ? `<div class="texto"><p>Durante el período ${anio} se elaboraron <strong>${datos.ros.length}</strong> ${datos.ros.length === 1 ? 'Reporte de Operación Sospechosa' : 'Reportes de Operaciones Sospechosas'} y se remitieron a la Unidad de Inteligencia Financiera (UIF) del ICD.</p></div>
         <table class="datos" style="margin-top:8px">
           <thead><tr><th class="centro" style="width:10%">N° ROS</th><th>Cliente</th><th style="width:24%">Fecha</th><th style="width:16%">Estado</th></tr></thead>
           <tbody>${datos.ros.map((r, i) => `
             <tr>
               <td class="centro">${String(i + 1).padStart(3, '0')}</td>
               <td>${esc(r.nombre_sujeto || r.numero_identificacion || '—')}</td>
               <td>${esc(fmtFecha(r.created_at?.substring(0, 10)))}</td>
               <td>${esc(r.estado || 'elaborado')}</td>
             </tr>`).join('')}</tbody>
         </table>`
      : `<div class="texto"><p>Durante el período ${anio} no se identificaron operaciones que ameritaran la presentación de un Reporte de Operación Sospechosa ante la Unidad de Inteligencia Financiera del ICD.</p></div>`

    const seccionCapacitacion = datos.capacitacion
      ? `<div class="aviso ok">
           <strong>Capacitación anual completada.</strong>
           ${datos.fechaCapacitacion ? ` Fecha de realización: ${esc(fmtFecha(datos.fechaCapacitacion))}.` : ''}
           El personal de la entidad recibió capacitación en materia de prevención de LC/FT/FPADM según lo establecido en el Acuerdo SUGEF 11-18.
         </div>`
      : `<div class="aviso warn">No se registró capacitación anual completada en el sistema durante el período ${anio}.</div>`

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

      <section class="bloque">
        <h3>I. Introducción</h3>
        <div class="texto">${escMultilinea(textoIntro)}</div>
      </section>

      <section class="bloque">
        <h3>II. Normativa Interna Aprobada en el Período</h3>
        ${seccionNormativa}
      </section>

      <section class="bloque">
        <h3>III. Monitoreo Transaccional SICVECA</h3>
        <div class="stats c4">
          ${stat(datos.txns.length, 'Total transacciones')}
          ${stat('USD ' + fmtUSD(datos.totalMonto), 'Monto total reportado')}
          ${stat(datos.periodosConMov, 'Meses con movimiento', 'verde')}
          ${stat(datos.periodosSinMov, 'Meses sin movimiento', 'naranja')}
        </div>
        <div class="texto"><p>Durante el período ${anio}, se realizó el monitoreo mensual de transacciones en el sistema SICVECA, reportando ${datos.periodosConMov} ${datos.periodosConMov === 1 ? 'mes' : 'meses'} con actividad transaccional y ${datos.periodosSinMov} ${datos.periodosSinMov === 1 ? 'mes' : 'meses'} sin movimiento, totalizando ${datos.txns.length} transacciones por un monto de USD ${fmtUSD(datos.totalMonto)}.</p></div>
      </section>

      <section class="bloque">
        <h3>IV. Debida Diligencia de Clientes</h3>
        <div class="stats c3">
          ${stat(datos.dds.length, 'Expedientes gestionados')}
          ${stat(datos.dds.filter(d => d.nivel_riesgo === 'alto').length, 'Alto riesgo', 'rojo')}
          ${stat(datos.dds.filter(d => d.nivel_riesgo === 'medio').length, 'Riesgo medio', 'naranja')}
        </div>
        ${datos.dds.length === 0 ? `<p class="vacio">No se registraron expedientes de debida diligencia durante ${anio}.</p>` : ''}
      </section>

      <section class="bloque">
        <h3>V. Reportes de Operaciones Sospechosas (ROS)</h3>
        ${seccionRos}
      </section>

      <section class="bloque">
        <h3>VI. Atención de Denuncias — Canal Confidencial</h3>
        <div class="stats c3">
          ${stat(datos.denuncias.length, 'Denuncias recibidas')}
          ${stat(datos.denuncias.filter(d => d.estado === 'en_proceso').length, 'En proceso')}
          ${stat(datos.denuncias.filter(d => d.estado === 'resuelta' || d.estado === 'cerrada').length, 'Resueltas', 'verde')}
        </div>
        ${datos.denuncias.length === 0 ? `<div class="texto"><p>No se recibieron denuncias a través del canal confidencial durante el período ${anio}.</p></div>` : ''}
      </section>

      <section class="bloque">
        <h3>VII. Calificación de Riesgo de Clientes</h3>
        <div class="stats c3">
          ${stat(datos.calificaciones.length, 'Calificaciones realizadas')}
          ${stat(datos.calificaciones.filter(c => c.nivel_riesgo === 'Alto').length, 'Riesgo alto', 'rojo')}
          ${stat(datos.calificaciones.filter(c => c.nivel_riesgo !== 'Alto').length, 'Riesgo bajo/medio', 'verde')}
        </div>
      </section>

      <section class="bloque">
        <h3>VIII. Capacitación en Materia ALA/CFT</h3>
        ${seccionCapacitacion}
      </section>

      <section class="bloque">
        <h3>IX. Conclusiones y Recomendaciones</h3>
        <div class="texto">${escMultilinea(textoConclusiones)}</div>
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

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Informe de Labores — Oficial de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Dirigido a Junta Directiva · Formato profesional ALA/CFT</p>
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

      {generado && datos && (
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

          {/* ── INTRODUCCIÓN ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">I. Introducción</h3>
            <p className="text-sm text-gray-500 italic">Edite el texto de introducción según corresponda:</p>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[120px] focus:outline-none focus:border-[#0a1247] print:border-0"
              value={intro}
              onChange={e => setIntro(e.target.value)}
              placeholder={introDefault(tenant?.nombre || 'la entidad', anio)}
            />
          </section>

          {/* ── NORMATIVA ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">II. Normativa Interna Aprobada en el Período</h3>
            {datos.normativas.length > 0 ? (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 px-2">Documento</th>
                  <th className="text-left py-2 px-2">Tipo</th>
                  <th className="text-left py-2 px-2">Fecha aprobación</th>
                  <th className="text-left py-2 px-2">Versión</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.normativas.map(n => (
                    <tr key={n.id}>
                      <td className="py-2 px-2 font-medium text-gray-800">{n.nombre}</td>
                      <td className="py-2 px-2 text-gray-500">{n.tipo_documento || '—'}</td>
                      <td className="py-2 px-2 text-gray-600">{fmtFecha(n.fecha_aprobacion)}</td>
                      <td className="py-2 px-2 text-gray-500">{n.version || '1.0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-400 italic">No se registraron aprobaciones de normativa interna durante {anio}.</p>
            )}
          </section>

          {/* ── MONITOREO TRANSACCIONAL ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">III. Monitoreo Transaccional SICVECA</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Total transacciones', val: datos.txns.length, color: 'text-[#0a1247]' },
                { label: 'Monto total reportado', val: 'USD ' + fmtUSD(datos.totalMonto), color: 'text-gray-800' },
                { label: 'Meses con movimiento', val: datos.periodosConMov, color: 'text-green-700' },
                { label: 'Meses sin movimiento', val: datos.periodosSinMov, color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              Durante el período {anio}, se realizó el monitoreo mensual de transacciones en el sistema SICVECA,
              reportando {datos.periodosConMov} {datos.periodosConMov === 1 ? 'mes' : 'meses'} con actividad transaccional
              y {datos.periodosSinMov} {datos.periodosSinMov === 1 ? 'mes' : 'meses'} sin movimiento,
              totalizando {datos.txns.length} transacciones por un monto de USD {fmtUSD(datos.totalMonto)}.
            </p>
          </section>

          {/* ── DEBIDA DILIGENCIA ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">IV. Debida Diligencia de Clientes</h3>
            <div className="grid grid-cols-3 gap-3 text-sm mb-3">
              {[
                { label: 'Expedientes gestionados', val: datos.dds.length },
                { label: 'Alto riesgo', val: datos.dds.filter(d => d.nivel_riesgo === 'alto').length, color: 'text-red-600' },
                { label: 'Riesgo medio', val: datos.dds.filter(d => d.nivel_riesgo === 'medio').length, color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className={`text-lg font-bold ${s.color || 'text-[#0a1247]'}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {datos.dds.length === 0 && (
              <p className="text-sm text-gray-400 italic">No se registraron expedientes de debida diligencia durante {anio}.</p>
            )}
          </section>

          {/* ── ROS ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">V. Reportes de Operaciones Sospechosas (ROS)</h3>
            {datos.ros.length > 0 ? (
              <>
                <p className="text-sm text-gray-700">
                  Durante el período {anio} se elaboraron <strong>{datos.ros.length}</strong> {datos.ros.length === 1 ? 'Reporte de Operación Sospechosa' : 'Reportes de Operaciones Sospechosas'} y se remitieron a la Unidad de Inteligencia Financiera (UIF) del ICD.
                </p>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-2 px-2">N° ROS</th>
                    <th className="text-left py-2 px-2">Cliente</th>
                    <th className="text-left py-2 px-2">Fecha</th>
                    <th className="text-left py-2 px-2">Estado</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {datos.ros.map((r, i) => (
                      <tr key={r.id}>
                        <td className="py-2 px-2 text-gray-500 font-mono text-xs">{String(i+1).padStart(3,'0')}</td>
                        <td className="py-2 px-2 font-medium text-gray-800">{r.nombre_sujeto || r.numero_identificacion || '—'}</td>
                        <td className="py-2 px-2 text-gray-600">{fmtFecha(r.created_at?.substring(0,10))}</td>
                        <td className="py-2 px-2"><span className={`text-xs px-2 py-0.5 rounded-full ${r.estado === 'enviado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.estado || 'elaborado'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-sm text-gray-700">
                Durante el período {anio} no se identificaron operaciones que ameritaran la presentación de un Reporte de Operación Sospechosa ante la Unidad de Inteligencia Financiera del ICD.
              </p>
            )}
          </section>

          {/* ── DENUNCIAS ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">VI. Atención de Denuncias — Canal Confidencial</h3>
            <div className="grid grid-cols-3 gap-3 text-sm mb-2">
              {[
                { label: 'Denuncias recibidas', val: datos.denuncias.length },
                { label: 'En proceso', val: datos.denuncias.filter(d => d.estado === 'en_proceso').length },
                { label: 'Resueltas', val: datos.denuncias.filter(d => d.estado === 'resuelta' || d.estado === 'cerrada').length, color: 'text-green-700' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className={`text-lg font-bold ${s.color || 'text-[#0a1247]'}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {datos.denuncias.length === 0 && (
              <p className="text-sm text-gray-700">No se recibieron denuncias a través del canal confidencial durante el período {anio}.</p>
            )}
          </section>

          {/* ── CALIFICACIÓN DE CLIENTES ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">VII. Calificación de Riesgo de Clientes</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Calificaciones realizadas', val: datos.calificaciones.length },
                { label: 'Riesgo alto', val: datos.calificaciones.filter(c => c.nivel_riesgo === 'Alto').length, color: 'text-red-600' },
                { label: 'Riesgo bajo/medio', val: datos.calificaciones.filter(c => c.nivel_riesgo !== 'Alto').length, color: 'text-green-700' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className={`text-lg font-bold ${s.color || 'text-[#0a1247]'}`}>{s.val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── CAPACITACIÓN ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">VIII. Capacitación en Materia ALA/CFT</h3>
            {datos.capacitacion ? (
              <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-green-800 text-sm">Capacitación anual completada</p>
                  {datos.fechaCapacitacion && (
                    <p className="text-sm text-green-700 mt-1">Fecha de realización: {fmtFecha(datos.fechaCapacitacion)}</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">El personal de la entidad recibió capacitación en materia de prevención de LC/FT/FPADM según lo establecido en el Acuerdo SUGEF 11-18.</p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">No se registró capacitación anual completada en el sistema durante el período {anio}.</p>
              </div>
            )}
          </section>

          {/* ── CONCLUSIONES ── */}
          <section className="card space-y-3">
            <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">IX. Conclusiones y Recomendaciones</h3>
            <p className="text-sm text-gray-500 italic">Edite las conclusiones según corresponda:</p>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[150px] focus:outline-none focus:border-[#0a1247] print:border-0"
              value={conclusiones}
              onChange={e => setConclusiones(e.target.value)}
              placeholder={conclusionesDefault(anio)}
            />
          </section>

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
