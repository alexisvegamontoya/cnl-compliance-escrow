import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const anioActual = new Date().getFullYear()

const ACTIVIDADES_DEFAULT = [
  {
    area: 'Normativa Interna',
    actividades: [
      'Revisión y actualización de la Política de Prevención ALA/CFT/FPADM',
      'Revisión y actualización del Manual de Procedimientos de Cumplimiento',
      'Revisión del Código de Ética y Conducta',
    ],
  },
  {
    area: 'Debida Diligencia',
    actividades: [
      'Revisión periódica de expedientes de clientes de alto riesgo',
      'Actualización de información en expedientes de clientes existentes',
      'Aplicación de Debida Diligencia Ampliada a clientes PEP o alto riesgo identificados',
    ],
  },
  {
    area: 'Monitoreo Transaccional SICVECA',
    actividades: [
      'Presentación mensual de reportes de transacciones al SUGEF',
      'Monitoreo continuo de transacciones inusuales',
      'Presentación de Reportes de Operaciones Sospechosas (ROS) según corresponda',
    ],
  },
  {
    area: 'Capacitación',
    actividades: [
      'Capacitación anual obligatoria en materia ALA/CFT/FPADM a todo el personal',
      'Capacitación específica a personal de nuevo ingreso',
      'Participación del Oficial de Cumplimiento en cursos de actualización',
    ],
  },
  {
    area: 'Evaluación de Riesgos',
    actividades: [
      'Actualización anual de la Evaluación de Riesgos de LC/FT/FPADM',
      'Seguimiento al Plan de Acción derivado de la Evaluación de Riesgos',
      'Calificación periódica del riesgo de la cartera de clientes',
    ],
  },
  {
    area: 'Gobierno y Reporte',
    actividades: [
      'Presentación del Informe de Labores a la Junta Directiva',
      'Presentación del presente Plan de Trabajo a la Junta Directiva para aprobación',
      'Atención de requerimientos o consultas del SUGEF',
      'Mantenimiento del sistema CNL Compliance y actualización de registros',
    ],
  },
]

const TRIMESTRES = ['I Trimestre', 'II Trimestre', 'III Trimestre', 'IV Trimestre']

