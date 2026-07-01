/**
 * InformeClienteCompleto.jsx
 * Expediente de compliance generado desde la base de datos del cliente.
 * Idéntico al ReporteDD del módulo de Debida Diligencia, más la Calificación de Riesgo.
 *
 * Tabs: Calificación de Riesgo | Listas y PEP | Debida Diligencia + Perfil IA
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  CRITERIOS_CLIENTE, CRITERIOS_GEO, CRITERIOS_PRODUCTOS, CRITERIOS_CANALES,
  PESOS_CONSOLIDADO, OPCIONES, clasificar, PAISES_RIESGO, ACTIVIDADES_PROFESIONES,
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
    criterios.forEach(c => { sub += (parseFloat(respuestas[c.key]) || 1) * c.peso })
    desglose[key] = sub
    scoreTotal += sub * (pesos[key] || 0)
  })
  return { scoreTotal: parseFloat(scoreTotal.toFixed(3)), desglose }
}

function nivelColor(nivel) {
  return nivel === 'bajo' ? '#16a34a' : nivel === 'medio' ? '#ca8a04' : nivel === 'alto' ? '#dc2626' : '#6b7280'
}

function NivelBadge({ nivel }) {
  if (!nivel) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin calificar</span>
  const cls = nivel === 'bajo' ? 'bg-green-100 text-green-700' : nivel === 'medio' ? 'bg-yellow-100 text-yellow-700' :
              nivel === 'alto' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
  const map = { bajo: '🟢 BAJO', medio: '🟡 MEDIO', alto: '🟠 ALTO', muy_alto: '🔴 MUY ALTO' }
  return <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${cls}`}>{map[nivel] || nivel}</span>
}

const CHECKLIST_BASE = [
  { id: 'id_vigente',    label: 'Copia de identificación vigente' },
  { id: 'domicilio',     label: 'Comprobante de domicilio' },
  { id: 'origen_fondos', label: 'Declaración de origen de fondos' },
  { id: 'kyc_firmado',   label: 'Formulario KYC / vinculación firmado' },
  { id: 'listas_ok',     label: 'Consulta de listas completada (fecha y resultado)' },
  { id: 'proposito',     label: 'Propósito de la relación comercial documentado' },
]
const CHECKLIST_PJ = [
  { id: 'personeria',  label: 'Certificación de personería jurídica (≤30 días)' },
  { id: 'acta',        label: 'Acta constitutiva / estatutos' },
  { id: 'nomina',      label: 'Nómina de socios y % de participación' },
  { id: 'id_socios',   label: 'Identificación de todos los socios ≥10%' },
  { id: 'bene_final',  label: 'Identificación del Beneficiario Final' },
  { id: 'estados_fin', label: 'Estados financieros (si aplica por monto)' },
]
const CHECKLIST_PEP = [
  { id: 'aprobacion_jd',   label: 'Aprobación de la Junta Directiva o nivel superior' },
  { id: 'decl_jurada_pep', label: 'Declaración jurada de cargo y origen de fondos' },
  { id: 'monitoreo_ref',   label: 'Monitoreo reforzado activado' },
  { id: 'revision_anual',  label: 'Revisión anual programada' },
]

const NIVELES = {
  bajo:     { desc: 'DDC estándar — riesgo bajo', years: 3 },
  medio:    { desc: 'DDC estándar + seguimiento', years: 2 },
  alto:     { desc: 'DDC ampliada — Art. 23-24',  years: 1 },
  muy_alto: { desc: 'DDC ampliada + alta gerencia', years: 1 },
}

// ─── Configuración de fuentes (igual que ConsultaPEP) ────────────────────────
const FUENTES_CONFIG = {
  OFAC_SDN:   { label: 'OFAC SDN',              flag: '🇺🇸', color: '#b91c1c' },
  OFAC_CONS:  { label: 'OFAC Consolidated',      flag: '🇺🇸', color: '#b91c1c' },
  ONU:        { label: 'ONU Consejo Seguridad',  flag: '🇺🇳', color: '#1d4ed8' },
  UK_OFSI:    { label: 'UK OFSI',               flag: '🇬🇧', color: '#7c3aed' },
  INTERPOL:   { label: 'INTERPOL',              flag: '🚨', color: '#dc2626' },
  GAFI_NEGRO: { label: 'GAFI Lista Negra',       flag: '⬛', color: '#111827' },
  GAFI_GRIS:  { label: 'GAFI Lista Gris',        flag: '🔘', color: '#6b7280' },
  GAFILAT:    { label: 'GAFILAT',               flag: '🌎', color: '#92400e' },
  ICD_CR_PEP: { label: 'ICD CR — Lista PEP',    flag: '🇨🇷', color: '#065f46' },
}
const TODAS_FUENTES = Object.keys(FUENTES_CONFIG)

// ─── Función común: buscar en listas via RPC ─────────────────────────────────
async function buscarEnListas(nombre, identificacion) {
  const { data, error } = await supabase.rpc('buscar_en_listas', {
    p_nombre: nombre, p_identificacion: identificacion || null, p_pais: null, p_limite: 50,
  })
  if (error) throw error
  const resultados = data || []
  const maxSim = resultados.length > 0 ? Math.max(...resultados.map(r => r.similitud || 0)) : 0
  const esPEP  = resultados.some(r => (r.fuente === 'ICD_CR_PEP' || r.tipo_lista === 'pep') && (r.similitud || 0) >= 0.65)
  return {
    nivel: maxSim >= 0.85 ? 'ALERTA' : maxSim >= 0.65 ? 'REVISAR' : 'SIN_HALLAZGOS',
    hits: resultados.filter(r => (r.similitud || 0) >= 0.65),
    allHits: resultados,   // todos los resultados sin filtrar (para el reporte detallado)
    esPEP,
    totalResultados: resultados.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT: idéntico a ConsultaPEP + ReporteDD + Calificación
// ─────────────────────────────────────────────────────────────────────────────
function generarHTMLReporte({ cliente, participantes, resultadosListas, perfil, nivelFinal, checklist, hayPEP, tenant, profile, scoreTotal, nivelRiesgo, desglose, tipo }) {
  const nombre = nombreCompleto(cliente)
  const nivel  = NIVELES[nivelFinal] || NIVELES.medio
  const todosItems = [...CHECKLIST_BASE, ...(tipo === 'J' ? CHECKLIST_PJ : []), ...(hayPEP ? CHECKLIST_PEP : [])]
  const itemsOk = todosItems.filter(it => checklist[it.id]).length

  const rowStyle = 'border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px;'
  const headStyle = rowStyle + 'background: #f5f5f5; font-weight: 600;'

  const secCalificacion = `
    <div style="page-break-after: always;">
      <div style="background: #0e0e6e; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 24px; border-radius: 8px 8px 0 0;">
        <div style="flex:1;">
          <p style="font-size:16px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
          <p style="font-size:12px; color:#a5b4fc; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#c7d2fe;">
          <p style="font-weight:700; color:white; font-size:13px; margin:0;">CALIFICACIÓN DE RIESGO</p>
          <p style="margin:2px 0;">Ref: CNL-CAL-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
        </div>
      </div>
      <div style="background:#eef2ff; padding:6px 32px; font-size:10px; color:#3730a3; display:flex; justify-content:space-between; border-radius: 0 0 8px 8px; margin-bottom: 16px;">
        <span>Acuerdo SUGEF 13-19 — Metodología de Calificación de Riesgo del Cliente</span>
        <span>${new Date().toLocaleString('es-CR')}</span>
      </div>
      <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding:4px 6px; font-size:11px; color:#6b7280;">Cliente:</td>
          <td style="padding:4px 6px; font-size:11px; font-weight:600;">${nombre}</td>
          <td style="padding:4px 6px; font-size:11px; color:#6b7280;">Identificación:</td>
          <td style="padding:4px 6px; font-size:11px;">${cliente.cedula_juridica || cliente.numero_identificacion || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 6px; font-size:11px; color:#6b7280;">Sujeto Obligado:</td>
          <td style="padding:4px 6px; font-size:11px;">${tenant?.nombre || '—'}</td>
          <td style="padding:4px 6px; font-size:11px; color:#6b7280;">Elaborado por:</td>
          <td style="padding:4px 6px; font-size:11px;">${profile?.nombre || profile?.email || '—'}</td>
        </tr>
      </table>
      <div style="border: 2px solid ${nivelColor(nivelRiesgo)}; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: ${nivelColor(nivelRiesgo)}10;">
        <div style="display:flex; gap: 24px; align-items:center;">
          <div style="text-align:center; min-width: 100px;">
            <p style="font-size:36px; font-weight:900; color:${nivelColor(nivelRiesgo)}; margin:0;">${scoreTotal}</p>
            <p style="font-size:10px; color:#6b7280; margin:4px 0 0;">Puntuación (0–3)</p>
          </div>
          <div>
            <p style="font-size:18px; font-weight:700; color:${nivelColor(nivelRiesgo)}; margin:0;">${nivelRiesgo === 'bajo' ? '🟢' : nivelRiesgo === 'medio' ? '🟡' : '🔴'} Riesgo ${(nivelRiesgo || '').toUpperCase()}</p>
            <p style="font-size:10px; color:#6b7280; margin:4px 0;">Metodología SUGEF 13-19 y Basel AML Index 2023</p>
          </div>
        </div>
      </div>
    </div>`

  // Agrupar todos los hits de todas las personas para el reporte de listas
  const todosLosHits = Object.values(resultadosListas).flatMap(r => r.hits || [])
  const allHitsCombinados = Object.values(resultadosListas).flatMap(r => r.allHits || r.hits || [])
  const nivelGlobal = Object.values(resultadosListas).some(r => r.nivel === 'ALERTA') ? 'ALERTA' :
                      Object.values(resultadosListas).some(r => r.nivel === 'REVISAR') ? 'REVISAR' : 'SIN_COINCIDENCIA'
  const fuentesConCoincidencia = [...new Set(todosLosHits.map(r => r.fuente))]
  const fuentesSinCoincidencia = TODAS_FUENTES.filter(f => !fuentesConCoincidencia.includes(f))
  const conteoFuente = {}
  TODAS_FUENTES.forEach(f => { conteoFuente[f] = todosLosHits.filter(r => r.fuente === f).length })
  const maxConteo = Math.max(1, ...Object.values(conteoFuente))
  const uifMatches = allHitsCombinados.filter(r => r.fuente === 'ICD_CR_PEP' && (r.similitud || 0) >= 0.50)
  const enListaUIF = uifMatches.length > 0
  const mejorUIF = uifMatches.sort((a, b) => (b.similitud || 0) - (a.similitud || 0))[0]

  const secListas = `
    <div style="page-break-after: always;">
      <!-- Header idéntico a ConsultaPEP -->
      <div style="border: 2px solid #0e0e6e; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
        <div style="background: #0e0e6e; color: white; padding: 20px 32px; display:flex; align-items:center; gap:24px;">
          <div style="flex:1;">
            <p style="font-size:18px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
            <p style="font-size:11px; color:#a5b4fc; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
          </div>
          <div style="text-align:right; font-size:11px; color:#c7d2fe;">
            <p style="font-weight:700; color:white; font-size:13px; margin:0;">REPORTE DE CONSULTA</p>
            <p style="margin:2px 0;">LISTAS INTERNACIONALES Y PEP</p>
            <p style="font-size:9px; margin:2px 0;">Ref: CNL-PEP-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
          </div>
        </div>
        <div style="background:#eef2ff; padding:6px 32px; font-size:10px; color:#3730a3; display:flex; justify-content:space-between;">
          <span>📋 Documento válido como evidencia — Acuerdo SUGEF 13-19, Art. 21-28</span>
          <span>${new Date().toLocaleString('es-CR')}</span>
        </div>
      </div>

      <!-- Datos de consulta y reporte -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px;">
          <p style="font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin:0 0 8px;">Datos de la Consulta</p>
          <table style="font-size:11px; width:100%;"><tbody>
            <tr><td style="color:#9ca3af; padding:2px 0; width:40%;">Cliente:</td><td style="font-weight:600;">${nombre}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Identificación:</td><td>${cliente.cedula_juridica||cliente.numero_identificacion||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Tipo:</td><td>${tipo==='J'?'Persona Jurídica':'Persona Física'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Personas verificadas:</td><td>${Object.keys(resultadosListas).length}</td></tr>
          </tbody></table>
        </div>
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px;">
          <p style="font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin:0 0 8px;">Datos del Reporte</p>
          <table style="font-size:11px; width:100%;"><tbody>
            <tr><td style="color:#9ca3af; padding:2px 0; width:40%;">Consultó:</td><td style="font-weight:600;">${profile?.nombre||profile?.email||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Sujeto Obligado:</td><td>${tenant?.nombre||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Fecha:</td><td>${new Date().toLocaleString('es-CR')}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Listas consultadas:</td><td>${TODAS_FUENTES.length}</td></tr>
          </tbody></table>
        </div>
      </div>

      <!-- Resultado consolidado -->
      <div style="border-radius:8px; padding:20px; text-align:center; border:2px solid ${nivelGlobal==='ALERTA'?'#f87171':nivelGlobal==='REVISAR'?'#fb923c':'#4ade80'}; background:${nivelGlobal==='ALERTA'?'#fef2f2':nivelGlobal==='REVISAR'?'#fff7ed':'#f0fdf4'}; margin-bottom:16px;">
        <p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin:0 0 8px;">Resultado Consolidado</p>
        <p style="font-size:28px; font-weight:900; color:${nivelGlobal==='ALERTA'?'#b91c1c':nivelGlobal==='REVISAR'?'#c2410c':'#15803d'}; margin:0;">
          ${nivelGlobal==='ALERTA'?'🚨 ALERTA':nivelGlobal==='REVISAR'?'⚠️ REVISAR':'✅ SIN COINCIDENCIA'}
        </p>
        <p style="font-size:11px; color:#374151; margin:6px 0 0;">
          ${nivelGlobal==='ALERTA'?`Se encontraron ${todosLosHits.length} coincidencias en ${fuentesConCoincidencia.length} lista(s).`:
            nivelGlobal==='REVISAR'?'Se encontraron coincidencias parciales que requieren verificación manual.':
            `No se encontraron coincidencias en ninguna de las ${TODAS_FUENTES.length} listas consultadas.`}
        </p>
      </div>

      <!-- Personas verificadas -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#1f2937; color:white; padding:10px 16px;">
          <p style="font-size:12px; font-weight:700; margin:0;">👥 Personas Verificadas (${Object.keys(resultadosListas).length})</p>
        </div>
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="${headStyle}">Nombre</th><th style="${headStyle}">Rol</th>
            <th style="${headStyle}">Identificación</th><th style="${headStyle}">Resultado</th><th style="${headStyle}">PEP</th>
          </tr></thead>
          <tbody>
            ${Object.entries(resultadosListas).map(([nom, res]) => `
              <tr>
                <td style="${rowStyle} font-weight:600;">${nom}</td>
                <td style="${rowStyle}">${res.rol||'Cliente principal'}</td>
                <td style="${rowStyle} font-family:monospace;">${res.id||'—'}</td>
                <td style="${rowStyle}"><span style="font-weight:700; color:${res.nivel==='ALERTA'?'#b91c1c':res.nivel==='REVISAR'?'#c2410c':'#15803d'};">${res.nivel==='ALERTA'?'🔴 ALERTA':res.nivel==='REVISAR'?'⚠ REVISAR':'✅ SIN HALLAZGOS'}</span></td>
                <td style="${rowStyle}">${res.esPEP?'🏛️ PEP':'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Resultados por lista -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px; margin-bottom:16px;">
        <p style="font-size:12px; font-weight:700; margin:0 0 10px;">📊 Resultados por Lista Internacional</p>
        ${TODAS_FUENTES.map(f => {
          const count = conteoFuente[f] || 0
          const cfg = FUENTES_CONFIG[f] || {}
          const pct = count > 0 ? Math.max(8, (count / maxConteo) * 100) : 0
          return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <span style="font-size:10px; color:#374151; width:160px; flex-shrink:0;">${cfg.flag||''} ${cfg.label||f}</span>
            <div style="flex:1; background:#f3f4f6; border-radius:99px; height:16px; overflow:hidden;">
              ${count>0?`<div style="width:${pct}%; height:100%; background:${cfg.color||'#1e3a8a'}; border-radius:99px; display:flex; align-items:center; justify-content:flex-end; padding-right:6px;"><span style="font-size:9px; color:white; font-weight:700;">${count}</span></div>`:''}
            </div>
            <span style="font-size:10px; font-weight:700; width:80px; text-align:right; color:${count>0?'#b91c1c':'#16a34a'};">${count>0?`${count} coincid.`:'Sin coincid.'}</span>
          </div>`
        }).join('')}
      </div>

      <!-- Listas sin coincidencias -->
      <div style="border:1px solid #e5e7eb; border-radius:8px; padding:14px; margin-bottom:16px;">
        <p style="font-size:12px; font-weight:700; margin:0 0 8px;">✅ Listas sin coincidencias (${fuentesSinCoincidencia.length}/${TODAS_FUENTES.length})</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          ${fuentesSinCoincidencia.map(f => `
            <div style="display:flex; align-items:center; gap:6px; background:#f0fdf4; border-radius:6px; padding:4px 10px; font-size:10px; color:#374151;">
              <span style="color:#16a34a; font-weight:700;">✓</span>
              <span>${FUENTES_CONFIG[f]?.flag||''} ${FUENTES_CONFIG[f]?.label||f}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Detalle de coincidencias -->
      ${todosLosHits.length > 0 ? `
        <div style="border:1px solid #fecaca; border-radius:8px; overflow:hidden; margin-bottom:16px;">
          <div style="background:#dc2626; color:white; padding:10px 16px;">
            <p style="font-size:12px; font-weight:700; margin:0;">🚨 Detalle de Coincidencias (${todosLosHits.length})</p>
          </div>
          ${todosLosHits.map(r => {
            const cfg = FUENTES_CONFIG[r.fuente] || {}
            const sim = Math.round((r.similitud || 0) * 100)
            return `<div style="padding:12px 16px; border-bottom:1px solid #f3f4f6;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
                <div>
                  <span style="font-size:9px; font-weight:700; padding:2px 8px; border-radius:99px; color:white; background:${cfg.color||'#1e3a8a'};">${cfg.flag||''} ${cfg.label||r.fuente}</span>
                  <p style="font-size:12px; font-weight:700; color:#111827; margin:4px 0 2px;">${r.nombre_completo}</p>
                  ${r.aliases?.length>0?`<p style="font-size:10px; color:#6b7280; margin:0;">Aliases: ${r.aliases.slice(0,3).join(' · ')}</p>`:''}
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <p style="font-size:10px; color:#6b7280; margin:0;">Similitud</p>
                  <p style="font-size:22px; font-weight:900; color:${sim>=85?'#b91c1c':sim>=65?'#c2410c':'#d97706'}; margin:0;">${sim}%</p>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px; font-size:10px; color:#6b7280;">
                ${r.tipo_entidad?`<span>📋 Tipo: ${r.tipo_entidad}</span>`:''}
                ${r.paises?.length>0?`<span>🌍 Países: ${r.paises.slice(0,3).join(', ')}</span>`:''}
                ${r.programa?`<span>⚖️ Programa: ${r.programa}</span>`:''}
                ${r.nivel_riesgo?`<span>🔴 Nivel: ${r.nivel_riesgo.replace('_',' ')}</span>`:''}
              </div>
            </div>`
          }).join('')}
        </div>` : ''}

      <!-- Sección PEP — idéntica a ConsultaPEP -->
      <div style="border:1px solid #fde68a; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#d97706; color:white; padding:10px 16px;">
          <p style="font-size:12px; font-weight:700; margin:0;">🏛️ Personas Expuestas Políticamente (PEP)</p>
        </div>
        <div style="padding:14px 16px;">
          <p style="font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin:0 0 8px;">Verificación en Lista Oficial UIF — ICD Costa Rica</p>
          <div style="border-radius:6px; padding:10px 14px; border:1px solid ${enListaUIF?'#fecaca':'#bbf7d0'}; background:${enListaUIF?'#fef2f2':'#f0fdf4'};">
            <p style="font-size:12px; font-weight:700; color:${enListaUIF?'#b91c1c':'#15803d'}; margin:0;">
              ${enListaUIF?'🚨 FIGURA EN LISTA PEP OFICIAL ICD':'✅ NO figura en Lista PEP oficial ICD'}
            </p>
            ${enListaUIF&&mejorUIF?`<p style="font-size:10px; color:#b91c1c; margin:4px 0 0;">Nombre en lista: <strong>${mejorUIF.nombre_completo}</strong> · Similitud: ${((mejorUIF.similitud||0)*100).toFixed(0)}%${mejorUIF.programa?` · Cargo: ${mejorUIF.programa}`:''}</p>`:''}
          </div>
          <p style="font-size:9px; color:#9ca3af; margin:6px 0 0;">Fuente: UIF — ICD Costa Rica. Lista PEP corte 2026. Ley 7786, Art. 2 inc. 29 — Acuerdo SUGEF 13-19, Art. 36-40.</p>
        </div>
      </div>

      <!-- Pie legal -->
      <div style="border-top:2px solid #0e0e6e; padding-top:12px;">
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#6b7280; margin-bottom:8px;">
          <div>
            <p style="font-weight:700; color:#374151; margin:0;">CNL Craniley Compliance Services SRL</p>
            <p style="margin:2px 0;">Plataforma: cnl-compliance-app.vercel.app</p>
            <p style="margin:0;">Reporte generado: ${new Date().toLocaleString('es-CR')} por ${profile?.nombre||profile?.email||'—'}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-weight:700; color:#374151; margin:0;">Base Legal</p>
            <p style="margin:2px 0;">Ley 7786, Art. 15 bis — Debida Diligencia</p>
            <p style="margin:0;">Acuerdo SUGEF 13-19, Art. 21-28 y 36-40</p>
          </div>
        </div>
        <div style="background:#0e0e6e; color:#a5b4fc; font-size:9px; border-radius:6px; padding:8px 16px; text-align:center;">
          Este reporte constituye evidencia de la verificación realizada conforme al Acuerdo SUGEF 13-19 y debe conservarse 5 años (Ley 7786, Art. 24).
        </div>
      </div>
    </div>`

  const secDD = `
    <div>
      <div style="background: #0e0e6e; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 24px; border-radius: 8px 8px 0 0;">
        <div style="flex:1;">
          <p style="font-size:16px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
          <p style="font-size:12px; color:#a5b4fc; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#c7d2fe;">
          <p style="font-weight:700; color:white; font-size:13px; margin:0;">NOTA DE DEBIDA DILIGENCIA</p>
          <p style="margin:2px 0;">Ref: CNL-DD-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
        </div>
      </div>
      <div style="background:#eef2ff; padding:6px 32px; font-size:10px; color:#3730a3; display:flex; justify-content:space-between; margin-bottom:16px;">
        <span>Acuerdo SUGEF 13-19, Art. 21-28 — Debida Diligencia del Cliente</span>
        <span>${new Date().toLocaleString('es-CR')}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px;">
          <p style="font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin:0 0 8px;">Datos del Cliente</p>
          <table style="width:100%; font-size:11px;"><tbody>
            <tr><td style="color:#9ca3af; padding:2px 0; width:40%;">Nombre:</td><td style="font-weight:600;">${nombre}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Tipo:</td><td>${tipo==='J'?'Persona Jurídica':'Persona Física'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Identificación:</td><td>${cliente.cedula_juridica||cliente.numero_identificacion||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">País residencia:</td><td>${cliente.pais_ubicacion||cliente.pais_nacimiento||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Actividad:</td><td>${cliente.actividad_eco_nombre||cliente.profesion_nombre||cliente.actividad_economica||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Propósito:</td><td>${cliente.proposito_relacion||'—'}</td></tr>
          </tbody></table>
        </div>
        <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px;">
          <p style="font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; margin:0 0 8px;">Datos del Reporte</p>
          <table style="width:100%; font-size:11px;"><tbody>
            <tr><td style="color:#9ca3af; padding:2px 0; width:40%;">Elaborado por:</td><td style="font-weight:600;">${profile?.nombre||profile?.email||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Sujeto Obligado:</td><td>${tenant?.nombre||'—'}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Fecha:</td><td>${new Date().toLocaleString('es-CR')}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Nivel de riesgo:</td><td style="font-weight:700;">${(nivelFinal||'—').toUpperCase()}</td></tr>
            <tr><td style="color:#9ca3af; padding:2px 0;">Documentos:</td><td>${itemsOk}/${todosItems.length} recopilados</td></tr>
          </tbody></table>
        </div>
      </div>
      ${perfil ? `
        <div style="border:1px solid #bfdbfe; border-radius:8px; margin-bottom:16px; overflow:hidden;">
          <div style="background:#1d4ed8; color:white; padding:10px 16px;">
            <p style="font-size:12px; font-weight:700; margin:0;">🤖 Perfil IA — Investigación del Cliente</p>
            <p style="font-size:10px; color:#bfdbfe; margin:2px 0 0;">Generado por Claude AI con búsqueda web</p>
          </div>
          <div style="padding:16px; font-size:11px; color:#374151; line-height:1.6; white-space:pre-line;">${perfil}</div>
        </div>` : ''}
      <div style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#f9fafb; padding:10px 16px; border-bottom:1px solid #e5e7eb;">
          <p style="font-size:12px; font-weight:700; margin:0;">📋 Checklist de Documentos — ${itemsOk}/${todosItems.length} completados</p>
        </div>
        ${todosItems.map(item => `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 16px; border-bottom:1px solid #f3f4f6;">
            <span style="width:18px; height:18px; border-radius:4px; background:${checklist[item.id]?'#dcfce7':'#f3f4f6'}; color:${checklist[item.id]?'#16a34a':'#9ca3af'}; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; flex-shrink:0;">${checklist[item.id]?'✓':'○'}</span>
            <span style="font-size:11px; color:${checklist[item.id]?'#111827':'#6b7280'};">${item.label}</span>
          </div>`).join('')}
      </div>
      <div style="border:2px solid ${nivelColor(nivelFinal||'medio')}; border-radius:8px; padding:16px; margin-bottom:16px;">
        <p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; margin:0 0 6px;">Conclusión — Nivel de Riesgo Asignado</p>
        <p style="font-size:16px; font-weight:700; color:${nivelColor(nivelFinal||'medio')}; margin:0;">${(nivelFinal||'—').toUpperCase()}</p>
        <p style="font-size:10px; color:#374151; margin:4px 0 0;">${nivel?.desc||''} · Próxima actualización: ${nivel?.years||'—'} año(s)</p>
        <p style="font-size:9px; color:#9ca3af; margin:4px 0 0;">Conservar 5 años mínimo — Ley 7786, Art. 24</p>
      </div>
      <div style="border:1px solid #d1d5db; border-radius:8px; padding:20px; display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:16px;">
        <div>
          <p style="font-size:10px; color:#9ca3af; margin:0 0 32px;">Firma del Oficial de Cumplimiento</p>
          <div style="border-top:1px solid #9ca3af; padding-top:6px;">
            <p style="font-size:12px; font-weight:600; margin:0;">${profile?.nombre||profile?.email||''}</p>
            <p style="font-size:10px; color:#6b7280; margin:2px 0 0;">${tenant?.nombre||''}</p>
          </div>
        </div>
        <div>
          <p style="font-size:10px; color:#9ca3af; margin:0 0 32px;">Fecha y lugar</p>
          <div style="border-top:1px solid #9ca3af; padding-top:6px;">
            <p style="font-size:12px; margin:0;">${new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'long',year:'numeric'})}</p>
            <p style="font-size:10px; color:#6b7280; margin:2px 0 0;">San José, Costa Rica</p>
          </div>
        </div>
      </div>
      <div style="background:#0e0e6e; color:#a5b4fc; font-size:9px; border-radius:6px; padding:10px 16px; text-align:center;">
        Este expediente constituye evidencia de la debida diligencia aplicada conforme a la Ley N.° 7786 y el Acuerdo SUGEF 13-19.
        Debe conservarse por un mínimo de cinco (5) años desde el cierre de la relación comercial.
        Plataforma: cnl-compliance-app.vercel.app — CNL Craniley Compliance Services SRL.
      </div>
    </div>`

  return `<html><head><title>Expediente Compliance — ${nombre}</title>
    <style>* { box-sizing:border-box; } body { font-family:Arial,sans-serif; font-size:11px; color:#111; margin:20px 32px; } @page { margin:12mm; }</style>
    </head><body>${secCalificacion}${secListas}${secDD}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: CALIFICACIÓN DE RIESGO
// ─────────────────────────────────────────────────────────────────────────────
function SeccionCalificacion({ cliente, onScoreChange }) {
  const tipo = cliente.tipo_persona === 'juridica' ? 'juridica' : 'fisica'

  const prefill = useCallback(() => {
    const r = {}
    const actVal = tipo === 'fisica'
      ? (cliente.profesion_valor || actividadValor(cliente.profesion_nombre || cliente.actividad_economica))
      : (cliente.actividad_eco_valor || actividadValor(cliente.actividad_eco_nombre || cliente.actividad_economica))
    r.profesion = actVal; r.actividad_eco = actVal; r.servicios = actVal
    const paisVal = paisRiesgoValor(cliente.pais_nacimiento || cliente.pais_ubicacion)
    r.pais_origen = paisVal; r.residencia = paisRiesgoValor(cliente.pais_ubicacion || cliente.pais_nacimiento)
    r.ubicacion_geo = paisVal; r.casa_matriz = paisVal
    r.transfronterizo = (paisVal > 1 ? 2 : 0.5); r.op_nacional = 1; r.op_internacional = 0.5
    const ing = parseFloat(cliente.ingreso_mensual_est) || 0
    r.ingreso_mensual = ing > 6000 ? 1 : ing > 4000 ? 1.5 : ing > 2000 ? 2 : ing > 1000 ? 2.5 : 3
    r.acceso_info = 1; r.pep = 1; r.listas_obs = 1; r.struct_admin = tipo === 'juridica' ? 3 : undefined
    r.struct_acc = 1; r.efectivo = 1; r.protectoras = 1; r.info_ingreso = 1; r.anos_operacion = 1
    r.vol_trans = 0.5; r.cant_trans = 0.5; r.anos_exp = 1; r.como_labor = 1
    r.cant_lugares = 1; r.cant_sucursales = 1; r.tipo_vendedor = 1; r.posicion_mkt = 1; r.struct_ventas = 1
    return r
  }, [cliente, tipo])

  const [resp, setResp] = useState(prefill)
  const { scoreTotal, desglose } = calcScore(resp, tipo)
  const nivel = clasificar(scoreTotal)

  useEffect(() => { onScoreChange?.({ scoreTotal, nivel, desglose }) }, [scoreTotal, nivel])

  const grupos = [
    { key: 'cliente',   label: 'Factor Cliente',                criterios: CRITERIOS_CLIENTE[tipo] },
    { key: 'geo',       label: 'Factor Zona Geográfica',         criterios: CRITERIOS_GEO[tipo] },
    { key: 'productos', label: 'Factor Productos/Servicios',     criterios: CRITERIOS_PRODUCTOS[tipo] },
    { key: 'canales',   label: 'Factor Canales de Distribución', criterios: CRITERIOS_CANALES[tipo] },
  ]

  const opcionesPara = (key) => {
    if (['pais_origen','residencia','ubicacion_geo','casa_matriz'].includes(key)) return OPCIONES.pais_riesgo
    return OPCIONES[key] || []
  }

  return (
    <div className="space-y-5">
      {/* Score banner */}
      <div className="flex items-center gap-6 p-4 rounded-xl border-2"
        style={{ borderColor: nivelColor(nivel) + '60', background: nivelColor(nivel) + '10' }}>
        <div className="text-center min-w-[90px]">
          <p className="text-4xl font-black" style={{ color: nivelColor(nivel) }}>{scoreTotal.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Puntuación (0–3)</p>
        </div>
        <div>
          <p className="text-2xl font-bold capitalize" style={{ color: nivelColor(nivel) }}>
            {nivel === 'bajo' ? '🟢' : nivel === 'medio' ? '🟡' : '🔴'} Riesgo {nivel}
          </p>
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-600">
            <span>Cliente: <strong>{desglose.cliente?.toFixed(2)}</strong></span>
            <span>Zona geo: <strong>{desglose.geo?.toFixed(2)}</strong></span>
            {tipo === 'juridica' && <>
              <span>Productos: <strong>{desglose.productos?.toFixed(2)}</strong></span>
              <span>Canales: <strong>{desglose.canales?.toFixed(2)}</strong></span>
            </>}
          </div>
        </div>
      </div>

      {/* Grupos */}
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
                return (
                  <tr key={c.key}>
                    <td className="px-3 py-2 text-gray-700">{c.label}</td>
                    <td className="px-3 py-2">
                      {opts.length > 0 ? (
                        <select className="w-full text-xs border border-gray-200 rounded px-1.5 py-1"
                          value={val}
                          onChange={e => setResp(r => ({ ...r, [c.key]: parseFloat(e.target.value) }))}>
                          {opts.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                        </select>
                      ) : <span className="text-xs text-gray-400">—</span>}
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
      <div className="text-xs text-gray-400 border-t pt-3">
        <p>⚖ Base legal: Ley 7786, Acuerdo SUGEF 13-19, Recomendaciones GAFI</p>
        <p>📋 Metodología: N06 — adaptada del Basel AML Index 2023</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: LISTAS Y PEP (igual que DebilidaDiligencia, usa RPC buscar_en_listas)
// ─────────────────────────────────────────────────────────────────────────────
function SeccionListas({ cliente, personas, onResultados }) {
  const [resultadosListas, setResultadosListas] = useState({})
  const [cargando, setCargando] = useState(false)
  const [buscado, setBuscado]   = useState(false)
  const [error, setError]       = useState('')

  const ejecutar = async () => {
    setCargando(true); setError('')
    const nuevos = {}
    try {
      // Cliente principal
      const nomPpal = nombreCompleto(cliente)
      const idPpal  = cliente.cedula_juridica || cliente.numero_identificacion || ''
      nuevos[nomPpal] = { ...(await buscarEnListas(nomPpal, idPpal)), rol: 'Cliente principal', id: idPpal }

      // Personas relacionadas
      for (const p of personas) {
        if (!p.nombre?.trim()) continue
        nuevos[p.nombre] = { ...(await buscarEnListas(p.nombre, p.identificacion)), rol: p.tipo_relacion?.replace(/_/g,' ') || '', id: p.identificacion || '' }
        // Sub-personas
        const subs = p.sub_personas || []
        for (const s of subs) {
          if (!s.nombre?.trim()) continue
          nuevos[s.nombre] = { ...(await buscarEnListas(s.nombre, s.identificacion)), rol: s.tipo_relacion?.replace(/_/g,' ') || 'Vinculado', id: s.identificacion || '' }
        }
      }
      setResultadosListas(nuevos)
      onResultados?.(nuevos)
      setBuscado(true)
    } catch (e) {
      setError('Error al consultar listas: ' + e.message)
    } finally {
      setCargando(false)
    }
  }

  const hayPEP = Object.values(resultadosListas).some(r => r.esPEP)

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-gray-900">Consulta de Listas Internacionales y PEP</p>
            <p className="text-xs text-gray-500 mt-0.5">OFAC · ONU · INTERPOL · GAFI · UK OFSI · ICD CR PEP · GAFILAT</p>
          </div>
          <button onClick={ejecutar} disabled={cargando}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
            {cargando
              ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Consultando…</>
              : buscado ? '🔄 Re-consultar' : '🔎 Consultar todas las personas'}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {cargando && (
          <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-sm">Consultando listas para todas las personas vinculadas…</p>
          </div>
        )}

        {!cargando && !buscado && (
          <div className="text-center py-10 text-gray-300 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-4xl mb-2">📋</p>
            <p className="text-sm font-medium text-gray-400">Haga clic en "Consultar" para verificar al cliente y sus participantes</p>
          </div>
        )}

        {!cargando && buscado && Object.entries(resultadosListas).map(([nom, res]) => (
          <div key={nom} className={`border rounded-xl p-4 ${
            res.nivel === 'ALERTA'  ? 'border-red-300 bg-red-50' :
            res.nivel === 'REVISAR' ? 'border-orange-300 bg-orange-50' :
                                     'border-green-300 bg-green-50'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold text-gray-900">{nom}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {res.rol} {res.id ? `· ${res.id}` : ''} · {res.totalResultados} resultado(s) · {res.hits?.length || 0} con similitud ≥65%
                </p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold px-3 py-1 rounded-full text-white ${
                  res.nivel === 'ALERTA' ? 'bg-red-600' : res.nivel === 'REVISAR' ? 'bg-orange-500' : 'bg-green-600'}`}>
                  {res.nivel === 'ALERTA' ? '🔴 ALERTA' : res.nivel === 'REVISAR' ? '⚠️ REVISAR' : '✅ SIN HALLAZGOS'}
                </span>
                {res.esPEP && <p className="text-xs font-bold text-amber-700 mt-1">🏛️ PEP — Lista ICD CR</p>}
              </div>
            </div>
            {res.hits?.length > 0 && (
              <div className="mt-3 space-y-1">
                {res.hits.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="font-medium text-gray-800">{h.nombre_completo}</span>
                    <span className="text-gray-500">{h.fuente} · {Math.round((h.similitud || 0) * 100)}%</span>
                  </div>
                ))}
                {res.hits.length > 3 && <p className="text-xs text-gray-400 pl-2">…y {res.hits.length - 3} más</p>}
              </div>
            )}
          </div>
        ))}

        {hayPEP && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex gap-3">
            <span className="text-xl flex-shrink-0">🏛️</span>
            <div>
              <p className="text-sm font-bold text-amber-800">PEP identificado — Se requiere DDC Ampliada</p>
              <p className="text-xs text-amber-700 mt-0.5">Acuerdo SUGEF 13-19, Art. 38: aprobación de alta gerencia, origen de fondos y monitoreo reforzado.</p>
            </div>
          </div>
        )}

        {buscado && (
          <p className="text-xs text-gray-400 border-t pt-2">
            ⏱ Consulta realizada: {new Date().toLocaleString('es-CR')}
          </p>
        )}
      </div>

      {/* Links externos */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: '🇺🇸 OFAC SDN List',     url: 'https://sanctionssearch.ofac.treas.gov/' },
          { label: '🇺🇳 ONU Sanciones',      url: 'https://www.un.org/securitycouncil/content/un-sc-consolidated-list' },
          { label: '🇪🇺 UE Sanciones',       url: 'https://www.sanctionsmap.eu/' },
          { label: '🇨🇷 ICD/UIF Costa Rica', url: 'https://www.icd.go.cr/' },
        ].map(l => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg text-xs text-brand-700 hover:bg-brand-50">
            {l.label} ↗
          </a>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: DEBIDA DILIGENCIA + PERFIL IA
// ─────────────────────────────────────────────────────────────────────────────
function SeccionDD({ cliente, personas, resultadosListas, nivelFinal, onNivelChange, onChecklistChange, onPerfilChange }) {
  const tipo = cliente.tipo_persona === 'juridica' ? 'J' : 'F'
  const hayPEP = Object.values(resultadosListas).some(r => r.esPEP)
  const todosItems = [...CHECKLIST_BASE, ...(tipo === 'J' ? CHECKLIST_PJ : []), ...(hayPEP ? CHECKLIST_PEP : [])]

  const [checklist, setChecklist]   = useState({})
  const [nivelLocal, setNivelLocal] = useState(nivelFinal || 'medio')
  const [justif, setJustif]         = useState('')
  const [perfil, setPerfil]         = useState('')
  const [nivelIA, setNivelIA]       = useState('')
  const [cargandoIA, setCargandoIA] = useState(false)
  const [errorIA, setErrorIA]       = useState('')

  const setItem = (id, v) => {
    const next = { ...checklist, [id]: v }
    setChecklist(next)
    onChecklistChange?.(next)
  }

  const itemsOk = todosItems.filter(it => checklist[it.id]).length

  const generarPerfil = async () => {
    setCargandoIA(true); setErrorIA(''); setPerfil('')
    try {
      const nombreEntidad = nombreCompleto(cliente)
      const actividad = cliente.actividad_eco_nombre || cliente.profesion_nombre || cliente.actividad_economica || ''
      const pais = cliente.pais_ubicacion || cliente.pais_nacimiento || 'Costa Rica'
      const res = await fetch('/api/dd-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, nombre: nombreEntidad, actividad, pais,
          participantes: personas.map(p => ({ nombre: p.nombre, rol: p.tipo_relacion })),
          resultados_listas: resultadosListas,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar perfil')
      setPerfil(data.perfil)
      onPerfilChange?.(data.perfil)
      setNivelIA((data.nivel_sugerido || 'medio').toLowerCase())
      if (data.nivel_sugerido && !['muy_alto','alto'].includes(nivelLocal)) {
        const n = data.nivel_sugerido.toLowerCase()
        setNivelLocal(n); onNivelChange?.(n)
      }
    } catch (e) { setErrorIA(e.message) }
    finally { setCargandoIA(false) }
  }

  return (
    <div className="space-y-4">
      {/* Nivel de riesgo */}
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex-1">
          <label className="label text-xs">Nivel de riesgo final asignado</label>
          <select className="input text-sm" value={nivelLocal}
            onChange={e => { setNivelLocal(e.target.value); onNivelChange?.(e.target.value) }}>
            <option value="bajo">🟢 Bajo</option>
            <option value="medio">🟡 Medio</option>
            <option value="alto">🟠 Alto</option>
            <option value="muy_alto">🔴 Muy Alto</option>
          </select>
        </div>
        <div className="text-sm text-gray-600">
          <NivelBadge nivel={nivelLocal} />
          <p className="text-xs text-gray-400 mt-1">{NIVELES[nivelLocal]?.desc}</p>
        </div>
      </div>

      {/* Perfil IA */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold text-gray-900">🤖 Perfil IA del Cliente</p>
            <p className="text-xs text-gray-500">Claude AI + búsqueda web — perfil narrativo para el expediente</p>
          </div>
          <button onClick={generarPerfil} disabled={cargandoIA}
            className="btn-primary flex items-center gap-2 disabled:opacity-60 text-sm">
            {cargandoIA
              ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Investigando…</>
              : perfil ? '🔄 Regenerar' : '🤖 Generar perfil IA'}
          </button>
        </div>
        {errorIA && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {errorIA}</p>}
        {!perfil && !cargandoIA && (
          <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400">
            <p className="text-3xl mb-2">🔎</p>
            <p className="text-sm">Haga clic en "Generar perfil IA" para iniciar la investigación</p>
            <p className="text-xs mt-1 text-gray-300">Requiere TAVILY_API_KEY en Vercel · Puede omitirse</p>
          </div>
        )}
        {cargandoIA && (
          <div className="text-center py-10 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-3xl mb-2">🤖</div>
            <p className="text-sm font-medium text-blue-800">Buscando en internet y analizando datos…</p>
            <p className="text-xs text-blue-400 mt-1">Esto puede tomar 15-30 segundos</p>
          </div>
        )}
        {perfil && !cargandoIA && (
          <div className="space-y-2">
            {nivelIA && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600 border border-gray-200">
                Nivel sugerido por IA: <NivelBadge nivel={nivelIA} />
              </div>
            )}
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">Perfil Narrativo del Cliente</p>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{perfil}</p>
            </div>
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="card space-y-2">
        <p className="font-semibold text-gray-900 border-b pb-2">
          📋 Checklist de Documentos — {itemsOk}/{todosItems.length} completados
        </p>
        {[
          { titulo: 'Base — Todos los clientes',       items: CHECKLIST_BASE },
          ...(tipo === 'J' ? [{ titulo: 'Persona Jurídica (Art. 30 SUGEF 13-19)', items: CHECKLIST_PJ }] : []),
          ...(hayPEP       ? [{ titulo: '🏛️ PEP — DDC Ampliada (Art. 38)',          items: CHECKLIST_PEP }] : []),
        ].map(grupo => (
          <div key={grupo.titulo}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-3 pb-1">{grupo.titulo}</p>
            <div className="space-y-1">
              {grupo.items.map(item => (
                <label key={item.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${
                  checklist[item.id] ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={!!checklist[item.id]}
                    onChange={e => setItem(item.id, e.target.checked)}
                    className="w-4 h-4 rounded accent-green-600 flex-shrink-0" />
                  <span className={`text-sm flex-1 ${checklist[item.id] ? 'text-gray-700' : 'text-gray-600'}`}>{item.label}</span>
                  {checklist[item.id] && <span className="text-green-600 text-sm">✓</span>}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Observaciones */}
      <div className="card space-y-2">
        <label className="label text-xs">Observaciones y conclusión del Oficial de Cumplimiento</label>
        <textarea className="input text-sm" rows={3}
          placeholder="Resumen de la debida diligencia, hallazgos relevantes, conclusión…"
          value={justif} onChange={e => setJustif(e.target.value)} />
      </div>

      <div className="text-xs text-gray-400 border-t pt-3">
        <p>⚖ Base legal: Ley 7786, Acuerdo SUGEF 13-19 Art. 27-30, Recomendaciones GAFI 10, 12, 22, 24</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function InformeClienteCompleto({ cliente, onClose }) {
  const { tenant, profile } = useAuth()
  const [tab, setTab]       = useState('calificacion')
  const [personas, setPersonas] = useState([])

  // Estado compartido para el print
  const [scoreData, setScoreData]         = useState({ scoreTotal: 0, nivel: '', desglose: {} })
  const [resultadosListas, setResultadosListas] = useState({})
  const [nivelFinal, setNivelFinal]       = useState('medio')
  const [checklist, setChecklist]         = useState({})
  const [perfil, setPerfil]               = useState('')

  const tipo = cliente.tipo_persona === 'juridica' ? 'J' : 'F'

  useEffect(() => {
    if (!cliente?.id) return
    supabase.from('clientes_personas_relacionadas').select('*')
      .eq('cliente_id', cliente.id).eq('activo', true).order('orden')
      .then(({ data }) => setPersonas(data || []))
  }, [cliente?.id])

  const imprimirTodo = () => {
    const hayPEP = Object.values(resultadosListas).some(r => r.esPEP)
    const html = generarHTMLReporte({
      cliente, participantes: personas, resultadosListas, perfil, nivelFinal,
      checklist, hayPEP, tenant, profile,
      scoreTotal: scoreData.scoreTotal?.toFixed(2),
      nivelRiesgo: scoreData.nivel,
      desglose: scoreData.desglose,
      tipo,
    })
    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  const TABS = [
    { id: 'calificacion', label: '🎯 Calificación de Riesgo' },
    { id: 'listas',       label: '🔎 Listas y PEP' },
    { id: 'dd',           label: '🛡 Debida Diligencia' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-brand-900 rounded-t-2xl flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-white">📄 Expediente de Compliance — {nombreCompleto(cliente)}</h1>
            <p className="text-xs text-brand-300">
              {cliente.cedula_juridica || cliente.numero_identificacion} ·
              {tipo === 'J' ? ' Persona Jurídica' : ' Persona Física'} ·
              {new Date().toLocaleDateString('es-CR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={imprimirTodo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-brand-900 text-xs font-semibold rounded-lg hover:bg-brand-50">
              🖨 Imprimir expediente completo
            </button>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-brand-700 text-brand-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tab === 'calificacion' && (
            <SeccionCalificacion
              cliente={cliente}
              onScoreChange={setScoreData}
            />
          )}
          {tab === 'listas' && (
            <SeccionListas
              cliente={cliente}
              personas={personas}
              onResultados={setResultadosListas}
            />
          )}
          {tab === 'dd' && (
            <SeccionDD
              cliente={cliente}
              personas={personas}
              resultadosListas={resultadosListas}
              nivelFinal={nivelFinal}
              onNivelChange={setNivelFinal}
              onChecklistChange={setChecklist}
              onPerfilChange={setPerfil}
            />
          )}
        </div>
      </div>
    </div>
  )
}
