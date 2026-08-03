/**
 * InformeClienteCompleto.jsx
 * Expediente de compliance generado desde la base de datos del cliente.
 * Idéntico al ReporteDD del módulo de Debida Diligencia, más la Calificación de Riesgo.
 *
 * Tabs: Calificación de Riesgo | Listas y PEP | Debida Diligencia + Perfil IA
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/apiFetch'
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
  return nivel === 'bajo' ? '#1f6d45' : nivel === 'medio' ? '#c89116' : nivel === 'alto' ? '#c31b26' : '#6b6b76'
}

function NivelBadge({ nivel }) {
  if (!nivel) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin calificar</span>
  const cls = nivel === 'bajo' ? 'bg-green-100 text-green-700' : nivel === 'medio' ? 'bg-yellow-100 text-yellow-700' :
              nivel === 'alto' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
  const map = { bajo: '🟢 BAJO', medio: '🟡 MEDIO', alto: '🟠 ALTO', muy_alto: '🔴 MUY ALTO' }
  return <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${cls}`}>{map[nivel] || nivel}</span>
}

const CHECKLIST_BASE = [
  { id: 'id_vigente',    label: 'Copia de identificación vigente (cédula / DIMEX / pasaporte)', required: true },
  { id: 'domicilio',     label: 'Comprobante de domicilio (no mayor a 3 meses)', required: true },
  { id: 'comp_ingreso',  label: 'Comprobante de ingreso (colilla CCSS, carta patronal o declaración)', required: true },
  { id: 'kyc_firmado',   label: 'Formulario de vinculación firmado por el cliente', required: true },
  { id: 'proposito',     label: 'Declaración de propósito de la relación comercial', required: true },
  { id: 'origen_fondos', label: 'Declaración de origen de fondos', required: true },
  { id: 'pep_check',     label: 'Verificación PEP (persona expuesta políticamente)', required: true },
  { id: 'listas_ok',     label: 'Verificación en listas internacionales (OFAC, ONU, UE)', required: true },
  { id: 'ccss_estado',   label: 'Verificación estado CCSS (mora patronal, si aplica)', required: false },
  { id: 'sugef_check',   label: 'Verificación SUGEF (si es sujeto obligado, Art. 15/15bis/15ter)', required: false },
]
const CHECKLIST_PJ = [
  { id: 'personeria',  label: 'Certificación de personería jurídica (≤30 días)', required: true },
  { id: 'acta',        label: 'Acta constitutiva / estatutos', required: true },
  { id: 'nomina',      label: 'Nómina de socios y % de participación', required: true },
  { id: 'id_socios',   label: 'Identificación de todos los socios ≥10%', required: true },
  { id: 'bene_final',  label: 'Identificación del Beneficiario Final', required: true },
  { id: 'estados_fin', label: 'Estados financieros (si aplica por monto)', required: false },
]
const CHECKLIST_PEP = [
  { id: 'aprobacion_jd',   label: 'Aprobación de la Junta Directiva o nivel superior', required: true },
  { id: 'decl_jurada_pep', label: 'Declaración jurada de cargo y origen de fondos', required: true },
  { id: 'monitoreo_ref',   label: 'Monitoreo reforzado activado', required: true },
  { id: 'revision_anual',  label: 'Revisión anual programada', required: true },
]

const ESTADOS_CHECKLIST = [
  { value: 'pendiente',     label: '⏳ Pendiente' },
  { value: 'disponible',    label: '✅ Disponible' },
  { value: 'no_disponible', label: '❌ No disponible' },
  { value: 'no_aplica',     label: '➖ No aplica' },
]

function getEstadoCL(val) { return typeof val === 'object' ? val?.estado || 'pendiente' : (val ? 'disponible' : 'pendiente') }
function getNotaCL(val)   { return typeof val === 'object' ? val?.nota || '' : '' }

const NIVELES = {
  bajo:     { desc: 'DDC estándar — riesgo bajo', years: 3 },
  medio:    { desc: 'DDC estándar + seguimiento', years: 2 },
  alto:     { desc: 'DDC ampliada — Art. 23-24',  years: 1 },
  muy_alto: { desc: 'DDC ampliada + alta gerencia', years: 1 },
}

// ─── Configuración de fuentes (igual que ConsultaPEP) ────────────────────────
const FUENTES_CONFIG = {
  OFAC_SDN:   { label: 'OFAC SDN',              flag: '🇺🇸', color: '#86111a' },
  OFAC_CONS:  { label: 'OFAC Consolidated',      flag: '🇺🇸', color: '#86111a' },
  ONU:        { label: 'ONU Consejo Seguridad',  flag: '🇺🇳', color: '#293670' },
  UK_OFSI:    { label: 'UK OFSI',               flag: '🇬🇧', color: '#a87813' },
  INTERPOL:   { label: 'INTERPOL',              flag: '🚨', color: '#c31b26' },
  GAFI_NEGRO: { label: 'GAFI Lista Negra',       flag: '⬛', color: '#14141a' },
  GAFI_GRIS:  { label: 'GAFI Lista Gris',        flag: '🔘', color: '#6b6b76' },
  GAFILAT:    { label: 'GAFILAT',               flag: '🌎', color: '#63470d' },
  ICD_CR_PEP: { label: 'ICD CR — Lista PEP',    flag: '🇨🇷', color: '#15442c' },
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
  const itemsOk = todosItems.filter(it => getEstadoCL(checklist[it.id]) === 'disponible').length

  const rowStyle = 'border: 1px solid #e4e4ea; padding: 5px 8px; text-align: left; font-size: 10px;'
  const headStyle = rowStyle + 'background: #f7f7f9; font-weight: 600;'

  const secCalificacion = `
    <div style="page-break-after: always;">
      <div style="background: #0a1247; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 24px; border-radius: 8px 8px 0 0;">
        <div style="flex:1;">
          <p style="font-size:16px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
          <p style="font-size:12px; color:#9aa0c8; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#c3c7e0;">
          <p style="font-weight:700; color:white; font-size:13px; margin:0;">CALIFICACIÓN DE RIESGO</p>
          <p style="margin:2px 0;">Ref: CNL-CAL-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
        </div>
      </div>
      <div style="background:#f2f3f8; padding:6px 32px; font-size:10px; color:#101b54; display:flex; justify-content:space-between; border-radius: 0 0 8px 8px; margin-bottom: 16px;">
        <span>Acuerdo SUGEF 13-19 — Metodología de Calificación de Riesgo del Cliente</span>
        <span>${new Date().toLocaleString('es-CR')}</span>
      </div>
      <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding:4px 6px; font-size:11px; color:#6b6b76;">Cliente:</td>
          <td style="padding:4px 6px; font-size:11px; font-weight:600;">${nombre}</td>
          <td style="padding:4px 6px; font-size:11px; color:#6b6b76;">Identificación:</td>
          <td style="padding:4px 6px; font-size:11px;">${cliente.cedula_juridica || cliente.numero_identificacion || '—'}</td>
        </tr>
        <tr>
          <td style="padding:4px 6px; font-size:11px; color:#6b6b76;">Sujeto Obligado:</td>
          <td style="padding:4px 6px; font-size:11px;">${tenant?.nombre || '—'}</td>
          <td style="padding:4px 6px; font-size:11px; color:#6b6b76;">Elaborado por:</td>
          <td style="padding:4px 6px; font-size:11px;">${profile?.nombre || profile?.email || '—'}</td>
        </tr>
      </table>
      <div style="border: 2px solid ${nivelColor(nivelRiesgo)}; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: ${nivelColor(nivelRiesgo)}10;">
        <div style="display:flex; gap: 24px; align-items:center;">
          <div style="text-align:center; min-width: 100px;">
            <p style="font-size:36px; font-weight:900; color:${nivelColor(nivelRiesgo)}; margin:0;">${scoreTotal}</p>
            <p style="font-size:10px; color:#6b6b76; margin:4px 0 0;">Puntuación (0–3)</p>
          </div>
          <div>
            <p style="font-size:18px; font-weight:700; color:${nivelColor(nivelRiesgo)}; margin:0;">${nivelRiesgo === 'bajo' ? '🟢' : nivelRiesgo === 'medio' ? '🟡' : '🔴'} Riesgo ${(nivelRiesgo || '').toUpperCase()}</p>
            <p style="font-size:10px; color:#6b6b76; margin:4px 0;">Metodología SUGEF 13-19 y Basel AML Index 2023</p>
          </div>
        </div>
      </div>
    </div>`

  // Agrupar todos los hits de todas las personas para el reporte de listas
  const listaVals = Object.values(resultadosListas || {})
  const todosLosHits = listaVals.flatMap(r => r.hits || [])
  const allHitsCombinados = listaVals.flatMap(r => r.allHits || r.hits || [])
  const nivelGlobal = listaVals.some(r => r.nivel === 'ALERTA') ? 'ALERTA' :
                      listaVals.some(r => r.nivel === 'REVISAR') ? 'REVISAR' : 'SIN_COINCIDENCIA'
  const fuentesConCoincidencia = [...new Set(todosLosHits.map(r => r.fuente))]
  const fuentesSinCoincidencia = TODAS_FUENTES.filter(f => !fuentesConCoincidencia.includes(f))
  const conteoFuente = {}
  TODAS_FUENTES.forEach(f => { conteoFuente[f] = todosLosHits.filter(r => r.fuente === f).length })
  const conteoVals = Object.values(conteoFuente)
  const maxConteo = conteoVals.length ? Math.max(1, ...conteoVals) : 1
  const uifMatches = allHitsCombinados.filter(r => r.fuente === 'ICD_CR_PEP' && (r.similitud || 0) >= 0.50)
  const enListaUIF = uifMatches.length > 0
  const mejorUIF = uifMatches.sort((a, b) => (b.similitud || 0) - (a.similitud || 0))[0]

  const secListas = `
    <div style="page-break-after: always;">
      <!-- Header idéntico a ConsultaPEP -->
      <div style="border: 2px solid #0a1247; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
        <div style="background: #0a1247; color: white; padding: 20px 32px; display:flex; align-items:center; gap:24px;">
          <div style="flex:1;">
            <p style="font-size:18px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
            <p style="font-size:11px; color:#9aa0c8; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
          </div>
          <div style="text-align:right; font-size:11px; color:#c3c7e0;">
            <p style="font-weight:700; color:white; font-size:13px; margin:0;">REPORTE DE CONSULTA</p>
            <p style="margin:2px 0;">LISTAS INTERNACIONALES Y PEP</p>
            <p style="font-size:9px; margin:2px 0;">Ref: CNL-PEP-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
          </div>
        </div>
        <div style="background:#f2f3f8; padding:6px 32px; font-size:10px; color:#101b54; display:flex; justify-content:space-between;">
          <span>📋 Documento válido como evidencia — Acuerdo SUGEF 13-19, Art. 21-28</span>
          <span>${new Date().toLocaleString('es-CR')}</span>
        </div>
      </div>

      <!-- Datos de consulta y reporte -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div style="border:1px solid #e4e4ea; border-radius:8px; padding:14px;">
          <p style="font-size:10px; font-weight:700; color:#6b6b76; text-transform:uppercase; margin:0 0 8px;">Datos de la Consulta</p>
          <table style="font-size:11px; width:100%;"><tbody>
            <tr><td style="color:#9a9aa4; padding:2px 0; width:40%;">Cliente:</td><td style="font-weight:600;">${nombre}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Identificación:</td><td>${cliente.cedula_juridica||cliente.numero_identificacion||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Tipo:</td><td>${tipo==='J'?'Persona Jurídica':'Persona Física'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Personas verificadas:</td><td>${Object.keys(resultadosListas).length}</td></tr>
          </tbody></table>
        </div>
        <div style="border:1px solid #e4e4ea; border-radius:8px; padding:14px;">
          <p style="font-size:10px; font-weight:700; color:#6b6b76; text-transform:uppercase; margin:0 0 8px;">Datos del Reporte</p>
          <table style="font-size:11px; width:100%;"><tbody>
            <tr><td style="color:#9a9aa4; padding:2px 0; width:40%;">Consultó:</td><td style="font-weight:600;">${profile?.nombre||profile?.email||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Sujeto Obligado:</td><td>${tenant?.nombre||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Fecha:</td><td>${new Date().toLocaleString('es-CR')}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Listas consultadas:</td><td>${TODAS_FUENTES.length}</td></tr>
          </tbody></table>
        </div>
      </div>

      <!-- Resultado consolidado -->
      <div style="border-radius:8px; padding:20px; text-align:center; border:2px solid ${nivelGlobal==='ALERTA'?'#de5f68':nivelGlobal==='REVISAR'?'#d98442':'#4fa574'}; background:${nivelGlobal==='ALERTA'?'#fdf3f3':nivelGlobal==='REVISAR'?'#fdf4ec':'#eff7f1'}; margin-bottom:16px;">
        <p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#6b6b76; margin:0 0 8px;">Resultado Consolidado</p>
        <p style="font-size:28px; font-weight:900; color:${nivelGlobal==='ALERTA'?'#86111a':nivelGlobal==='REVISAR'?'#7e3f12':'#1a5738'}; margin:0;">
          ${nivelGlobal==='ALERTA'?'🚨 ALERTA':nivelGlobal==='REVISAR'?'⚠️ REVISAR':'✅ SIN COINCIDENCIA'}
        </p>
        <p style="font-size:11px; color:#45454f; margin:6px 0 0;">
          ${nivelGlobal==='ALERTA'?`Se encontraron ${todosLosHits.length} coincidencias en ${fuentesConCoincidencia.length} lista(s).`:
            nivelGlobal==='REVISAR'?'Se encontraron coincidencias parciales que requieren verificación manual.':
            `No se encontraron coincidencias en ninguna de las ${TODAS_FUENTES.length} listas consultadas.`}
        </p>
      </div>

      <!-- Personas verificadas -->
      <div style="border:1px solid #e4e4ea; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#2a2a32; color:white; padding:10px 16px;">
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
                <td style="${rowStyle}"><span style="font-weight:700; color:${res.nivel==='ALERTA'?'#86111a':res.nivel==='REVISAR'?'#7e3f12':'#1a5738'};">${res.nivel==='ALERTA'?'🔴 ALERTA':res.nivel==='REVISAR'?'⚠ REVISAR':'✅ SIN HALLAZGOS'}</span></td>
                <td style="${rowStyle}">${res.esPEP?'🏛️ PEP':'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Resultados por lista -->
      <div style="border:1px solid #e4e4ea; border-radius:8px; padding:14px; margin-bottom:16px;">
        <p style="font-size:12px; font-weight:700; margin:0 0 10px;">📊 Resultados por Lista Internacional</p>
        ${TODAS_FUENTES.map(f => {
          const count = conteoFuente[f] || 0
          const cfg = FUENTES_CONFIG[f] || {}
          const pct = count > 0 ? Math.max(8, (count / maxConteo) * 100) : 0
          return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <span style="font-size:10px; color:#45454f; width:160px; flex-shrink:0;">${cfg.flag||''} ${cfg.label||f}</span>
            <div style="flex:1; background:#ededf1; border-radius:99px; height:16px; overflow:hidden;">
              ${count>0?`<div style="width:${pct}%; height:100%; background:${cfg.color||'#1a2348'}; border-radius:99px; display:flex; align-items:center; justify-content:flex-end; padding-right:6px;"><span style="font-size:9px; color:white; font-weight:700;">${count}</span></div>`:''}
            </div>
            <span style="font-size:10px; font-weight:700; width:80px; text-align:right; color:${count>0?'#86111a':'#1f6d45'};">${count>0?`${count} coincid.`:'Sin coincid.'}</span>
          </div>`
        }).join('')}
      </div>

      <!-- Listas sin coincidencias -->
      <div style="border:1px solid #e4e4ea; border-radius:8px; padding:14px; margin-bottom:16px;">
        <p style="font-size:12px; font-weight:700; margin:0 0 8px;">✅ Listas sin coincidencias (${fuentesSinCoincidencia.length}/${TODAS_FUENTES.length})</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          ${fuentesSinCoincidencia.map(f => `
            <div style="display:flex; align-items:center; gap:6px; background:#eff7f1; border-radius:6px; padding:4px 10px; font-size:10px; color:#45454f;">
              <span style="color:#1f6d45; font-weight:700;">✓</span>
              <span>${FUENTES_CONFIG[f]?.flag||''} ${FUENTES_CONFIG[f]?.label||f}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Detalle de coincidencias -->
      ${todosLosHits.length > 0 ? `
        <div style="border:1px solid #f5c2c5; border-radius:8px; overflow:hidden; margin-bottom:16px;">
          <div style="background:#c31b26; color:white; padding:10px 16px;">
            <p style="font-size:12px; font-weight:700; margin:0;">🚨 Detalle de Coincidencias (${todosLosHits.length})</p>
          </div>
          ${todosLosHits.map(r => {
            const cfg = FUENTES_CONFIG[r.fuente] || {}
            const sim = Math.round((r.similitud || 0) * 100)
            return `<div style="padding:12px 16px; border-bottom:1px solid #ededf1;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
                <div>
                  <span style="font-size:9px; font-weight:700; padding:2px 8px; border-radius:99px; color:white; background:${cfg.color||'#1a2348'};">${cfg.flag||''} ${cfg.label||r.fuente}</span>
                  <p style="font-size:12px; font-weight:700; color:#14141a; margin:4px 0 2px;">${r.nombre_completo}</p>
                  ${r.aliases?.length>0?`<p style="font-size:10px; color:#6b6b76; margin:0;">Aliases: ${r.aliases.slice(0,3).join(' · ')}</p>`:''}
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <p style="font-size:10px; color:#6b6b76; margin:0;">Similitud</p>
                  <p style="font-size:22px; font-weight:900; color:${sim>=85?'#86111a':sim>=65?'#7e3f12':'#a87813'}; margin:0;">${sim}%</p>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-top:6px; font-size:10px; color:#6b6b76;">
                ${r.tipo_entidad?`<span>📋 Tipo: ${r.tipo_entidad}</span>`:''}
                ${r.paises?.length>0?`<span>🌍 Países: ${r.paises.slice(0,3).join(', ')}</span>`:''}
                ${r.programa?`<span>⚖️ Programa: ${r.programa}</span>`:''}
                ${r.nivel_riesgo?`<span>🔴 Nivel: ${r.nivel_riesgo.replace('_',' ')}</span>`:''}
              </div>
            </div>`
          }).join('')}
        </div>` : ''}

      <!-- Sección PEP — idéntica a ConsultaPEP -->
      <div style="border:1px solid #f0e2be; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#a87813; color:white; padding:10px 16px;">
          <p style="font-size:12px; font-weight:700; margin:0;">🏛️ Personas Expuestas Políticamente (PEP)</p>
        </div>
        <div style="padding:14px 16px;">
          <p style="font-size:10px; font-weight:700; color:#6b6b76; text-transform:uppercase; margin:0 0 8px;">Verificación en Lista Oficial UIF — ICD Costa Rica</p>
          <div style="border-radius:6px; padding:10px 14px; border:1px solid ${enListaUIF?'#f5c2c5':'#b4dbc3'}; background:${enListaUIF?'#fdf3f3':'#eff7f1'};">
            <p style="font-size:12px; font-weight:700; color:${enListaUIF?'#86111a':'#1a5738'}; margin:0;">
              ${enListaUIF?'🚨 FIGURA EN LISTA PEP OFICIAL ICD':'✅ NO figura en Lista PEP oficial ICD'}
            </p>
            ${enListaUIF&&mejorUIF?`<p style="font-size:10px; color:#86111a; margin:4px 0 0;">Nombre en lista: <strong>${mejorUIF.nombre_completo}</strong> · Similitud: ${((mejorUIF.similitud||0)*100).toFixed(0)}%${mejorUIF.programa?` · Cargo: ${mejorUIF.programa}`:''}</p>`:''}
          </div>
          <p style="font-size:9px; color:#9a9aa4; margin:6px 0 0;">Fuente: UIF — ICD Costa Rica. Lista PEP corte 2026. Ley 7786, Art. 2 inc. 29 — Acuerdo SUGEF 13-19, Art. 36-40.</p>
        </div>
      </div>

      <!-- Pie legal -->
      <div style="border-top:2px solid #0a1247; padding-top:12px;">
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#6b6b76; margin-bottom:8px;">
          <div>
            <p style="font-weight:700; color:#45454f; margin:0;">CNL Craniley Compliance Services SRL</p>
            <p style="margin:2px 0;">Plataforma: cnl-compliance-app.vercel.app</p>
            <p style="margin:0;">Reporte generado: ${new Date().toLocaleString('es-CR')} por ${profile?.nombre||profile?.email||'—'}</p>
          </div>
          <div style="text-align:right;">
            <p style="font-weight:700; color:#45454f; margin:0;">Base Legal</p>
            <p style="margin:2px 0;">Ley 7786, Art. 15 bis — Debida Diligencia</p>
            <p style="margin:0;">Acuerdo SUGEF 13-19, Art. 21-28 y 36-40</p>
          </div>
        </div>
        <div style="background:#0a1247; color:#9aa0c8; font-size:9px; border-radius:6px; padding:8px 16px; text-align:center;">
          Este reporte constituye evidencia de la verificación realizada conforme al Acuerdo SUGEF 13-19 y debe conservarse 5 años (Ley 7786, Art. 24).
        </div>
      </div>
    </div>`

  const secDD = `
    <div>
      <div style="background: #0a1247; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 24px; border-radius: 8px 8px 0 0;">
        <div style="flex:1;">
          <p style="font-size:16px; font-weight:700; margin:0;">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
          <p style="font-size:12px; color:#9aa0c8; margin:4px 0 0;">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#c3c7e0;">
          <p style="font-weight:700; color:white; font-size:13px; margin:0;">NOTA DE DEBIDA DILIGENCIA</p>
          <p style="margin:2px 0;">Ref: CNL-DD-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}</p>
        </div>
      </div>
      <div style="background:#f2f3f8; padding:6px 32px; font-size:10px; color:#101b54; display:flex; justify-content:space-between; margin-bottom:16px;">
        <span>Acuerdo SUGEF 13-19, Art. 21-28 — Debida Diligencia del Cliente</span>
        <span>${new Date().toLocaleString('es-CR')}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div style="border:1px solid #e4e4ea; border-radius:8px; padding:16px;">
          <p style="font-size:10px; font-weight:700; color:#6b6b76; text-transform:uppercase; margin:0 0 8px;">Datos del Cliente</p>
          <table style="width:100%; font-size:11px;"><tbody>
            <tr><td style="color:#9a9aa4; padding:2px 0; width:40%;">Nombre:</td><td style="font-weight:600;">${nombre}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Tipo:</td><td>${tipo==='J'?'Persona Jurídica':'Persona Física'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Identificación:</td><td>${cliente.cedula_juridica||cliente.numero_identificacion||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">País residencia:</td><td>${cliente.pais_ubicacion||cliente.pais_nacimiento||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Actividad:</td><td>${cliente.actividad_eco_nombre||cliente.profesion_nombre||cliente.actividad_economica||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Propósito:</td><td>${cliente.proposito_relacion||'—'}</td></tr>
          </tbody></table>
        </div>
        <div style="border:1px solid #e4e4ea; border-radius:8px; padding:16px;">
          <p style="font-size:10px; font-weight:700; color:#6b6b76; text-transform:uppercase; margin:0 0 8px;">Datos del Reporte</p>
          <table style="width:100%; font-size:11px;"><tbody>
            <tr><td style="color:#9a9aa4; padding:2px 0; width:40%;">Elaborado por:</td><td style="font-weight:600;">${profile?.nombre||profile?.email||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Sujeto Obligado:</td><td>${tenant?.nombre||'—'}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Fecha:</td><td>${new Date().toLocaleString('es-CR')}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Nivel de riesgo:</td><td style="font-weight:700;">${(nivelFinal||'—').toUpperCase()}</td></tr>
            <tr><td style="color:#9a9aa4; padding:2px 0;">Documentos:</td><td>${itemsOk}/${todosItems.length} recopilados</td></tr>
          </tbody></table>
        </div>
      </div>
      ${perfil ? `
        <div style="border:1px solid #bcc8ee; border-radius:8px; margin-bottom:16px; overflow:hidden;">
          <div style="background:#293670; color:white; padding:10px 16px;">
            <p style="font-size:12px; font-weight:700; margin:0;">🤖 Perfil IA — Investigación del Cliente</p>
            <p style="font-size:10px; color:#bcc8ee; margin:2px 0 0;">Generado por Claude AI con búsqueda web</p>
          </div>
          <div style="padding:16px; font-size:11px; color:#45454f; line-height:1.6; white-space:pre-line;">${perfil}</div>
        </div>` : ''}
      <div style="border:1px solid #e4e4ea; border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <div style="background:#f7f7f9; padding:10px 16px; border-bottom:1px solid #e4e4ea;">
          <p style="font-size:12px; font-weight:700; margin:0;">📋 Checklist de Debida Diligencia — SUGEF 13-19 — ${itemsOk}/${todosItems.length} completados</p>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:10px;">
          <thead>
            <tr style="background:#ededf1; border-bottom:1px solid #e4e4ea;">
              <th style="padding:5px 8px; text-align:left; color:#6b6b76; width:24px;">#</th>
              <th style="padding:5px 8px; text-align:left; color:#6b6b76;">Documento / Verificación</th>
              <th style="padding:5px 8px; text-align:left; color:#6b6b76; width:40px;">Req.</th>
              <th style="padding:5px 8px; text-align:left; color:#6b6b76; width:100px;">Estado</th>
              <th style="padding:5px 8px; text-align:left; color:#6b6b76;">Notas / Referencia</th>
            </tr>
          </thead>
          <tbody>
            ${todosItems.map((item, idx) => {
              const est = getEstadoCL(checklist[item.id])
              const nota = getNotaCL(checklist[item.id])
              const rowBg = est === 'disponible' ? '#eff7f1' : est === 'no_disponible' ? '#fdf3f3' : '#ffffff'
              const estLabel = est === 'disponible' ? '✅ Disponible' : est === 'no_disponible' ? '❌ No disponible' : est === 'no_aplica' ? '➖ No aplica' : '⏳ Pendiente'
              const estColor = est === 'disponible' ? '#1f6d45' : est === 'no_disponible' ? '#c31b26' : est === 'no_aplica' ? '#6b6b76' : '#a87813'
              return `<tr style="background:${rowBg}; border-bottom:1px solid #ededf1;">
                <td style="padding:5px 8px; color:#9a9aa4;">${idx + 1}</td>
                <td style="padding:5px 8px; color:#45454f;">${item.label}</td>
                <td style="padding:5px 8px;"><span style="font-size:9px; font-weight:700; padding:2px 5px; border-radius:3px; background:${item.required?'#fbe1e2':'#ededf1'}; color:${item.required?'#86111a':'#6b6b76'};">${item.required?'Obl':'Opt'}</span></td>
                <td style="padding:5px 8px; font-size:9px; font-weight:600; color:${estColor};">${estLabel}</td>
                <td style="padding:5px 8px; color:#6b6b76;">${nota || '—'}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="border:2px solid ${nivelColor(nivelFinal||'medio')}; border-radius:8px; padding:16px; margin-bottom:16px;">
        <p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#6b6b76; margin:0 0 6px;">Conclusión — Nivel de Riesgo Asignado</p>
        <p style="font-size:16px; font-weight:700; color:${nivelColor(nivelFinal||'medio')}; margin:0;">${(nivelFinal||'—').toUpperCase()}</p>
        <p style="font-size:10px; color:#45454f; margin:4px 0 0;">${nivel?.desc||''} · Próxima actualización: ${nivel?.years||'—'} año(s)</p>
        <p style="font-size:9px; color:#9a9aa4; margin:4px 0 0;">Conservar 5 años mínimo — Ley 7786, Art. 24</p>
      </div>
      <div style="border:1px solid #cfcfd7; border-radius:8px; padding:20px; display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-bottom:16px;">
        <div>
          <p style="font-size:10px; color:#9a9aa4; margin:0 0 32px;">Firma del Oficial de Cumplimiento</p>
          <div style="border-top:1px solid #9a9aa4; padding-top:6px;">
            <p style="font-size:12px; font-weight:600; margin:0;">${profile?.nombre||profile?.email||''}</p>
            <p style="font-size:10px; color:#6b6b76; margin:2px 0 0;">${tenant?.nombre||''}</p>
          </div>
        </div>
        <div>
          <p style="font-size:10px; color:#9a9aa4; margin:0 0 32px;">Fecha y lugar</p>
          <div style="border-top:1px solid #9a9aa4; padding-top:6px;">
            <p style="font-size:12px; margin:0;">${new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'long',year:'numeric'})}</p>
            <p style="font-size:10px; color:#6b6b76; margin:2px 0 0;">San José, Costa Rica</p>
          </div>
        </div>
      </div>
      <div style="background:#0a1247; color:#9aa0c8; font-size:9px; border-radius:6px; padding:10px 16px; text-align:center;">
        Este expediente constituye evidencia de la debida diligencia aplicada conforme a la Ley N.° 7786 y el Acuerdo SUGEF 13-19.
        Debe conservarse por un mínimo de cinco (5) años desde el cierre de la relación comercial.
        Plataforma: cnl-compliance-app.vercel.app — CNL Craniley Compliance Services SRL.
      </div>
    </div>`

  return `<html><head><title>Expediente Compliance — ${nombre}</title>
    <style>* { box-sizing:border-box; } body { font-family:Arial,sans-serif; font-size:11px; color:#14141a; margin:20px 32px; } @page { margin:12mm; }</style>
    </head><body>${secCalificacion}${secListas}${secDD}</body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: CALIFICACIÓN DE RIESGO
// ─────────────────────────────────────────────────────────────────────────────
function SeccionCalificacion({ cliente, onScoreChange, onGuardar }) {
  const { tenant, profile } = useAuth()
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

  const [resp, setResp]       = useState(prefill)
  const [saving, setSaving]   = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const { scoreTotal, desglose } = calcScore(resp, tipo)
  const nivel = clasificar(scoreTotal)

  useEffect(() => { onScoreChange?.({ scoreTotal, nivel, desglose }) }, [scoreTotal, nivel])

  const guardarCalificacion = async () => {
    if (!cliente?.id) return
    setSaving(true); setSavedOk(false)
    try {
      const hoy = new Date().toISOString().split('T')[0]
      // Marcar vigentes anteriores
      await supabase.from('calificaciones_riesgo').update({ vigente: false }).eq('cliente_id', cliente.id)
      // Insertar nueva calificación histórica
      const { error } = await supabase.from('calificaciones_riesgo').insert({
        tenant_id:          tenant?.id,
        cliente_id:         cliente.id,
        tipo_persona:       tipo,
        resp_cliente:       resp,
        resp_geo:           resp,
        resp_productos:     resp,
        resp_canales:       resp,
        score_total:        scoreTotal,
        calificacion:       nivel,
        fecha_calificacion: hoy,
        vigente:            true,
        calificador_id:     profile?.id,
      })
      if (error) throw error

      // Actualizar campos en clientes — con fallback si columnas extendidas no existen
      const { error: errExt } = await supabase.from('clientes').update({
        calificacion_riesgo:       nivel,
        nivel_riesgo_actual:       nivel,
        estado_calificacion:       'completado',
        fecha_ultima_calificacion: hoy,
      }).eq('id', cliente.id)

      if (errExt) {
        // Fallback: solo columnas base
        await supabase.from('clientes').update({ calificacion_riesgo: nivel }).eq('id', cliente.id)
      }

      setSavedOk(true)
      onGuardar?.(nivel)
    } catch (e) {
      alert('Error al guardar calificación: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

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
      {/* Botón guardar calificación */}
      <div className="flex items-center justify-between border-t pt-3">
        <div className="text-xs text-gray-400">
          <p>⚖ Base legal: Ley 7786, Acuerdo SUGEF 13-19, Recomendaciones GAFI</p>
          <p>📋 Metodología: N06 — adaptada del Basel AML Index 2023</p>
        </div>
        <div className="flex items-center gap-3">
          {savedOk && <span className="text-xs text-green-600 font-medium">✅ Calificación guardada</span>}
          <button onClick={guardarCalificacion} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 text-white text-sm font-semibold rounded-lg hover:bg-brand-800 disabled:opacity-60 transition-colors">
            {saving ? '⏳ Guardando…' : '💾 Guardar calificación'}
          </button>
        </div>
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
  const [guardadoDB, setGuardadoDB] = useState(false)

  const ejecutar = async () => {
    setCargando(true); setError(''); setGuardadoDB(false)
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
        const subs = p.sub_personas || []
        for (const s of subs) {
          if (!s.nombre?.trim()) continue
          nuevos[s.nombre] = { ...(await buscarEnListas(s.nombre, s.identificacion)), rol: s.tipo_relacion?.replace(/_/g,' ') || 'Vinculado', id: s.identificacion || '' }
        }
      }

      setResultadosListas(nuevos)
      onResultados?.(nuevos)
      setBuscado(true)

      // ── Guardar resultados en DB ──────────────────────────────────────
      const vals = Object.values(nuevos)
      const hayPEP       = vals.some(r => r.esPEP)
      const nivelMax     = vals.some(r => r.nivel === 'ALERTA')  ? 'ALERTA'  :
                           vals.some(r => r.nivel === 'REVISAR') ? 'REVISAR' : 'SIN_HALLAZGOS'
      const apareceEnListas = nivelMax === 'ALERTA'
      const estadoListas    = nivelMax === 'ALERTA'  ? 'alerta'    :
                              nivelMax === 'REVISAR' ? 'revisar'   : 'verificado'

      if (cliente?.id) {
        const { error: errDB } = await supabase.from('clientes').update({
          pep:              hayPEP,
          aparece_en_listas: apareceEnListas,
          estado_listas:    estadoListas,
        }).eq('id', cliente.id)
        if (!errDB) setGuardadoDB(true)
      }
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
          <div className="border-t pt-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              ⏱ Consulta realizada: {new Date().toLocaleString('es-CR')}
            </p>
            {guardadoDB && (
              <p className="text-xs text-green-600 font-medium">✅ PEP y listas guardados en base de datos</p>
            )}
          </div>
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
  const hayPEP = Object.values(resultadosListas || {}).some(r => r.esPEP)
  const todosItems = [...CHECKLIST_BASE, ...(tipo === 'J' ? CHECKLIST_PJ : []), ...(hayPEP ? CHECKLIST_PEP : [])]

  const [checklist, setChecklist]   = useState({})
  const [nivelLocal, setNivelLocal] = useState(nivelFinal || 'medio')
  const [justif, setJustif]         = useState('')
  const [perfil, setPerfil]         = useState('')
  const [nivelIA, setNivelIA]       = useState('')
  const [cargandoIA, setCargandoIA] = useState(false)
  const [errorIA, setErrorIA]       = useState('')
  const [savingDD, setSavingDD]     = useState(false)
  const [savedDD, setSavedDD]       = useState(false)

  const setItem = (id, campo, val) => {
    const next = { ...checklist, [id]: { ...(checklist[id] || {}), [campo]: val } }
    setChecklist(next)
    onChecklistChange?.(next)
  }

  const itemsOk = todosItems.filter(it => getEstadoCL(checklist[it.id]) === 'disponible').length

  const generarPerfil = async () => {
    setCargandoIA(true); setErrorIA(''); setPerfil('')
    try {
      const nombreEntidad = nombreCompleto(cliente)
      const actividad = cliente.actividad_eco_nombre || cliente.profesion_nombre || cliente.actividad_economica || ''
      const pais = cliente.pais_ubicacion || cliente.pais_nacimiento || 'Costa Rica'
      const res = await apiFetch('/api/dd-profile', {
        method: 'POST',
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

      {/* Checklist tabla */}
      <div className="card overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <p className="font-semibold text-gray-900">📋 Checklist de Debida Diligencia — SUGEF 13-19</p>
          <span className="text-xs text-gray-500">{itemsOk}/{todosItems.length} completados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Documento / Verificación</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-14">Req.</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-44">Estado</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Notas / Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { titulo: 'Base — Todos los clientes', items: CHECKLIST_BASE },
                ...(tipo === 'J' ? [{ titulo: 'Persona Jurídica — Art. 30 SUGEF 13-19', items: CHECKLIST_PJ }] : []),
                ...(hayPEP ? [{ titulo: '🏛️ PEP — DDC Ampliada — Art. 38', items: CHECKLIST_PEP }] : []),
              ].flatMap((grupo, gi) => [
                <tr key={`h-${gi}`} className="bg-gray-50">
                  <td colSpan={5} className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">{grupo.titulo}</td>
                </tr>,
                ...grupo.items.map((item, idx) => {
                  const estado = getEstadoCL(checklist[item.id])
                  const nota   = getNotaCL(checklist[item.id])
                  const rowBg  = estado === 'disponible' ? 'bg-green-50' : estado === 'no_disponible' ? 'bg-red-50' : ''
                  return (
                    <tr key={item.id} className={`${rowBg} transition-colors`}>
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{item.label}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {item.required ? 'Obl' : 'Opt'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <select value={estado} onChange={e => setItem(item.id, 'estado', e.target.value)}
                          className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none ${
                            estado === 'disponible'    ? 'border-green-300 bg-green-50 text-green-700' :
                            estado === 'no_disponible' ? 'border-red-300 bg-red-50 text-red-700' :
                            estado === 'no_aplica'     ? 'border-gray-200 bg-gray-50 text-gray-500' :
                                                         'border-amber-200 bg-amber-50 text-amber-700'
                          }`}>
                          {ESTADOS_CHECKLIST.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={nota} placeholder="Observaciones..."
                          onChange={e => setItem(item.id, 'nota', e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-brand-400" />
                      </td>
                    </tr>
                  )
                }),
              ])}
            </tbody>
          </table>
        </div>
      </div>

      {/* Observaciones */}
      <div className="card space-y-2">
        <label className="label text-xs">Observaciones y conclusión del Oficial de Cumplimiento</label>
        <textarea className="input text-sm" rows={3}
          placeholder="Resumen de la debida diligencia, hallazgos relevantes, conclusión…"
          value={justif} onChange={e => setJustif(e.target.value)} />
      </div>

      {/* Guardar estado DD en DB */}
      <div className="border-t pt-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-gray-400">⚖ Base legal: Ley 7786, Acuerdo SUGEF 13-19 Art. 27-30, Recomendaciones GAFI 10, 12, 22, 24</p>
        <div className="flex items-center gap-3">
          {savedDD && <span className="text-xs text-green-600 font-medium">✅ Estado DD guardado</span>}
          <button
            disabled={savingDD || !cliente?.id}
            onClick={async () => {
              setSavingDD(true); setSavedDD(false)
              try {
                const completados = todosItems.filter(it => getEstadoCL(checklist[it.id]) === 'disponible').length
                const obligatoriosOk = todosItems.filter(it => it.required && getEstadoCL(checklist[it.id]) === 'disponible').length
                const totalOblig = todosItems.filter(it => it.required).length
                const estadoDD = obligatoriosOk === totalOblig ? 'completado'
                               : completados > 0             ? 'en_progreso'
                               :                               'pendiente'
                const { error } = await supabase.from('clientes').update({
                  estado_dd:          estadoDD,
                  nivel_riesgo_actual: nivelLocal,
                  calificacion_riesgo: nivelLocal,
                }).eq('id', cliente.id)
                if (error) throw error
                setSavedDD(true)
              } catch (e) {
                alert('Error al guardar DD: ' + e.message)
              } finally {
                setSavingDD(false)
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 text-white text-sm font-semibold rounded-lg hover:bg-brand-800 disabled:opacity-60 transition-colors">
            {savingDD ? '⏳ Guardando…' : '💾 Guardar estado DD'}
          </button>
        </div>
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
    try {
      const hayPEP = Object.values(resultadosListas || {}).some(r => r.esPEP)
      const html = generarHTMLReporte({
        cliente, participantes: personas || [], resultadosListas: resultadosListas || {},
        perfil, nivelFinal, checklist, hayPEP, tenant, profile,
        scoreTotal: (scoreData.scoreTotal ?? 0).toFixed(2),
        nivelRiesgo: scoreData.nivel || '',
        desglose: scoreData.desglose || {},
        tipo,
      })
      const w = window.open('', '_blank', 'width=900,height=700')
      if (!w) {
        alert('El navegador bloqueó la ventana emergente. Por favor permita popups para este sitio y vuelva a intentarlo.')
        return
      }
      w.document.write(html)
      w.document.close()
      setTimeout(() => { try { w.print() } catch (e) { /* ignorar si falla print */ } }, 600)
    } catch (err) {
      alert('Error al generar el informe: ' + err.message)
      console.error('imprimirTodo error:', err)
    }
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
              onGuardar={(nv) => setScoreData(prev => ({ ...prev, nivel: nv }))}
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
