import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'

const anioActual = new Date().getFullYear()

const TEMAS_DEFAULT = [
  { tema: 'Marco Legal ALA/CFT/FPADM en Costa Rica', horas: 2, publico: 'Todo el personal', trimestre: 1, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Identificación y Debida Diligencia de Clientes', horas: 2, publico: 'Personal de atención al cliente', trimestre: 1, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Señales de Alerta de Lavado de Dinero y FT', horas: 2, publico: 'Todo el personal', trimestre: 2, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Consulta de Listas Internacionales (PEP, ONU, OFAC)', horas: 1, publico: 'Personal de atención al cliente', trimestre: 2, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Reporte de Operaciones Sospechosas (ROS)', horas: 1, publico: 'Oficial de Cumplimiento, Gerencia', trimestre: 3, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Sistema SICVECA — Reportes Transaccionales', horas: 1, publico: 'Oficial de Cumplimiento', trimestre: 3, modalidad: 'Virtual', obligatorio: true },
  { tema: 'Actualización normativa SUGEF y cambios regulatorios', horas: 1, publico: 'Oficial de Cumplimiento, Junta Directiva', trimestre: 4, modalidad: 'Presencial', obligatorio: false },
  { tema: 'Evaluación de Riesgos LC/FT/FPADM', horas: 2, publico: 'Oficial de Cumplimiento', trimestre: 4, modalidad: 'Virtual', obligatorio: false },
]

const MODALIDADES = ['Virtual', 'Presencial', 'Híbrida', 'E-learning']
const PUBLICOS = ['Todo el personal', 'Personal de atención al cliente', 'Oficial de Cumplimiento', 'Gerencia', 'Oficial de Cumplimiento, Gerencia', 'Junta Directiva', 'Oficial de Cumplimiento, Junta Directiva']

export default function InformePlanCapacitacion({ tenantEfectivo }) {
  const { tenant: tenantPropio, profile } = useAuth()
  const tenant = tenantEfectivo || tenantPropio
  const anio = anioActual
  const [temas, setTemas] = useState(TEMAS_DEFAULT)
  const [intro, setIntro] = useState('')
  const [proveedor, setProveedor] = useState('CNL Craniley Compliance Services')
  const [presupuesto, setPresupuesto] = useState('')

  const updateTema = (idx, field, val) => {
    setTemas(ts => ts.map((t, i) => i !== idx ? t : { ...t, [field]: val }))
  }
  const addTema = () => setTemas(ts => [...ts, { tema: '', horas: 1, publico: 'Todo el personal', trimestre: 1, modalidad: 'Virtual', obligatorio: true }])
  const removeTema = (idx) => setTemas(ts => ts.filter((_, i) => i !== idx))

  const totalHoras = temas.reduce((s, t) => s + Number(t.horas || 0), 0)
  const porTrimestre = [1, 2, 3, 4].map(tr => temas.filter(t => Number(t.trimestre) === tr))

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan de Capacitación — Cumplimiento ALA/CFT</h1>
          <p className="text-gray-500 text-sm mt-1">Período {anio} · Para aprobación de Junta Directiva</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary text-sm print:hidden">🖨️ Imprimir / PDF</button>
      </div>

      {/* Portada */}
      <div className="card border-2 border-[#0e0e6e] bg-blue-50 print:border-0">
        <div className="text-center py-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-[#0e0e6e] font-semibold">Documento para Aprobación — Junta Directiva</p>
          <h2 className="text-2xl font-bold text-[#0e0e6e]">PLAN DE CAPACITACIÓN {anio}</h2>
          <h3 className="text-lg font-semibold text-gray-700">Prevención LC/FT/FPADM</h3>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-left">
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Entidad</p><p className="font-semibold text-gray-800">{tenant?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Responsable</p><p className="font-semibold text-gray-800">{profile?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Total horas planificadas</p><p className="font-bold text-[#0e0e6e]">{totalHoras} horas</p></div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-400 text-xs">Proveedor principal</p>
              <input className="w-full text-xs font-semibold text-gray-800 bg-transparent focus:outline-none border-b border-gray-200 print:border-0"
                value={proveedor} onChange={e => setProveedor(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Introducción */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0e0e6e] border-b pb-2">I. Justificación</h3>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[100px] focus:outline-none focus:border-[#0e0e6e] print:border-0"
          value={intro}
          onChange={e => setIntro(e.target.value)}
          placeholder={`El presente Plan de Capacitación fue elaborado con el objetivo de garantizar que el personal de ${tenant?.nombre || 'la entidad'} cuente con el conocimiento y las herramientas necesarias para prevenir el uso de los servicios de la entidad en actividades de Legitimación de Capitales, Financiamiento al Terrorismo y Financiamiento a la Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM).\n\nEste plan cumple con lo establecido en la Ley 7786 y el Acuerdo SUGEF 11-18 en lo referente a capacitación continua en materia ALA/CFT.`}
        />
      </section>

      {/* Resumen por trimestre */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0e0e6e] border-b pb-2">II. Resumen por Trimestre</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(tr => (
            <div key={tr} className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <p className="font-semibold text-[#0e0e6e] text-xs mb-1">
                {['I', 'II', 'III', 'IV'][tr - 1]} Trimestre
              </p>
              <p className="text-2xl font-bold text-[#0e0e6e]">{porTrimestre[tr - 1].length}</p>
              <p className="text-xs text-gray-500">actividades · {porTrimestre[tr - 1].reduce((s, t) => s + Number(t.horas || 0), 0)} horas</p>
            </div>
          ))}
        </div>
      </section>

      {/* Detalle */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-bold text-[#0e0e6e]">III. Detalle de Actividades de Capacitación</h3>
          <button onClick={addTema} className="btn-secondary text-xs print:hidden">+ Agregar tema</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 bg-gray-50">
                <th className="text-left py-2 px-2">Tema / Contenido</th>
                <th className="py-2 px-1 w-14 text-center">Horas</th>
                <th className="text-left py-2 px-2 w-40">Público objetivo</th>
                <th className="py-2 px-1 w-14 text-center">Trimestre</th>
                <th className="text-left py-2 px-2 w-24">Modalidad</th>
                <th className="py-2 px-1 w-20 text-center">Obligatorio</th>
                <th className="py-2 px-1 print:hidden w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {temas.map((t, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-1.5 px-2">
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0e0e6e] print:border-0"
                      value={t.tema} onChange={e => updateTema(idx, 'tema', e.target.value)} />
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="number" min="1" max="40"
                      className="w-12 text-xs border-b border-gray-200 bg-transparent text-center focus:outline-none print:border-0"
                      value={t.horas} onChange={e => updateTema(idx, 'horas', e.target.value)} />
                  </td>
                  <td className="py-1.5 px-2">
                    <select className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none print:border-0"
                      value={t.publico} onChange={e => updateTema(idx, 'publico', e.target.value)}>
                      {PUBLICOS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <select className="w-12 text-xs border-b border-gray-200 bg-transparent focus:outline-none print:border-0"
                      value={t.trimestre} onChange={e => updateTema(idx, 'trimestre', e.target.value)}>
                      {[1, 2, 3, 4].map(tr => <option key={tr} value={tr}>T{tr}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    <select className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none print:border-0"
                      value={t.modalidad} onChange={e => updateTema(idx, 'modalidad', e.target.value)}>
                      {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-1 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.obligatorio ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.obligatorio ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="py-1.5 px-1 print:hidden">
                    <button onClick={() => removeTema(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-bold bg-blue-50">
                <td className="py-2 px-2 text-xs text-[#0e0e6e]">TOTAL</td>
                <td className="py-2 px-1 text-center text-xs text-[#0e0e6e]">{totalHoras}</td>
                <td colSpan={5}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Presupuesto */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0e0e6e] border-b pb-2">IV. Presupuesto Estimado</h3>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[80px] focus:outline-none focus:border-[#0e0e6e] print:border-0"
          value={presupuesto}
          onChange={e => setPresupuesto(e.target.value)}
          placeholder={`• Plataforma CNL Compliance (capacitaciones incluidas): ₡[monto]\n• Materiales y recursos adicionales: ₡[monto]\n• Participación en eventos o talleres externos: ₡[monto]\n• TOTAL estimado: ₡[monto]`}
        />
      </section>

      {/* Base legal */}
      <section className="card space-y-2 bg-gray-50 text-sm text-gray-600">
        <h3 className="font-bold text-[#0e0e6e] border-b pb-1 text-sm">V. Base Legal</h3>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Ley 7786 — Ley sobre Estupefacientes, Sustancias Psicotrópicas, Drogas de Uso No Autorizado, Actividades Conexas, Legitimación de Capitales y Financiamiento al Terrorismo</li>
          <li>Acuerdo SUGEF 11-18 — Reglamento para la Gestión del Riesgo de LC/FT/FPADM</li>
          <li>Acuerdo SUGEF 13-19 — Reglamento sobre Programas de Cumplimiento para Sujetos Obligados No Financieros</li>
          <li>Recomendaciones del GAFI — Capacitación continua del personal</li>
        </ul>
      </section>

      {/* Firmas */}
      <div className="card bg-gray-50 text-center text-sm text-gray-500 space-y-4">
        <p className="text-xs text-gray-400">Elaborado y presentado por:</p>
        <div className="flex justify-around text-sm">
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mx-auto mb-1 pt-1"></div>
            <p className="font-semibold text-gray-700">{profile?.nombre || '—'}</p>
            <p className="text-gray-500 text-xs">Oficial de Cumplimiento ALA/CFT</p>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mx-auto mb-1 pt-1"></div>
            <p className="font-semibold text-gray-700">___________________________</p>
            <p className="text-gray-500 text-xs">Aprobado por Junta Directiva</p>
            <p className="text-gray-400 text-xs">Fecha: ________________________</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">{tenant?.nombre} · Plan de Capacitación {anio} · Confidencial</p>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          .max-w-6xl { display: block !important; max-width: 100% !important; }
          .card { border: 1px solid #e5e7eb; box-shadow: none; break-inside: avoid; margin-bottom: 1rem; }
          button { display: none !important; }
          textarea, input, select { border: none !important; background: transparent; }
          .print\\:hidden { display: none !important; }
          .print\\:border-0 { border: none !important; }
        }
      `}</style>
    </div>
  )
}