export default function InformePlanTrabajo({ tenantEfectivo }) {
  const { tenant: tenantPropio, profile } = useAuth()
  const tenant = tenantEfectivo || tenantPropio
  const anio = anioActual
  const [guardado, setGuardado] = useState(false)

  // Auto-registrar en BD cuando se muestra el componente (primera vez por año)
  useEffect(() => {
    if (!tenant?.id) return
    supabase.from('informes_generados').insert({
      tenant_id: tenant.id, tipo_informe: 'plan_trabajo', periodo: String(anio),
      generado_por: profile?.id, generado_por_nombre: profile?.nombre,
      resumen_json: { anio },
    }).then(() => setGuardado(true)).catch(() => {})
  }, [tenant?.id]) // eslint-disable-line

  const [planRows, setPlanRows] = useState(
    ACTIVIDADES_DEFAULT.flatMap(grupo =>
      grupo.actividades.map(act => ({
        area: grupo.area,
        actividad: act,
        responsable: 'Oficial de Cumplimiento',
        trimestres: [false, false, false, false],
        observaciones: '',
      }))
    )
  )
  const [justificacion, setJustificacion] = useState('')
  const [recursos, setRecursos] = useState('')

  const toggleTrimestre = (idx, t) => {
    setPlanRows(rows => rows.map((r, i) => i !== idx ? r : {
      ...r, trimestres: r.trimestres.map((v, ti) => ti === t ? !v : v)
    }))
  }

  const updateRow = (idx, field, val) => {
    setPlanRows(rows => rows.map((r, i) => i !== idx ? r : { ...r, [field]: val }))
  }

  const addRow = () => {
    setPlanRows(rows => [...rows, {
      area: 'Otro', actividad: '', responsable: 'Oficial de Cumplimiento',
      trimestres: [false, false, false, false], observaciones: ''
    }])
  }

  const removeRow = (idx) => {
    setPlanRows(rows => rows.filter((_, i) => i !== idx))
  }

  // Group for display
  const grouped = planRows.reduce((acc, row, idx) => {
    if (!acc[row.area]) acc[row.area] = []
    acc[row.area].push({ ...row, idx })
    return acc
  }, {})

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan de Trabajo — Oficial de Cumplimiento</h1>
          <p className="text-gray-500 text-sm mt-1">Período {anio} · Para aprobación de Junta Directiva</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary text-sm print:hidden">
          🖨️ Imprimir / PDF
        </button>
      </div>

      {/* Portada */}
      <div className="card border-2 border-[#0e0e6e] bg-blue-50 print:border-0">
        <div className="text-center py-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-[#0e0e6e] font-semibold">Documento para Aprobación — Junta Directiva</p>
          <h2 className="text-2xl font-bold text-[#0e0e6e]">PLAN DE TRABAJO {anio}</h2>
          <h3 className="text-lg font-semibold text-gray-700">Área de Cumplimiento ALA/CFT/FPADM</h3>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-left">
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Entidad</p><p className="font-semibold text-gray-800">{tenant?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Responsable</p><p className="font-semibold text-gray-800">{profile?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Fecha de elaboración</p><p className="font-semibold text-gray-800">{new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div>
          </div>
        </div>
      </div>

      {/* Justificación */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0e0e6e] border-b pb-2">I. Justificación</h3>
        <p className="text-sm text-gray-500 italic print:hidden">Edite según corresponda:</p>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[100px] focus:outline-none focus:border-[#0e0e6e] print:border-0"
          value={justificacion}
          onChange={e => setJustificacion(e.target.value)}
          placeholder={`El presente Plan de Trabajo fue elaborado por el Oficial de Cumplimiento de ${tenant?.nombre || 'la entidad'} para el período ${anio}, con el fin de establecer las actividades prioritarias en materia de prevención de Legitimación de Capitales, Financiamiento al Terrorismo y Financiamiento a la Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM), en cumplimiento de la Ley 7786 y normativa SUGEF aplicable.`}
        />
      </section>

      {/* Plan */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-bold text-[#0e0e6e]">II. Actividades Planificadas {anio}</h3>
          <button onClick={addRow} className="btn-secondary text-xs print:hidden">+ Agregar actividad</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                <th className="text-left py-2 px-2 w-28">Área</th>
                <th className="text-left py-2 px-2">Actividad</th>
                <th className="text-left py-2 px-2 w-36">Responsable</th>
                {TRIMESTRES.map(t => <th key={t} className="py-2 px-1 w-16 text-center">{t}</th>)}
                <th className="text-left py-2 px-2 w-36">Observaciones</th>
                <th className="py-2 px-1 print:hidden w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {planRows.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-1.5 px-2">
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0e0e6e] print:border-0"
                      value={row.area} onChange={e => updateRow(idx, 'area', e.target.value)} />
                  </td>
                  <td className="py-1.5 px-2">
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0e0e6e] print:border-0"
                      value={row.actividad} onChange={e => updateRow(idx, 'actividad', e.target.value)} />
                  </td>
                  <td className="py-1.5 px-2">
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0e0e6e] print:border-0"
                      value={row.responsable} onChange={e => updateRow(idx, 'responsable', e.target.value)} />
                  </td>
                  {row.trimestres.map((v, t) => (
                    <td key={t} className="py-1.5 px-1 text-center">
                      <input type="checkbox" checked={v} onChange={() => toggleTrimestre(idx, t)}
                        className="w-3.5 h-3.5 rounded accent-[#0e0e6e]" />
                    </td>
                  ))}
                  <td className="py-1.5 px-2">
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0e0e6e] print:border-0"
                      value={row.observaciones} onChange={e => updateRow(idx, 'observaciones', e.target.value)}
                      placeholder="—" />
                  </td>
                  <td className="py-1.5 px-1 print:hidden">
                    <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recursos */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0e0e6e] border-b pb-2">III. Recursos Requeridos</h3>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[100px] focus:outline-none focus:border-[#0e0e6e] print:border-0"
          value={recursos}
          onChange={e => setRecursos(e.target.value)}
          placeholder={`Para la ejecución del presente plan se requiere:\n• Acceso al sistema CNL Compliance para gestión documental y monitoreo transaccional\n• Tiempo estimado: [X] horas mensuales dedicadas al área de cumplimiento\n• Presupuesto para capacitación: [indicar monto estimado]\n• Acceso a bases de datos de listas internacionales y consultas SUGEF`}
        />
      </section>

      {/* Firma */}
      <div className="card bg-gray-50 text-center text-sm text-gray-500 space-y-2">
        <p className="text-xs text-gray-400 mb-4">Elaborado por:</p>
        <div className="flex justify-around text-sm">
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mx-auto mb-1 pt-1"></div>
            <p className="font-semibold text-gray-700">{profile?.nombre || '—'}</p>
            <p className="text-gray-500 text-xs">Oficial de Cumplimiento ALA/CFT</p>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mx-auto mb-1 pt-1"></div>
            <p className="font-semibold text-gray-700">___________________________</p>
            <p className="text-gray-500 text-xs">Representante Legal / Junta Directiva</p>
            <p className="text-gray-400 text-xs">Fecha de aprobación: ______________</p>
          </div>
        </div>
        <p className="text-xs mt-4 text-gray-400">{tenant?.nombre} · Plan de Trabajo {anio} · Confidencial</p>
        {guardado && <p className="text-xs mt-1 text-green-600">✅ Plan registrado en el sistema</p>}
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          .max-w-6xl { display: block !important; max-width: 100% !important; }
          .card { border: 1px solid #e5e7eb; box-shadow: none; break-inside: avoid; margin-bottom: 1rem; }
          button { display: none !important; }
          textarea { border: none !important; resize: none; min-height: unset; }
          input { border: none !important; background: transparent; }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: none !important; }
        }
      `}</style>
    </div>
  )
}
