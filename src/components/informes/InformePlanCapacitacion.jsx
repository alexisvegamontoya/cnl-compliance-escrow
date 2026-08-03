import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { imprimirDocumento, esc, escMultilinea, fechaLarga } from '../../utils/imprimirDocumento'

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

const BASE_LEGAL = [
  'Ley 7786 — Ley sobre Estupefacientes, Sustancias Psicotrópicas, Drogas de Uso No Autorizado, Actividades Conexas, Legitimación de Capitales y Financiamiento al Terrorismo',
  'Acuerdo SUGEF 11-18 — Reglamento para la Gestión del Riesgo de LC/FT/FPADM',
  'Acuerdo SUGEF 13-19 — Reglamento sobre Programas de Cumplimiento para Sujetos Obligados No Financieros',
  'Recomendaciones del GAFI — Capacitación continua del personal',
]

const introDefault = (entidad) =>
  `El presente Plan de Capacitación fue elaborado con el objetivo de garantizar que el personal de ${entidad} cuente con el conocimiento y las herramientas necesarias para prevenir el uso de los servicios de la entidad en actividades de Legitimación de Capitales, Financiamiento al Terrorismo y Financiamiento a la Proliferación de Armas de Destrucción Masiva (LC/FT/FPADM).

Este plan cumple con lo establecido en la Ley 7786 y el Acuerdo SUGEF 11-18 en lo referente a capacitación continua en materia ALA/CFT.`

const PRESUPUESTO_DEFAULT = `• Plataforma CNL Compliance (capacitaciones incluidas): ₡[monto]
• Materiales y recursos adicionales: ₡[monto]
• Participación en eventos o talleres externos: ₡[monto]
• TOTAL estimado: ₡[monto]`

const MODALIDADES = ['Virtual', 'Presencial', 'Híbrida', 'E-learning']
const PUBLICOS = ['Todo el personal', 'Personal de atención al cliente', 'Oficial de Cumplimiento', 'Gerencia', 'Oficial de Cumplimiento, Gerencia', 'Junta Directiva', 'Oficial de Cumplimiento, Junta Directiva']

