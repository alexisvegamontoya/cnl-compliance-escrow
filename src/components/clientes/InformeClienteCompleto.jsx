/**
 * InformeClienteCompleto.jsx
 * Genera los 3 informes de compliance desde el perfil del cliente:
 *   1. Calificación de Riesgo (con criterios editables y cálculo automático)
 *   2. Consulta Listas Internacionales y PEP (todos los participantes)
 *   3. Debida Diligencia con checklist SUGEF 13-19
 *
 * Cada sección es imprimible en forma individual o todo junto.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  CRITERIOS_CLIENTE, CRITERIOS_GEO, CRITERIOS_PRODUCTOS, CRITERIOS_CANALES,
  PESOS_CONSOLIDADO, OPCIONES, ESCALA, clasificar, PAISES_RIESGO,
  ACTIVIDADES_PROFESIONES,
} from '../../lib/metodologiaRiesgo'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function nombreCompleto(c) {
  if (!c) return '—'
  if (c.tipo_persona === 'juridica') return c.nombre_empresa || c.nombre_cliente || '—'
  return [c.nombre_cliente, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ') || '—'
}

function paisRiesgoValor(pais) {
  if (!pais) return 1
  const p = PAISES_RIESGO.find(pr => pr.pais?.toLowerCase() === pais.toLowerCase())
  return p?.valor || 1
}

function actividadValor(nombre) {
  if (!nombre) return 1
  const a = ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === nombre.toLowerCase())
  return a?.valor || 1
}

function calcScore(respuestas, tipo) {
  const t = tipo === 'juridica' ? 'juridica' : 'fisica'
  const pesos = PESOS_CONSOLIDADO[t]
  const grupos = [
    { key: 'cliente',   criterios: CRITERIOS_CLIENTE[t]   || [] },
    { key: 'geo',       criterios: CRITERIOS_GEO[t]       || [] },
    { key: 'productos', criterios: CRITERIOS_PRODUCTOS[t] || [] },
    { key: 'canales',   criterios: CRITERIOS_CANALES[t]   || [] },
  ]
  let scoreTotal = 0
  const desglose = {}
  grupos.forEach(({ key, criterios }) => {
    let sub = 0
    criterios.forEach(c => {
      const v = parseFloat(respuestas[c.key]) || 1
      sub += v * c.peso
    })
    desglose[key] = sub
    scoreTotal += sub * (pesos[key] || 0)
  })
  return { scoreTotal: parseFloat(scoreTotal.toFixed(3)), desglose }
}

function nivelColor(nivel) {
  return nivel === 'bajo'  ? '#16a34a' :
         nivel === 'medio' ? '#ca8a04' :
         nivel === 'alto'  ? '#dc2626' : '#6b7280'
}

// Extraer todos los participantes (cliente + personas_relacionadas + sub_personas recursivo)
function extraerParticipantes(cliente, personas) {
  const lista = []
  // El cliente mismo
  lista.push({
    nombre: nombreCompleto(cliente),
    id: cliente.cedula_juridica || cliente.numero_identificacion || '',
    tipo: cliente.tipo_persona === 'juridica' ? 'Empresa cliente' : 'Persona cliente',
    rol: 'Cliente principal',
    tipo_entidad: cliente.tipo_persona === 'juridica' ? 'persona_juridica' : 'persona_fisica',
  })
  function agregarPersonas(arr, profundidad = 0) {
    arr.forEach(p => {
      lista.push({
        nombre: p.nombre,
        id: p.identificacion || '',
        tipo: p.tipo_entidad === 'persona_juridica' ? 'Persona jurídica' : 'Persona física',
        rol: p.tipo_relacion?.replace(/_/g, ' ') || '',
        cargo: p.cargo || '',
        porcentaje: p.porcentaje_participacion || null,
        tipo_entidad: p.tipo_entidad,
        profundidad,
      })
      if (p.sub_personas?.length) agregarPersonas(p.sub_personas, profundidad + 1)
    })
  }
  agregarPersonas(personas)
  return lista
}

// ─── Checklist DD ─────────────────────────────────────────────────────────────
const CHECKLIST_FISICA = [
  { id: 'id_vigente',        label: 'Copia de identificación vigente (cédula / DIMEX / pasaporte)', obligatorio: true },
  { id: 'comprobante_dom',   label: 'Comprobante de domicilio (no mayor a 3 meses)', obligatorio: true },
  { id: 'comprobante_ing',   label: 'Comprobante de ingreso (colilla CCSS, carta patronal o declaración)', obligatorio: true },
  { id: 'form_vinculacion',  label: 'Formulario de vinculación firmado por el cliente', obligatorio: true },
  { id: 'proposito',         label: 'Declaración de propósito de la relación comercial', obligatorio: true },
  { id: 'origen_fondos',     label: 'Declaración de origen de fondos', obligatorio: true },
  { id: 'pep_verificacion',  label: 'Verificación PEP (persona expuesta políticamente)', obligatorio: true },
  { id: 'listas_intl',       label: 'Verificación en listas internacionales (OFAC, ONU, UE)', obligatorio: true },
  { id: 'ccss',              label: 'Verificación estado CCSS (mora patronal, si aplica)', obligatorio: false },
  { id: 'sugef_sujeto',      label: 'Verificación SUGEF (si es sujeto obligado Art. 15/15bis/15ter)', obligatorio: false },
  { id: 'protectoras',       label: 'Consulta en centrales de riesgo / protectoras de crédito', obligatorio: false },
  { id: 'fotografia',        label: 'Fotografía reciente del cliente', obligatorio: false },
  { id: 'decl_bf',           label: 'Declaración de beneficiario final (si aplica)', obligatorio: false },
  { id: 'referencias',       label: 'Referencias comerciales o bancarias', obligatorio: false },
  { id: 'perfil_trans',      label: 'Perfil transaccional estimado', obligatorio: true },
]

const CHECKLIST_JURIDICA = [
  { id: 'personeria',        label: 'Certificación de personería jurídica vigente (no mayor a 30 días)', obligatorio: true },
  { id: 'escritura',         label: 'Copia de escritura de constitución / estatutos', obligatorio: true },
  { id: 'acta_junta',        label: 'Acta de junta directiva vigente con nombramiento de representantes', obligatorio: true },
  { id: 'nomina_acc',        label: 'Nómina de accionistas / socios actualizada', obligatorio: true },
  { id: 'id_representantes', label: 'Identificación de todos los representantes legales', obligatorio: true },
  { id: 'id_junta',          label: 'Identificación de miembros de junta directiva', obligatorio: true },
  { id: 'id_socios',         label: 'Identificación de socios con ≥10% de participación', obligatorio: true },
  { id: 'decl_bf',           label: 'Declaración de beneficiario final (cadena hasta persona física)', obligatorio: true },
  { id: 'comprobante_dom',   label: 'Comprobante de domicilio de la empresa (no mayor a 3 meses)', obligatorio: true },
  { id: 'form_vinculacion',  label: 'Formulario de vinculación firmado por representante legal', obligatorio: true },
  { id: 'proposito',         label: 'Declaración de propósito de la relación comercial', obligatorio: true },
  { id: 'origen_fondos',     label: 'Declaración de origen de fondos de la empresa', obligatorio: true },
  { id: 'listas_empresa',    label: 'Verificación de la empresa en listas internacionales', obligatorio: true },
  { id: 'listas_representantes', label: 'Verificación de representantes legales en listas y PEP', obligatorio: true },
  { id: 'listas_socios',     label: 'Verificación de socios en listas internacionales y PEP', obligatorio: true },
  { id: 'ccss',              label: 'Verificación estado CCSS (mora patronal)', obligatorio: true },
  { id: 'sugef_sujeto',      label: 'Verificación SUGEF (si es sujeto obligado Art. 15/15bis/15ter)', obligatorio: false },
  { id: 'estados_fin',       label: 'Estados financieros recientes o declaración de renta', obligatorio: false },
  { id: 'referencias',       label: 'Referencias comerciales o bancarias', obligatorio: false },
  { id: 'perfil_trans',      label: 'Perfil transaccional estimado de la empresa', obligatorio: true },
]

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: CALIFICACIÓN DE RIESGO
// ─────────────────────────────────────────────────────────────────────────────
function SeccionCalificacion({ cliente }) {
  const tipo = cliente.tipo_persona === 'juridica' ? 'juridica' : 'fisica'

  // Pre-llenar desde datos del cliente
  const prefill = useCallback(() => {
    const r = {}
    // Profesión / actividad
    const actVal = tipo === 'fisica'
      ? (cliente.profesion_valor || actividadValor(cliente.profesion_nombre || cliente.actividad_economica))
      : (cliente.actividad_eco_valor || actividadValor(cliente.actividad_eco_nombre || cliente.actividad_economica))
    r.profesion      = actVal
    r.actividad_eco  = actVal
    r.servicios      = actVal
    // País
    const paisVal = paisRiesgoValor(cliente.pais_nacimiento || cliente.pais_ubicacion)
    r.pais_origen    = paisVal
    r.residencia     = paisRiesgoValor(cliente.pais_ubicacion || cliente.pais_nacimiento)
    r.ubicacion_geo  = paisVal
    r.casa_matriz    = paisVal
    r.transfronterizo = (paisVal > 1 ? 2 : 0.5)
    r.op_nacional    = 1; r.op_internacional = 0.5
    // Ingreso
    const ing = parseFloat(cliente.ingreso_mensual_est) || 0
    r.ingreso_mensual = ing > 6000 ? 1 : ing > 4000 ? 1.5 : ing > 2000 ? 2 : ing > 1000 ? 2.5 : 3
    // Defaults
    r.acceso_info    = 1; r.pep = 1; r.listas_obs = 1
    r.struct_admin   = tipo === 'juridica' ? 3 : undefined
    r.struct_acc     = 1; r.efectivo = 1; r.protectoras = 1
    r.info_ingreso   = 1; r.anos_operacion = 1
    r.vol_trans = 0.5; r.cant_trans = 0.5; r.anos_exp = 1
    r.como_labor = 1; r.cant_lugares = 1; r.cant_sucursales = 1
    r.tipo_vendedor = 1; r.posicion_mkt = 1; r.struct_ventas = 1
    return r
  }, [cliente, tipo])

  const [resp, setResp] = useState(prefill)
  const { scoreTotal, desglose } = calcScore(resp, tipo)
  const nivel = clasificar(scoreTotal)

  const grupos = [
    { key: 'cliente',   label: 'Factor Cliente',               criterios: CRITERIOS_CLIENTE[tipo] },
    { key: 'geo',       label: 'Factor Zona Geográfica',        criterios: CRITERIOS_GEO[tipo] },
    { key: 'productos', label: 'Factor Productos/Servicios',    criterios: CRITERIOS_PRODUCTOS[tipo] },
    { key: 'canales',   label: 'Factor Canales de Distribución',criterios: CRITERIOS_CANALES[tipo] },
  ]

  const opcionesPara = (key) => {
    if (['pais_origen','residencia','ubicacion_geo','casa_matriz'].includes(key)) return OPCIONES.pais_riesgo
    return OPCIONES[key] || []
  }

  return (
    <div className="space-y-6 print-section" id="seccion-calificacion">
      {/* Encabezado del informe */}
      <div className="border-b-2 border-gray-800 pb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Informe de Compliance — CNL Craniley Compliance Services</p>
        <h2 className="text-xl font-bold text-gray-900">Calificación de Riesgo del Cliente</h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Cliente: <strong>{nombreCompleto(cliente)}</strong> ·
          Identificación: {cliente.cedula_juridica || cliente.numero_identificacion || '—'} ·
          Fecha: {new Date().toLocaleDateString('es-CR')}
        </p>
      </div>

      {/* Score resumen */}
      <div className="flex items-center gap-6 p-4 rounded-xl border-2"
        style={{ borderColor: nivelColor(nivel) + '60', background: nivelColor(nivel) + '10' }}>
        <div className="text-center min-w-[100px]">
          <p className="text-4xl font-black" style={{ color: nivelColor(nivel) }}>{scoreTotal.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Puntuación (0–3)</p>
        </div>
        <div>
          <p className="text-2xl font-bold capitalize" style={{ color: nivelColor(nivel) }}>
            {nivel === 'bajo' ? '🟢' : nivel === 'medio' ? '🟡' : '🔴'} Riesgo {nivel}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Basado en metodología de calificación según Acuerdo SUGEF 13-19 y Basel AML Index 2023
          </p>
          <div className="flex gap-4 mt-2 text-xs text-gray-600">
            <span>Factor cliente: <strong>{desglose.cliente?.toFixed(2)}</strong></span>
            <span>Zona geo: <strong>{desglose.geo?.toFixed(2)}</strong></span>
            {tipo === 'juridica' && <>
              <span>Productos: <strong>{desglose.productos?.toFixed(2)}</strong></span>
              <span>Canales: <strong>{desglose.canales?.toFixed(2)}</strong></span>
            </>}
          </div>
        </div>
      </div>

      {/* Criterios por grupo */}
      {grupos.map(g => (
        <div key={g.key}>
          <p className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-1 mb-2">{g.label}</p>
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Criterio</th>
                <th className="text-left px-3 py-2 w-1/2">Respuesta</th>
                <th className="text-right px-3 py-2 w-16">Peso</th>
                <th className="text-right px-3 py-2 w-16">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {g.criterios.map(c => {
                const opts = opcionesPara(c.key)
                const val = parseFloat(resp[c.key]) || 1
                const selLabel = opts.find(o => o.valor === val)?.label || '—'
                return (
                  <tr key={c.key}>
                    <td className="px-3 py-2 text-gray-700">{c.label}</td>
                    <td className="px-3 py-2">
                      {opts.length > 0 ? (
                        <select className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 no-print"
                          value={val}
                          onChange={e => setResp(r => ({ ...r, [c.key]: parseFloat(e.target.value) }))}>
                          {opts.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                        </select>
                      ) : null}
                      <span className="text-xs text-gray-600 only-print">{selLabel}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">{(c.peso * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-800">{val.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Bases legales */}
      <div className="text-xs text-gray-400 border-t pt-3 space-y-1">
        <p>⚖ Base legal: Ley 7786 (reformada por Ley 9449), Acuerdo SUGEF 13-19, Recomendaciones GAFI</p>
        <p>📋 Metodología: N06 — Calificación de Riesgo del Cliente, adaptada del Basel AML Index 2023</p>
        <p>Generado: {new Date().toLocaleString('es-CR')} | CNL Craniley Compliance Services | www.cnl-cr.com</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: LISTAS INTERNACIONALES Y PEP
// ─────────────────────────────────────────────────────────────────────────────
function SeccionListas({ cliente, personas }) {
  const participantes = extraerParticipantes(cliente, personas)
  const [resultados, setResultados] = useState({}) // { nombre: { pep: bool, listas: bool, manual: '' } }
  const [cargando, setCargando] = useState(false)
  const [buscado, setBuscado] = useState(false)

  const consultarListas = async () => {
    setCargando(true)
    const nuevos = {}
    for (const p of participantes) {
      // Verificar en tabla pep_uif interna
      const terminos = p.nombre.split(' ').filter(t => t.length > 2)
      let pepEncontrado = false
      if (terminos.length > 0) {
        const { data } = await supabase.from('pep_uif')
          .select('nombre_completo')
          .or(terminos.map(t => `nombre_completo.ilike.%${t}%`).join(','))
          .limit(3)
        pepEncontrado = (data?.length || 0) > 0
      }
      nuevos[p.nombre] = {
        pep_interno: pepEncontrado,
        listas_manual: 'pendiente', // El usuario completa la verificación externa
        sugef_sujeto: 'pendiente',
        notas: '',
      }
    }
    setResultados(nuevos)
    setBuscado(true)
    setCargando(false)
  }

  const setManual = (nombre, campo, valor) => {
    setResultados(r => ({ ...r, [nombre]: { ...r[nombre], [campo]: valor } }))
  }

  return (
    <div className="space-y-6" id="seccion-listas">
      <div className="border-b-2 border-gray-800 pb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Informe de Compliance — CNL Craniley Compliance Services</p>
        <h2 className="text-xl font-bold text-gray-900">Verificación en Listas Internacionales y PEP</h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Cliente: <strong>{nombreCompleto(cliente)}</strong> · Fecha: {new Date().toLocaleDateString('es-CR')}
        </p>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <p className="font-semibold mb-1">Alcance de la verificación</p>
        <p>Se verifica al cliente principal y a todos los participantes de la estructura (representantes, junta directiva, socios y beneficiarios finales) en la base de datos PEP del ICD/UIF y se registra la verificación manual en OFAC, ONU y UE.</p>
      </div>

      {/* Lista de participantes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-gray-700">
            Participantes a verificar ({participantes.length})
          </p>
          {!buscado && (
            <button onClick={consultarListas} disabled={cargando}
              className="px-4 py-1.5 bg-brand-700 text-white text-xs font-medium rounded-lg hover:bg-brand-800 disabled:opacity-60 no-print">
              {cargando ? '⟳ Consultando...' : '🔎 Consultar en base PEP interna'}
            </button>
          )}
        </div>

        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Rol</th>
              <th className="text-left px-3 py-2">Identificación</th>
              <th className="text-center px-3 py-2">PEP/UIF CR</th>
              <th className="text-center px-3 py-2">OFAC/ONU/UE</th>
              <th className="text-center px-3 py-2">SUGEF</th>
              <th className="text-left px-3 py-2">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {participantes.map((p, i) => {
              const r = resultados[p.nombre] || {}
              return (
                <tr key={i} className={i === 0 ? 'bg-blue-50' : ''}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{p.tipo_entidad === 'persona_juridica' ? '🏢' : '👤'}</span>
                      <span className="font-medium text-gray-900">{p.nombre}</span>
                    </div>
                    {p.profundidad > 0 && (
                      <p className="text-xs text-gray-400 ml-5">{'— '.repeat(p.profundidad)}Nivel {p.profundidad + 1}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 capitalize">{p.rol}{p.cargo ? ` · ${p.cargo}` : ''}{p.porcentaje ? ` (${p.porcentaje}%)` : ''}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.id || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {!buscado ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : r.pep_interno ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">⚠ POSITIVO</span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Negativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <select className="text-xs border border-gray-200 rounded px-1 py-0.5 no-print"
                      value={r.listas_manual || 'pendiente'}
                      onChange={e => setManual(p.nombre, 'listas_manual', e.target.value)}>
                      <option value="pendiente">⏳ Pendiente</option>
                      <option value="negativo">✓ Negativo</option>
                      <option value="positivo">⚠ Positivo</option>
                    </select>
                    <span className={`text-xs only-print ${r.listas_manual === 'positivo' ? 'text-red-600 font-bold' : r.listas_manual === 'negativo' ? 'text-green-600' : 'text-gray-400'}`}>
                      {r.listas_manual === 'positivo' ? '⚠ POSITIVO' : r.listas_manual === 'negativo' ? '✓ Negativo' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <select className="text-xs border border-gray-200 rounded px-1 py-0.5 no-print"
                      value={r.sugef_sujeto || 'pendiente'}
                      onChange={e => setManual(p.nombre, 'sugef_sujeto', e.target.value)}>
                      <option value="pendiente">⏳ Pendiente</option>
                      <option value="no_sujeto">No sujeto</option>
                      <option value="art15">Art. 15</option>
                      <option value="art15bis">Art. 15 bis</option>
                      <option value="art15ter">Art. 15 ter</option>
                    </select>
                    <span className="text-xs only-print">{r.sugef_sujeto || 'Pendiente'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 no-print"
                      placeholder="Observaciones..."
                      value={r.notas || ''}
                      onChange={e => setManual(p.nombre, 'notas', e.target.value)} />
                    <span className="text-xs text-gray-500 only-print">{r.notas}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Links externos */}
      <div className="grid grid-cols-2 gap-3 no-print">
        {[
          { label: '🇺🇸 OFAC SDN List',      url: 'https://sanctionssearch.ofac.treas.gov/' },
          { label: '🇺🇳 ONU Sanciones',       url: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list' },
          { label: '🇪🇺 UE Sanciones',        url: 'https://www.sanctionsmap.eu/' },
          { label: '🇨🇷 ICD/UIF Costa Rica',  url: 'https://www.icd.go.cr/' },
        ].map(l => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg text-xs text-brand-700 hover:bg-brand-50">
            {l.label} ↗
          </a>
        ))}
      </div>

      {/* Declaración */}
      <div className="border border-gray-300 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Declaración del Oficial de Cumplimiento</p>
        <p className="text-xs text-gray-500">
          Por medio de la presente, el Oficial de Cumplimiento certifica que se realizó la verificación del cliente y sus participantes en las listas internacionales indicadas, con los resultados consignados en este informe.
        </p>
        <div className="grid grid-cols-2 gap-6 pt-4">
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Firma del Oficial de Cumplimiento</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Fecha y sello</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400 border-t pt-3">
        <p>Generado: {new Date().toLocaleString('es-CR')} | CNL Craniley Compliance Services | www.cnl-cr.com</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: DEBIDA DILIGENCIA CON CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────
function SeccionDebidaDiligencia({ cliente, personas }) {
  const tipo = cliente.tipo_persona === 'juridica' ? 'juridica' : 'fisica'
  const checklist = tipo === 'juridica' ? CHECKLIST_JURIDICA : CHECKLIST_FISICA

  const [items, setItems] = useState(() =>
    Object.fromEntries(checklist.map(c => [c.id, { estado: 'pendiente', notas: '' }]))
  )
  const [observaciones, setObservaciones] = useState('')

  // Pre-llenar ítems que ya tenemos datos en el sistema
  useEffect(() => {
    setItems(prev => {
      const updated = { ...prev }
      if (cliente.numero_identificacion || cliente.cedula_juridica) updated.id_vigente    = { ...updated.id_vigente,    estado: 'disponible' }
      if (cliente.numero_identificacion || cliente.cedula_juridica) updated.personeria    = { ...updated.personeria,    estado: 'disponible' }
      if (cliente.direccion_exacta)  { updated.comprobante_dom = { ...updated.comprobante_dom, estado: 'disponible' }; updated.comprobante_dom = { ...updated.comprobante_dom, notas: cliente.direccion_exacta } }
      if (cliente.ingreso_mensual_est || cliente.origen_fondos) updated.comprobante_ing = { ...updated.comprobante_ing, estado: 'disponible' }
      if (cliente.proposito_relacion) updated.proposito   = { ...updated.proposito,   estado: 'disponible', notas: cliente.proposito_relacion }
      if (cliente.origen_fondos)      updated.origen_fondos = { ...updated.origen_fondos, estado: 'disponible', notas: cliente.origen_fondos }
      if (cliente.actividad_eco_nombre || cliente.actividad_economica) {
        if (updated.acta_junta) updated.acta_junta = { ...updated.acta_junta }
      }
      return updated
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setItemEstado = (id, campo, valor) => {
    setItems(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }

  const totalItems   = checklist.length
  const disponibles  = checklist.filter(c => items[c.id]?.estado === 'disponible').length
  const pendientes   = checklist.filter(c => items[c.id]?.estado === 'pendiente').length
  const noAplica     = checklist.filter(c => items[c.id]?.estado === 'no_aplica').length
  const porcentaje   = Math.round((disponibles / totalItems) * 100)

  const participantes = extraerParticipantes(cliente, personas)

  return (
    <div className="space-y-6" id="seccion-dd">
      <div className="border-b-2 border-gray-800 pb-3">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Informe de Compliance — CNL Craniley Compliance Services</p>
        <h2 className="text-xl font-bold text-gray-900">Debida Diligencia del Cliente</h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Cliente: <strong>{nombreCompleto(cliente)}</strong> ·
          ID: {cliente.cedula_juridica || cliente.numero_identificacion || '—'} ·
          Fecha: {new Date().toLocaleDateString('es-CR')}
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total ítems', v: totalItems, cls: 'text-gray-800' },
          { label: 'Disponibles', v: disponibles, cls: 'text-green-700' },
          { label: 'Pendientes', v: pendientes, cls: 'text-amber-700' },
          { label: 'Avance', v: `${porcentaje}%`, cls: porcentaje === 100 ? 'text-green-700' : porcentaje > 70 ? 'text-yellow-700' : 'text-red-700' },
        ].map(s => (
          <div key={s.label} className="card text-center py-3">
            <p className={`text-2xl font-black ${s.cls}`}>{s.v}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Completitud del expediente</span><span>{porcentaje}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full transition-all ${porcentaje === 100 ? 'bg-green-500' : porcentaje > 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      {/* Ficha del cliente */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-bold text-gray-700 border-b pb-2">📋 Datos del cliente en sistema</p>
        <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-xs">
          {[
            ['Tipo de persona', tipo === 'juridica' ? 'Persona Jurídica' : 'Persona Física'],
            ['Identificación', cliente.cedula_juridica || cliente.numero_identificacion || '—'],
            ['Nombre / Razón social', nombreCompleto(cliente)],
            ['Actividad económica', cliente.actividad_eco_nombre || cliente.profesion_nombre || cliente.actividad_economica || '—'],
            ['País de origen', cliente.pais_nacimiento || cliente.pais_constitucion || '—'],
            ['País de residencia', cliente.pais_ubicacion || '—'],
            ['Provincia / Cantón', [cliente.provincia, cliente.canton].filter(Boolean).join(', ') || '—'],
            ['Teléfono', cliente.telefono || '—'],
            ['Correo', cliente.correo_electronico || '—'],
            ['Propósito relación', cliente.proposito_relacion || '—'],
            ['Origen de fondos', cliente.origen_fondos || '—'],
            ['Ingreso mensual est.', cliente.ingreso_mensual_est ? `USD ${Number(cliente.ingreso_mensual_est).toLocaleString()}` : '—'],
            ['Vinculación', cliente.fecha_vinculacion || '—'],
          ].map(([l, v]) => (
            <div key={l}>
              <span className="text-gray-400">{l}: </span>
              <span className="font-medium text-gray-800">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Participantes (empresas) */}
      {tipo === 'juridica' && participantes.length > 1 && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-bold text-gray-700 border-b pb-2">🏢 Estructura empresarial</p>
          <div className="space-y-1">
            {participantes.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ paddingLeft: `${(p.profundidad || 0) * 16}px` }}>
                <span>{p.tipo_entidad === 'persona_juridica' ? '🏢' : '👤'}</span>
                <span className="font-medium">{p.nombre}</span>
                {p.id && <span className="text-gray-400 font-mono">({p.id})</span>}
                <span className="text-gray-500">· {p.rol}</span>
                {p.porcentaje && <span className="text-blue-600">{p.porcentaje}%</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      <div>
        <p className="text-sm font-bold text-gray-700 border-b border-gray-200 pb-2 mb-3">
          ✅ Checklist de Debida Diligencia — SUGEF 13-19
        </p>
        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 w-8">#</th>
              <th className="text-left px-3 py-2">Documento / Verificación</th>
              <th className="text-center px-3 py-2 w-8">Req.</th>
              <th className="text-center px-3 py-2 w-32">Estado</th>
              <th className="text-left px-3 py-2">Notas / Referencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {checklist.map((c, i) => {
              const item = items[c.id] || { estado: 'pendiente', notas: '' }
              const bgColor = item.estado === 'disponible' ? 'bg-green-50' :
                              item.estado === 'no_aplica'  ? 'bg-gray-50' : ''
              return (
                <tr key={c.id} className={bgColor}>
                  <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-800">{c.label}</td>
                  <td className="px-3 py-2 text-center">
                    {c.obligatorio
                      ? <span className="text-xs bg-red-100 text-red-600 px-1 rounded">Obl</span>
                      : <span className="text-xs text-gray-400">Opt</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-center">
                    <select className="text-xs border border-gray-200 rounded px-1 py-0.5 no-print w-full"
                      value={item.estado}
                      onChange={e => setItemEstado(c.id, 'estado', e.target.value)}>
                      <option value="pendiente">⏳ Pendiente</option>
                      <option value="disponible">✅ Disponible</option>
                      <option value="solicitado">📤 Solicitado</option>
                      <option value="no_aplica">N/A</option>
                    </select>
                    <span className={`text-xs only-print font-medium ${
                      item.estado === 'disponible' ? 'text-green-700' :
                      item.estado === 'solicitado' ? 'text-blue-700' :
                      item.estado === 'no_aplica'  ? 'text-gray-400' : 'text-amber-700'
                    }`}>
                      {item.estado === 'disponible' ? '✅ Disponible' :
                       item.estado === 'solicitado' ? '📤 Solicitado' :
                       item.estado === 'no_aplica'  ? 'N/A' : '⏳ Pendiente'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 no-print"
                      placeholder="Observaciones..."
                      value={item.notas}
                      onChange={e => setItemEstado(c.id, 'notas', e.target.value)} />
                    <span className="text-xs text-gray-500 only-print">{item.notas}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Observaciones generales */}
      <div>
        <label className="text-sm font-bold text-gray-700">Observaciones y conclusión</label>
        <textarea className="mt-2 input text-sm w-full no-print" rows={4}
          placeholder="Resumen de la debida diligencia, hallazgos relevantes, conclusión del Oficial de Cumplimiento..."
          value={observaciones} onChange={e => setObservaciones(e.target.value)} />
        {observaciones && (
          <div className="mt-2 p-3 border border-gray-200 rounded-lg text-sm text-gray-700 only-print">
            {observaciones}
          </div>
        )}
      </div>

      {/* Firma */}
      <div className="border border-gray-300 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-8 pt-2">
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Firma del Oficial de Cumplimiento</p>
              <p className="text-xs text-gray-400 mt-1">Fecha: ___________________________</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Visto bueno del Representante Legal / Junta Directiva</p>
              <p className="text-xs text-gray-400 mt-1">Fecha: ___________________________</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400 border-t pt-3">
        <p>⚖ Base legal: Ley 7786, Acuerdo SUGEF 13-19 Art. 27-30, Recomendaciones GAFI 10, 12, 22, 24</p>
        <p>Generado: {new Date().toLocaleString('es-CR')} | CNL Craniley Compliance Services | www.cnl-cr.com</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function InformeClienteCompleto({ cliente, onClose }) {
  const [tab, setTab]     = useState('calificacion')
  const [personas, setPersonas] = useState([])
  const printRef = useRef(null)

  useEffect(() => {
    if (!cliente?.id) return
    supabase.from('clientes_personas_relacionadas')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setPersonas(data || []))
  }, [cliente?.id])

  const imprimirSeccion = (seccionId) => {
    const seccion = document.getElementById(seccionId)
    if (!seccion) return
    const contenido = seccion.innerHTML
    const ventana = window.open('', '_blank', 'width=900,height=700')
    ventana.document.write(`
      <html><head>
        <title>Informe Compliance — ${nombreCompleto(cliente)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px 40px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px; }
          th { background: #f5f5f5; font-weight: 600; }
          h2 { font-size: 16px; margin-bottom: 4px; }
          .no-print { display: none !important; }
          .only-print { display: inline !important; }
          .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 8px 0; }
          select, input, textarea { display: none !important; }
          @page { margin: 15mm; }
        </style>
      </head><body>${contenido}</body></html>
    `)
    ventana.document.close()
    setTimeout(() => { ventana.print() }, 500)
  }

  const imprimirTodo = () => {
    const secciones = ['seccion-calificacion', 'seccion-listas', 'seccion-dd']
    const contenido = secciones.map(id => {
      const el = document.getElementById(id)
      return el ? `<div style="page-break-after: always;">${el.innerHTML}</div>` : ''
    }).join('')
    const ventana = window.open('', '_blank', 'width=900,height=700')
    ventana.document.write(`
      <html><head>
        <title>Expediente Completo — ${nombreCompleto(cliente)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px 40px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px; }
          th { background: #f5f5f5; font-weight: 600; }
          h2 { font-size: 16px; margin-bottom: 4px; }
          .no-print { display: none !important; }
          .only-print { display: inline !important; }
          select, input, textarea { display: none !important; }
          @page { margin: 15mm; }
        </style>
      </head><body>${contenido}</body></html>
    `)
    ventana.document.close()
    setTimeout(() => { ventana.print() }, 500)
  }

  const TABS = [
    { id: 'calificacion', label: '🎯 Calificación de Riesgo',      seccion: 'seccion-calificacion' },
    { id: 'listas',       label: '🔎 Listas y PEP',                seccion: 'seccion-listas' },
    { id: 'dd',           label: '🛡 Debida Diligencia',            seccion: 'seccion-dd' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-brand-900 rounded-t-2xl">
          <div>
            <h1 className="text-base font-bold text-white">
              📄 Expediente de Compliance — {nombreCompleto(cliente)}
            </h1>
            <p className="text-xs text-brand-300">
              {cliente.cedula_juridica || cliente.numero_identificacion} ·
              {cliente.tipo_persona === 'juridica' ? ' Persona Jurídica' : ' Persona Física'} ·
              {new Date().toLocaleDateString('es-CR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={imprimirTodo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-brand-900 text-xs font-semibold rounded-lg hover:bg-brand-50 transition-colors">
              🖨 Imprimir expediente completo
            </button>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-brand-700 text-brand-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido + botón imprimir sección */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={printRef}>
          {/* Botón imprimir sección actual */}
          <div className="flex justify-end">
            <button onClick={() => imprimirSeccion(TABS.find(t => t.id === tab)?.seccion)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
              🖨 Imprimir esta sección
            </button>
          </div>

          {/* Renderizar las 3 secciones (siempre montadas para poder imprimir) */}
          <div className={tab === 'calificacion' ? '' : 'hidden'}>
            <SeccionCalificacion cliente={cliente} />
          </div>
          <div className={tab === 'listas' ? '' : 'hidden'}>
            <SeccionListas cliente={cliente} personas={personas} />
          </div>
          <div className={tab === 'dd' ? '' : 'hidden'}>
            <SeccionDebidaDiligencia cliente={cliente} personas={personas} />
          </div>
        </div>
      </div>
    </div>
  )
}