export default function InformePlanCapacitacion({ tenantEfectivo }) {
  const { tenant: tenantPropio, profile } = useAuth()
  const tenant = tenantEfectivo || tenantPropio
  const anio = anioActual
  const [guardado, setGuardado] = useState(false)

  // Auto-registrar en BD cuando se muestra el componente (primera vez por año)
  useEffect(() => {
    if (!tenant?.id) return
    supabase.from('informes_generados').insert({
      tenant_id: tenant.id, tipo_informe: 'capacitacion', periodo: String(anio),
      generado_por: profile?.id, generado_por_nombre: profile?.nombre,
      resumen_json: { anio },
    }).then(() => setGuardado(true)).catch(() => {})
  }, [tenant?.id]) // eslint-disable-line

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

  const textoIntro       = intro.trim() || introDefault(tenant?.nombre || 'la entidad')
  const textoPresupuesto = presupuesto.trim() || PRESUPUESTO_DEFAULT

  const imprimir = () => {
    const filas = temas.map(t => `
      <tr>
        <td>${esc(t.tema) || '—'}</td>
        <td class="centro">${esc(t.horas)}</td>
        <td>${esc(t.publico)}</td>
        <td class="centro">T${esc(t.trimestre)}</td>
        <td>${esc(t.modalidad)}</td>
        <td class="centro">${t.obligatorio ? 'Sí' : 'No'}</td>
      </tr>`).join('')

    const resumenTrimestres = [1, 2, 3, 4].map(tr => {
      const grupo = porTrimestre[tr - 1]
      const horas = grupo.reduce((s, t) => s + Number(t.horas || 0), 0)
      return `<div class="stat">
        <div class="val">${grupo.length}</div>
        <div class="lbl">${['I', 'II', 'III', 'IV'][tr - 1]} Trimestre · ${horas} ${horas === 1 ? 'hora' : 'horas'}</div>
      </div>`
    }).join('')

    const cuerpo = `
      <div class="portada">
        <div class="confidencial">Documento para Aprobación — Junta Directiva</div>
        <h1>PLAN DE CAPACITACIÓN ${anio}</h1>
        <h2>Prevención LC/FT/FPADM</h2>
        <div class="meta-grid">
          <div class="meta-item"><div class="lbl">Entidad</div><div class="val">${esc(tenant?.nombre || '—')}</div></div>
          <div class="meta-item"><div class="lbl">Responsable</div><div class="val">${esc(profile?.nombre || '—')}</div></div>
          <div class="meta-item"><div class="lbl">Total horas planificadas</div><div class="val">${totalHoras} horas</div></div>
          <div class="meta-item"><div class="lbl">Proveedor principal</div><div class="val">${esc(proveedor || '—')}</div></div>
        </div>
      </div>

      <section class="bloque">
        <h3>I. Justificación</h3>
        <div class="texto">${escMultilinea(textoIntro)}</div>
      </section>

      <section class="bloque">
        <h3>II. Resumen por Trimestre</h3>
        <div class="stats c4">${resumenTrimestres}</div>
      </section>

      <section class="bloque">
        <h3>III. Detalle de Actividades de Capacitación</h3>
        <table class="datos">
          <thead>
            <tr>
              <th>Tema / Contenido</th>
              <th class="centro" style="width:8%">Horas</th>
              <th style="width:24%">Público objetivo</th>
              <th class="centro" style="width:9%">Trimestre</th>
              <th style="width:12%">Modalidad</th>
              <th class="centro" style="width:10%">Obligatorio</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
            <tr class="total">
              <td>TOTAL</td>
              <td class="centro">${totalHoras}</td>
              <td colspan="4"></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="bloque">
        <h3>IV. Presupuesto Estimado</h3>
        <div class="texto">${escMultilinea(textoPresupuesto)}</div>
      </section>

      <section class="bloque">
        <h3>V. Base Legal</h3>
        <ul class="legal">${BASE_LEGAL.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
      </section>

      <div class="firmas">
        <div class="firma">
          <div class="linea"></div>
          <div class="nombre">${esc(profile?.nombre || '—')}</div>
          <div class="cargo">Oficial de Cumplimiento ALA/CFT</div>
        </div>
        <div class="firma">
          <div class="linea"></div>
          <div class="nombre">Aprobado por Junta Directiva</div>
          <div class="cargo">Representante Legal</div>
          <div class="fecha">Fecha: ________________________</div>
        </div>
      </div>

      <div class="pie">
        ${esc(tenant?.nombre || '')} · Plan de Capacitación ${anio} · Documento confidencial<br>
        Elaborado el ${esc(fechaLarga())}
      </div>`

    imprimirDocumento({
      titulo: `Plan de Capacitación ${anio}`,
      subtitulo: 'Prevención LC/FT/FPADM',
      cuerpo, tenant, profile,
    })
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan de Capacitación — Cumplimiento ALA/CFT</h1>
          <p className="text-gray-500 text-sm mt-1">Período {anio} · Para aprobación de Junta Directiva</p>
        </div>
        <button onClick={imprimir} className="btn-primary text-sm print:hidden">🖨️ Imprimir / PDF</button>
      </div>

      {/* Portada */}
      <div className="card border-2 border-[#0a1247] bg-blue-50 print:border-0">
        <div className="text-center py-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-[#0a1247] font-semibold">Documento para Aprobación — Junta Directiva</p>
          <h2 className="text-2xl font-bold text-[#0a1247]">PLAN DE CAPACITACIÓN {anio}</h2>
          <h3 className="text-lg font-semibold text-gray-700">Prevención LC/FT/FPADM</h3>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-left">
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Entidad</p><p className="font-semibold text-gray-800">{tenant?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Responsable</p><p className="font-semibold text-gray-800">{profile?.nombre || '—'}</p></div>
            <div className="bg-white rounded-lg p-3"><p className="text-gray-400 text-xs">Total horas planificadas</p><p className="font-bold text-[#0a1247]">{totalHoras} horas</p></div>
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
        <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">I. Justificación</h3>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[100px] focus:outline-none focus:border-[#0a1247] print:border-0"
          value={intro}
          onChange={e => setIntro(e.target.value)}
          placeholder={introDefault(tenant?.nombre || 'la entidad')}
        />
      </section>

      {/* Resumen por trimestre */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">II. Resumen por Trimestre</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(tr => (
            <div key={tr} className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <p className="font-semibold text-[#0a1247] text-xs mb-1">
                {['I', 'II', 'III', 'IV'][tr - 1]} Trimestre
              </p>
              <p className="text-2xl font-bold text-[#0a1247]">{porTrimestre[tr - 1].length}</p>
              <p className="text-xs text-gray-500">actividades · {porTrimestre[tr - 1].reduce((s, t) => s + Number(t.horas || 0), 0)} horas</p>
            </div>
          ))}
        </div>
      </section>

      {/* Detalle */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-bold text-[#0a1247]">III. Detalle de Actividades de Capacitación</h3>
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
                    <input className="w-full text-xs border-b border-gray-200 bg-transparent focus:outline-none focus:border-[#0a1247] print:border-0"
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
                <td className="py-2 px-2 text-xs text-[#0a1247]">TOTAL</td>
                <td className="py-2 px-1 text-center text-xs text-[#0a1247]">{totalHoras}</td>
                <td colSpan={5}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Presupuesto */}
      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-[#0a1247] border-b pb-2">IV. Presupuesto Estimado</h3>
        <textarea
          className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 min-h-[80px] focus:outline-none focus:border-[#0a1247] print:border-0"
          value={presupuesto}
          onChange={e => setPresupuesto(e.target.value)}
          placeholder={PRESUPUESTO_DEFAULT}
        />
      </section>

      {/* Base legal */}
      <section className="card space-y-2 bg-gray-50 text-sm text-gray-600">
        <h3 className="font-bold text-[#0a1247] border-b pb-1 text-sm">V. Base Legal</h3>
        <ul className="list-disc list-inside space-y-1 text-xs">
          {BASE_LEGAL.map(b => <li key={b}>{b}</li>)}
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
        {guardado && <p className="text-xs mt-1 text-green-600">✅ Plan registrado en el sistema</p>}
      </div>

    </div>
  )
}
