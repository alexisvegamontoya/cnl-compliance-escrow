import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import PanelPeriodicidad from '../components/informes/PanelPeriodicidad'
import {
  CRITERIOS_CLIENTE, CRITERIOS_GEO, CRITERIOS_PRODUCTOS, CRITERIOS_CANALES,
  OPCIONES, PAISES_RIESGO, PAISES_ALTO_RIESGO_FT,
  calcularScoreFactor, calcularScoreTotal, clasificar,
  ACTIVIDADES_PROFESIONES, CANTONES_CR, PROVINCIAS_CR,
} from '../lib/metodologiaRiesgo'

// ------------------------------------
// Helpers UI
// ------------------------------------
const RIESGO_COLOR = {
  bajo:  { bg: 'bg-green-100',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700 border-green-200' },
  medio: { bg: 'bg-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  alto:  { bg: 'bg-red-100',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700 border-red-200' },
}

function RiesgoBadge({ nivel, score }) {
  if (!nivel) return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500">Sin calificar</span>
  const c = RIESGO_COLOR[nivel]
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${c.badge}`}>
      {nivel.toUpperCase()} {score != null ? `(${Number(score).toFixed(3)})` : ''}
    </span>
  )
}

function ScoreBar({ score, max = 3 }) {
  if (score == null) return null
  const pct = Math.min((score / max) * 100, 100)
  const color = score <= 1 ? 'bg-green-500' : score <= 2 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ------------------------------------
// Formulario de un factor de riesgo
// ------------------------------------
function FactorForm({ titulo, criterios, respuestas, onChange, tipo, esGeo = false, esONG = false }) {
  function renderSelect(criterio) {
    let opciones = OPCIONES[criterio.key] || OPCIONES['pais_riesgo']

    // ── Actividad económica / profesión: dropdown de 152 actividades agrupadas ──
    if (['actividad_eco', 'profesion'].includes(criterio.key)) {
      const selNombre = respuestas[criterio.key + '_nombre'] || ''
      const selValor  = respuestas[criterio.key] || ''
      return (
        <div key={criterio.key} className="space-y-1">
          <label className="text-sm text-gray-600">
            {criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span>
          </label>
          <select
            className="input-field text-sm"
            value={selNombre}
            onChange={e => {
              const nombre = e.target.value
              const act = ACTIVIDADES_PROFESIONES.find(a => a.label === nombre)
              onChange(criterio.key + '_nombre', nombre)
              onChange(criterio.key, act ? act.valor : '')
            }}
          >
            <option value="">— Seleccione actividad —</option>
            <optgroup label="🔴 Alto riesgo">
              {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 3).map(a => (
                <option key={a.label} value={a.label}>{a.label}</option>
              ))}
            </optgroup>
            <optgroup label="🟡 Riesgo medio">
              {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 2).map(a => (
                <option key={a.label} value={a.label}>{a.label}</option>
              ))}
            </optgroup>
            <optgroup label="🟢 Bajo riesgo">
              {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 1).map(a => (
                <option key={a.label} value={a.label}>{a.label}</option>
              ))}
            </optgroup>
          </select>
          {selValor && (
            <div className="flex items-center gap-2">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${selValor <= 1 ? 'bg-green-400' : selValor <= 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                  style={{ width: `${(selValor / 3) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-8">{selValor}</span>
            </div>
          )}
        </div>
      )
    }

    // ── Operación nacional: selector provincia + cantón ────────────────────────
    if (criterio.key === 'op_nacional') {
      const selProvincia = respuestas['op_nacional_provincia'] || ''
      const selCanton    = respuestas['op_nacional_canton']    || ''
      const cantonesProv = CANTONES_CR.filter(c => c.provincia === selProvincia)
      const cantonObj    = CANTONES_CR.find(c => c.canton === selCanton)
      return (
        <div key={criterio.key} className="space-y-1">
          <label className="text-sm text-gray-600">
            {criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span>
          </label>
          <select
            className="input-field text-sm"
            value={selProvincia}
            onChange={e => {
              onChange('op_nacional_provincia', e.target.value)
              onChange('op_nacional_canton', '')
              onChange('op_nacional', '')
            }}
          >
            <option value="">— Seleccione provincia —</option>
            {PROVINCIAS_CR.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {selProvincia && (
            <select
              className="input-field text-sm"
              value={selCanton}
              onChange={e => {
                const canton = e.target.value
                const obj = CANTONES_CR.find(c => c.canton === canton)
                onChange('op_nacional_canton', canton)
                onChange('op_nacional', obj ? obj.valor : '')
              }}
            >
              <option value="">— Seleccione cantón —</option>
              {cantonesProv.map(c => (
                <option key={c.canton} value={c.canton}>{c.canton}</option>
              ))}
            </select>
          )}
          {cantonObj && (
            <p className={`text-xs font-medium ${cantonObj.valor === 1 ? 'text-green-600' : cantonObj.valor === 2 ? 'text-yellow-600' : 'text-red-600'}`}>
              {cantonObj.valor === 1 ? '🟢 Bajo riesgo' : cantonObj.valor === 2 ? '🟡 Riesgo medio' : '🔴 Alto riesgo'} — {selCanton}
            </p>
          )}
        </div>
      )
    }

    // Para criterios geográficos de país: mostrar lista de países
    if (esGeo && ['pais_origen', 'residencia', 'ubicacion_geo', 'casa_matriz'].includes(criterio.key)) {
      const listaPaises = esONG ? PAISES_RIESGO : PAISES_RIESGO
      const paisSeleccionado = respuestas[criterio.key + '_nombre'] || ''
      const riesgoPais = PAISES_RIESGO.find(p => p.pais === paisSeleccionado)?.riesgo

      return (
        <div key={criterio.key} className="space-y-1">
          <label className="text-sm text-gray-600">{criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span></label>
          <select
            className="input-field text-sm"
            value={paisSeleccionado}
            onChange={e => {
              const pais = e.target.value
              const riesgo = PAISES_RIESGO.find(p => p.pais === pais)?.riesgo || null
              // Para ONG verificar lista FT
              const esFT = esONG && PAISES_ALTO_RIESGO_FT.includes(pais)
              const valorFinal = riesgo || (esFT ? 3 : null)
              onChange(criterio.key + '_nombre', pais)
              onChange(criterio.key, valorFinal)
            }}
          >
            <option value="">— Seleccione país —</option>
            <option value="Nacional / Costa Rica">Nacional / Costa Rica (Bajo riesgo)</option>
            <optgroup label="Bajo riesgo (Basel AML Index 2023)">
              {PAISES_RIESGO.filter(p => p.riesgo === 1).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
            <optgroup label="Riesgo Medio">
              {PAISES_RIESGO.filter(p => p.riesgo === 2).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
            <optgroup label="Alto Riesgo (GAFI / Basel)">
              {PAISES_RIESGO.filter(p => p.riesgo === 3).map(p => (
                <option key={p.pais} value={p.pais}>{p.pais}</option>
              ))}
            </optgroup>
          </select>
          {riesgoPais && (
            <p className={`text-xs font-medium ${riesgoPais === 1 ? 'text-green-600' : riesgoPais === 2 ? 'text-yellow-600' : 'text-red-600'}`}>
              {riesgoPais === 1 ? '🟢 Bajo riesgo' : riesgoPais === 2 ? '🟡 Riesgo medio' : '🔴 Alto riesgo (GAFI)'}
              {esONG && PAISES_ALTO_RIESGO_FT.includes(paisSeleccionado) && ' — ⚠ Lista FT'}
            </p>
          )}
        </div>
      )
    }

    return (
      <div key={criterio.key} className="space-y-1">
        <label className="text-sm text-gray-600">{criterio.label} <span className="text-gray-400">({(criterio.peso * 100).toFixed(0)}%)</span></label>
        <select
          className="input-field text-sm"
          value={respuestas[criterio.key] || ''}
          onChange={e => onChange(criterio.key, e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">— Seleccione —</option>
          {opciones.map(o => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
        {respuestas[criterio.key] && (
          <div className="flex items-center gap-2">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${respuestas[criterio.key] <= 1 ? 'bg-green-400' : respuestas[criterio.key] <= 2 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${(respuestas[criterio.key] / 3) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-8">{respuestas[criterio.key]}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">{titulo}</h3>
      <div className="grid grid-cols-1 gap-4">
        {criterios.map(c => renderSelect(c))}
      </div>
    </div>
  )
}

// ------------------------------------
// Historial de calificaciones de un cliente
// ------------------------------------
function HistorialCalificaciones({ clienteId }) {
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId) return
    supabase.from('calificaciones_riesgo')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setHistorial(data || []); setLoading(false) })
  }, [clienteId])

  if (loading) return <p className="text-sm text-gray-400">Cargando historial…</p>
  if (!historial.length) return <p className="text-sm text-gray-400">Sin calificaciones previas</p>

  return (
    <div className="space-y-2">
      {historial.map((h, i) => (
        <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${i === 0 ? 'border-brand-200 bg-brand-50' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex-1">
            <span className="font-medium text-gray-700">{new Date(h.fecha_calificacion).toLocaleDateString('es-CR')}</span>
            {i === 0 && <span className="ml-2 text-xs text-brand-600 font-medium">Vigente</span>}
          </div>
          <RiesgoBadge nivel={h.calificacion_manual || h.calificacion} score={h.score_total} />
          {h.calificacion_manual && h.calificacion_manual !== h.calificacion && (
            <span className="text-xs text-orange-600 font-medium">Modificado</span>
          )}
          {h.observaciones && (
            <span className="text-xs text-gray-400 max-w-xs truncate" title={h.observaciones}>💬 {h.observaciones}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------
// Helpers listas ALA/CFT
// ------------------------------------
function calcNivelListas(data) {
  if (!data?.length) return 'SIN_COINCIDENCIA'
  const max = Math.max(...data.map(r => r.similitud || 0))
  if (max >= 0.85) return 'COINCIDENCIA'
  if (max >= 0.65) return 'REVISAR'
  return 'SIN_COINCIDENCIA'
}

const FUENTES_LABEL = {
  OFAC_SDN:   'OFAC SDN',
  OFAC_CONS:  'OFAC Consolidated',
  ONU:        'ONU',
  UK_OFSI:    'UK OFSI',
  INTERPOL:   'INTERPOL',
  GAFI_NEGRO: 'GAFI Lista Negra',
  GAFI_GRIS:  'GAFI Lista Gris',
  GAFILAT:    'GAFILAT',
  ICD_CR_PEP: 'ICD CR PEP',
}

function ListasSancionesPanel({ nivel, resultado, loading }) {
  if (loading) return (
    <div className="flex items-center gap-2 p-2 text-sm text-gray-400">
      <span className="animate-spin inline-block">⏳</span> Consultando listas ALA/CFT…
    </div>
  )
  if (!nivel) return null

  const fuentesMatch = [...new Set((resultado || []).map(r => r.fuente))]
  const maxSim = resultado?.length ? Math.max(...resultado.map(r => r.similitud || 0)) : 0

  if (nivel === 'COINCIDENCIA') return (
    <div className="p-3 bg-red-50 border border-red-300 rounded-lg space-y-1.5">
      <p className="font-semibold text-red-700 text-sm">🚨 ALERTA: Figura en listas de sanciones</p>
      <p className="text-red-600 text-xs">Similitud máx: {(maxSim * 100).toFixed(0)}% — Calificación elevada a ALTO</p>
      <div className="flex flex-wrap gap-1">
        {fuentesMatch.map(f => (
          <span key={f} className="px-1.5 py-0.5 bg-red-100 text-red-800 text-xs rounded border border-red-200 font-medium">
            {FUENTES_LABEL[f] || f}
          </span>
        ))}
      </div>
      <p className="text-xs text-red-500">Requiere DDC reforzada — Art. 24 Acuerdo SUGEF 13-19. Verifique en módulo PEP/Listas.</p>
    </div>
  )

  if (nivel === 'REVISAR') return (
    <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg space-y-1.5">
      <p className="font-semibold text-orange-700 text-sm">⚠️ REVISAR: Posible coincidencia en listas</p>
      <p className="text-orange-600 text-xs">Similitud máx: {(maxSim * 100).toFixed(0)}% — Verifique manualmente</p>
      <div className="flex flex-wrap gap-1">
        {fuentesMatch.map(f => (
          <span key={f} className="px-1.5 py-0.5 bg-orange-100 text-orange-800 text-xs rounded border border-orange-200 font-medium">
            {FUENTES_LABEL[f] || f}
          </span>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
      <p className="font-medium text-green-700 text-sm">✅ Sin coincidencias en listas ALA/CFT</p>
      <p className="text-green-600 text-xs mt-0.5">OFAC · ONU · UK OFSI · INTERPOL · ICD CR PEP · GAFI · GAFILAT</p>
    </div>
  )
}

// ------------------------------------
// Helpers de reporte (nivel módulo para evitar errores de Fast Refresh)
// ------------------------------------
function getLabel(key, valor) {
  if (valor == null || valor === '') return '—'
  const opciones = OPCIONES[key] || OPCIONES['pais_riesgo']
  const op = opciones?.find(o => Number(o.valor) === Number(valor))
  return op?.label || String(valor)
}

function getValorMostrado(respuestas, criterio) {
  const key = criterio.key
  const val = respuestas[key]
  const nombreGuardado = respuestas[key + '_nombre'] || respuestas['op_nacional_canton']
  if (['pais_origen','residencia','ubicacion_geo','casa_matriz'].includes(key) && nombreGuardado) {
    return { texto: nombreGuardado, valor: val }
  }
  if (['actividad_eco','profesion'].includes(key) && respuestas[key + '_nombre']) {
    return { texto: respuestas[key + '_nombre'], valor: val }
  }
  if (key === 'op_nacional' && respuestas['op_nacional_canton']) {
    return { texto: `${respuestas['op_nacional_provincia'] || ''} / ${respuestas['op_nacional_canton']}`, valor: val }
  }
  if (val == null || val === '') return { texto: '—', valor: null }
  return { texto: getLabel(key, val), valor: val }
}

function colorValor(v) {
  if (v == null) return '#6b7280'
  if (Number(v) <= 1) return '#16a34a'
  if (Number(v) <= 2) return '#d97706'
  return '#dc2626'
}

function TablaFactor({ titulo, criterios, respuestas, scoreF, pesoLabel }) {
  if (!respuestas || !criterios?.length) return null
  const tieneDatos = criterios.some(c => respuestas[c.key] != null && respuestas[c.key] !== '')
  if (!tieneDatos) return null
  return (
    <div style={{ marginBottom: '14px', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0e0e6e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {titulo}
        </div>
        <div style={{ fontSize: '10px', color: '#6b7280' }}>
          Score: <strong style={{ fontFamily: 'monospace', color: colorValor(scoreF) }}>{scoreF != null ? scoreF.toFixed(3) : '—'}</strong>
          {pesoLabel && <span style={{ marginLeft: '8px' }}>Peso: <strong>{pesoLabel}</strong></span>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ backgroundColor: '#e8eaf6' }}>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#374151', width: '50%' }}>Criterio</th>
            <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: '#374151', width: '8%' }}>Peso</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Respuesta seleccionada</th>
            <th style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: '#374151', width: '8%' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {criterios.map((c, i) => {
            const { texto, valor } = getValorMostrado(respuestas, c)
            return (
              <tr key={c.key} style={{ backgroundColor: i % 2 === 0 ? '#f9fafb' : 'white' }}>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{c.label}</td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', color: '#6b7280' }}>{(c.peso * 100).toFixed(0)}%</td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>{texto}</td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', color: colorValor(valor) }}>
                  {valor != null && valor !== '' ? Number(valor).toFixed(1) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------
// Reporte imprimible (solo visible en @media print)
// ------------------------------------
function ReporteImprimible({ clienteActual, nombreCliente, tipoPersona, calificacionFinal, calificacionAuto, calificacionManual, scoreTotal, scoreCli, scoreGeo, scoreProd, scoreCan, observaciones, listasNivel, respCliente, respGeo, respProductos, respCanales, fecha }) {
  if (!clienteActual) return null
  const nivelColor = calificacionFinal === 'alto' ? '#dc2626' : calificacionFinal === 'medio' ? '#d97706' : '#16a34a'
  const nivelBg    = calificacionFinal === 'alto' ? '#fef2f2' : calificacionFinal === 'medio' ? '#fffbeb' : '#f0fdf4'

  const pesosFisica   = { cli: '60%', geo: '40%', prod: 'N/A', can: 'N/A' }
  const pesosJuridica = { cli: '50%', geo: '15%', prod: '20%', can: '15%' }
  const pesos = tipoPersona === 'fisica' ? pesosFisica : pesosJuridica
  const criteriosCli  = CRITERIOS_CLIENTE[tipoPersona]  || []
  const criteriosGeo  = CRITERIOS_GEO[tipoPersona]      || []
  const criteriosProd = CRITERIOS_PRODUCTOS[tipoPersona] || []
  const criteriosCan  = CRITERIOS_CANALES[tipoPersona]  || []

  return (
    <div id="reporte-cal" style={{ display: 'none', fontFamily: 'Arial, sans-serif', padding: '28px 32px', color: '#111', maxWidth: '780px', margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ borderBottom: '3px solid #0e0e6e', paddingBottom: '10px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#0e0e6e' }}>CNL CRANILEY COMPLIANCE</div>
          <div style={{ fontSize: '13px', color: '#374151', marginTop: '2px' }}>Calificación de Riesgo de Cliente — ALA/CFT/FPADM</div>
        </div>
        <div style={{ fontSize: '10px', color: '#6b7280', textAlign: 'right' }}>
          <div>Fecha: {fecha}</div>
          <div>Metodología N06 · Acuerdo SUGEF 13-19</div>
        </div>
      </div>

      {/* Datos del cliente */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '11px' }}>
        <tbody>
          <tr>
            <td style={{ color: '#6b7280', width: '110px', padding: '2px 0' }}>Cliente:</td>
            <td style={{ fontWeight: 'bold', padding: '2px 8px 2px 0' }}>{nombreCliente}</td>
            <td style={{ color: '#6b7280', width: '110px', padding: '2px 0' }}>Identificación:</td>
            <td style={{ padding: '2px 0' }}>{clienteActual?.numero_identificacion || '—'}</td>
          </tr>
          <tr>
            <td style={{ color: '#6b7280', padding: '2px 0' }}>Tipo persona:</td>
            <td style={{ padding: '2px 8px 2px 0' }}>{tipoPersona === 'fisica' ? 'Persona Física' : 'Persona Jurídica'}</td>
            <td style={{ color: '#6b7280', padding: '2px 0' }}>Score total:</td>
            <td style={{ fontWeight: 'bold', fontFamily: 'monospace', padding: '2px 0', color: colorValor(scoreTotal) }}>
              {scoreTotal != null ? scoreTotal.toFixed(3) : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Resultado */}
      <div style={{ border: `2px solid ${nivelColor}`, borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', backgroundColor: nivelBg }}>
        <div style={{ fontWeight: 'bold', fontSize: '17px', color: nivelColor }}>
          CALIFICACIÓN: {(calificacionFinal || '').toUpperCase()}
        </div>
        {calificacionManual && calificacionManual !== calificacionAuto && (
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '3px' }}>
            Calificación automática: {(calificacionAuto || '').toUpperCase()} — Ajustada manualmente por el oficial de cumplimiento
          </div>
        )}
        {listasNivel === 'COINCIDENCIA' && (
          <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 'bold', marginTop: '4px' }}>
            ⚠ ALERTA: Cliente identificado en listas internacionales de sanciones ALA/CFT — DDC reforzada requerida (Art. 24 SUGEF 13-19)
          </div>
        )}
        {listasNivel === 'REVISAR' && (
          <div style={{ fontSize: '10px', color: '#d97706', marginTop: '4px' }}>
            ⚠ REVISAR: Posible coincidencia en listas internacionales — verificar manualmente
          </div>
        )}
        {listasNivel === 'SIN_COINCIDENCIA' && (
          <div style={{ fontSize: '10px', color: '#16a34a', marginTop: '4px' }}>
            ✓ Sin coincidencias en listas ALA/CFT (OFAC · ONU · INTERPOL · ICD CR PEP · GAFI · GAFILAT)
          </div>
        )}
      </div>

      {/* Resumen de scores por factor */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', fontSize: '11px' }}>
        <thead>
          <tr style={{ backgroundColor: '#0e0e6e', color: 'white' }}>
            <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600 }}>Factor de riesgo</th>
            <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>Score</th>
            <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>Peso</th>
            <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600 }}>Contribución</th>
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Factor Cliente',           score: scoreCli,  peso: pesos.cli,  pesoPct: tipoPersona === 'fisica' ? 0.6 : 0.5  },
            { label: 'Zona Geográfica',          score: scoreGeo,  peso: pesos.geo,  pesoPct: tipoPersona === 'fisica' ? 0.4 : 0.15 },
            { label: 'Productos / Servicios',    score: scoreProd, peso: pesos.prod, pesoPct: tipoPersona === 'fisica' ? 0   : 0.2  },
            { label: 'Canales de Distribución',  score: scoreCan,  peso: pesos.can,  pesoPct: tipoPersona === 'fisica' ? 0   : 0.15 },
          ].map((f, i) => {
            const contrib = f.score != null && f.pesoPct > 0 ? (f.score * f.pesoPct).toFixed(3) : '—'
            return (
              <tr key={f.label} style={{ backgroundColor: i % 2 === 0 ? '#f9fafb' : 'white' }}>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb' }}>{f.label}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', color: colorValor(f.score) }}>
                  {f.score != null ? f.score.toFixed(3) : '—'}
                </td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>{f.peso}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontFamily: 'monospace', color: '#6b7280' }}>{contrib}</td>
              </tr>
            )
          })}
          <tr style={{ backgroundColor: '#e0e7ff', fontWeight: 'bold' }}>
            <td style={{ padding: '5px 8px' }}>Score Consolidado</td>
            <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', color: colorValor(scoreTotal) }}>{scoreTotal != null ? scoreTotal.toFixed(3) : '—'}</td>
            <td style={{ padding: '5px 8px', textAlign: 'center' }}>—</td>
            <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', color: colorValor(scoreTotal) }}>{scoreTotal != null ? scoreTotal.toFixed(3) : '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* ──── DETALLE POR FACTOR ──── */}
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0e0e6e', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '2px solid #0e0e6e', paddingBottom: '4px', marginBottom: '12px' }}>
        Detalle de criterios evaluados
      </div>

      <TablaFactor
        titulo="Factor Cliente"
        criterios={criteriosCli}
        respuestas={respCliente}
        scoreF={scoreCli}
        pesoLabel={pesos.cli}
      />
      <TablaFactor
        titulo="Zona Geográfica"
        criterios={criteriosGeo}
        respuestas={respGeo}
        scoreF={scoreGeo}
        pesoLabel={pesos.geo}
      />
      {tipoPersona === 'juridica' && (
        <>
          <TablaFactor
            titulo="Productos / Servicios"
            criterios={criteriosProd}
            respuestas={respProductos}
            scoreF={scoreProd}
            pesoLabel={pesos.prod}
          />
          <TablaFactor
            titulo="Canales de Distribución"
            criterios={criteriosCan}
            respuestas={respCanales}
            scoreF={scoreCan}
            pesoLabel={pesos.can}
          />
        </>
      )}

      {/* Observaciones */}
      {observaciones && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '5px', padding: '8px 12px', marginBottom: '14px', marginTop: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#374151', marginBottom: '3px' }}>Observaciones del oficial de cumplimiento:</div>
          <div style={{ fontSize: '11px', color: '#4b5563' }}>{observaciones}</div>
        </div>
      )}

      {/* Referencias */}
      <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '8px', marginTop: '10px' }}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
          Referencias y fuentes metodológicas
        </div>
        <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0, lineHeight: '1.7' }}>
          <strong>Metodología:</strong> Metodología N06 — Evaluación de Riesgo ALA/CFT/FPADM. Acuerdo SUGEF 13-19, Art. 5–10. &nbsp;|&nbsp;
          <strong>Riesgo por país:</strong> Basel AML Index 2023, Basel Institute on Governance. &nbsp;|&nbsp;
          <strong>Riesgo cantonal:</strong> SUGEF — Informe de Riesgo por Provincia y Cantón de Costa Rica (RIESGO_PROVINCIA_CANTON_AL_2025). &nbsp;|&nbsp;
          <strong>Actividades y profesiones:</strong> Clasificación de actividades económicas ALA/CFT — Metodología N06. &nbsp;|&nbsp;
          <strong>Verificación de listas:</strong> OFAC SDN, ONU, UK OFSI, INTERPOL, GAFI/FATF, GAFILAT, Lista PEP UIF–ICD Costa Rica (corte 08/04/2026). &nbsp;|&nbsp;
          <strong>Marco legal:</strong> Ley 7786 (CONASSEP), Acuerdo SUGEF 13-19, Recomendaciones GAFI 2012 (rev. 2023).
        </p>
        <p style={{ fontSize: '8.5px', color: '#d1d5db', margin: '5px 0 0', textAlign: 'right' }}>
          Generado por CNL Craniley Compliance · www.cnl-cr.com · {fecha}
        </p>
      </div>
    </div>
  )
}

// ------------------------------------
// PÁGINA PRINCIPAL
// ------------------------------------
export default function CalificacionRiesgo() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const isONG = Number(tenant?.clase_dato) === 42
  const [penalizacionInformes, setPenalizacionInformes] = useState(0)

  const [clientes, setClientes] = useState([])
  const [tenants, setTenants] = useState([])
  const [tenantId, setTenantId] = useState(tenant?.id || '')
  const [clienteId, setClienteId] = useState('')
  const [clienteActual, setClienteActual] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('calificar') // calificar | historial | dashboard

  // Tipo de persona
  const [tipoPersona, setTipoPersona] = useState('fisica')

  // Respuestas por factor
  const [respCliente, setRespCliente] = useState({})
  const [respGeo, setRespGeo] = useState({})
  const [respProductos, setRespProductos] = useState({})
  const [respCanales, setRespCanales] = useState({})

  // Override y notas
  const [calificacionManual, setCalificacionManual] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Listas ALA/CFT
  const [listasResult, setListasResult] = useState(null)
  const [listasLoading, setListasLoading] = useState(false)
  const [listasNivel, setListasNivel] = useState(null)

  // Dashboard stats
  const [stats, setStats] = useState(null)
  const [sinCalificar, setSinCalificar] = useState([])
  const [ultimasCalif, setUltimasCalif] = useState([])

  // Cargar tenants si superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('id, nombre, clase_dato').order('nombre')
        .then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // Cargar clientes del tenant seleccionado
  const tenantEfectivo = isSuperAdmin
    ? (tenants.find(t => t.id === tenantId) || tenant)
    : tenant

  const loadClientes = useCallback(async () => {
    const tid = isSuperAdmin ? tenantId : tenant?.id
    if (!tid) return
    const { data } = await supabase.from('clientes')
      .select('id, numero_identificacion, nombre_cliente, primer_apellido, nombre_empresa, tipo_identificacion, calificacion_riesgo, nacionalidad, pais_ubicacion, pais_nacimiento, pais_constitucion, actividad_eco_nombre, actividad_eco_valor, profesion_nombre, profesion_valor, ingreso_mensual_est, provincia, canton, pep, sugef_estado')
      .eq('tenant_id', tid)
      .order('nombre_cliente', { nullsFirst: false })
    setClientes(data || [])
  }, [isSuperAdmin, tenantId, tenant?.id])

  useEffect(() => { loadClientes() }, [loadClientes])

  // Cargar estadísticas dashboard
  const loadStats = useCallback(async () => {
    const tid = isSuperAdmin ? tenantId : tenant?.id
    if (!tid) return
    const { data: allClientes } = await supabase.from('clientes')
      .select('id, calificacion_riesgo')
      .eq('tenant_id', tid)
    const { data: recientes } = await supabase.from('calificaciones_riesgo')
      .select('*, clientes(nombre_cliente, primer_apellido, nombre_empresa, numero_identificacion)')
      .eq('tenant_id', tid)
      .eq('vigente', true)
      .order('created_at', { ascending: false })
      .limit(20)
    const calificados = new Set((recientes || []).map(r => r.cliente_id))
    const todos = allClientes || []
    setStats({
      total: todos.length,
      alto: todos.filter(c => c.calificacion_riesgo === 'alto').length,
      medio: todos.filter(c => c.calificacion_riesgo === 'medio').length,
      bajo: todos.filter(c => c.calificacion_riesgo === 'bajo').length,
      sinCalif: todos.filter(c => !c.calificacion_riesgo).length,
    })
    setSinCalificar(todos.filter(c => !calificados.has(c.id)).slice(0, 10))
    setUltimasCalif(recientes || [])
  }, [isSuperAdmin, tenantId, tenant?.id])

  useEffect(() => { loadStats() }, [loadStats])

  // Cuando se selecciona un cliente
  // Pre-llenar todos los factores desde los datos del cliente en BD
  function preLlenarDesdeDB(c) {
    if (!c) return
    const tipoId = Number(c?.tipo_identificacion)
    const esFisica = [1, 3, 5].includes(tipoId)
    setTipoPersona(esFisica ? 'fisica' : 'juridica')

    // Factor GEO
    const paisOrigen = c?.pais_nacimiento || c?.pais_constitucion || c?.nacionalidad || ''
    const paisRes    = c?.pais_ubicacion || ''
    const rOrig = PAISES_RIESGO.find(p => paisOrigen && p.pais?.toLowerCase().includes(paisOrigen.toLowerCase()))?.riesgo || 1
    const rRes  = PAISES_RIESGO.find(p => paisRes   && p.pais?.toLowerCase().includes(paisRes.toLowerCase()))?.riesgo || 1
    setRespGeo({
      pais_origen_nombre: paisOrigen, pais_origen: rOrig,
      residencia_nombre: paisRes, residencia: rRes,
      ubicacion_geo: rOrig, casa_matriz: rOrig,
      transfronterizo: (rOrig > 1 || rRes > 1 ? 2 : 0.5),
      op_nacional: (c?.canton || c?.provincia) ? 0.5 : 1,
      op_internacional: 0.5,
    })

    // Factor CLIENTE
    const actVal = esFisica
      ? (Number(c?.profesion_valor) || (c?.profesion_nombre ? (ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === c.profesion_nombre.toLowerCase())?.valor || 1) : 1))
      : (Number(c?.actividad_eco_valor) || (c?.actividad_eco_nombre ? (ACTIVIDADES_PROFESIONES.find(a => a.label?.toLowerCase() === c.actividad_eco_nombre.toLowerCase())?.valor || 1) : 1))
    const ing = parseFloat(c?.ingreso_mensual_est) || 0
    const ingVal = ing > 6000 ? 1 : ing > 4000 ? 1.5 : ing > 2000 ? 2 : ing > 1000 ? 2.5 : ing > 0 ? 3 : 1
    setRespCliente({
      profesion: actVal, actividad_eco: actVal, servicios: actVal,
      ingreso_mensual: ingVal, info_ingreso: ingVal,
      pep: c?.pep ? 3 : 1,
      acceso_info: 1, listas_obs: 1,
      struct_admin: esFisica ? undefined : 1,
      struct_acc: 1, anos_exp: 1, anos_operacion: 1,
    })
    setRespProductos({})
    setRespCanales({})
    setCalificacionManual('')
    setObservaciones('')
  }

  function handleSelectCliente(id) {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    setClienteActual(c)
    // Detectar tipo de persona
    const tipoId = Number(c?.tipo_identificacion)
    const esFisica = [1, 3, 5].includes(tipoId)
    setTipoPersona(esFisica ? 'fisica' : 'juridica')
    // Limpiar respuestas anteriores
    setRespGeo({}); setRespCliente({}); setRespProductos({}); setRespCanales({})
    setCalificacionManual(''); setObservaciones('')

    // Consultar listas ALA/CFT automáticamente
    setListasResult(null)
    setListasNivel(null)
    const nomBuscar = c?.nombre_empresa || `${c?.nombre_cliente || ''} ${c?.primer_apellido || ''}`.trim()
    if (nomBuscar) {
      setListasLoading(true)
      supabase.rpc('buscar_en_listas', {
        p_nombre:         nomBuscar,
        p_identificacion: c?.numero_identificacion || null,
        p_pais:           null,
        p_limite:         50,
      }).then(({ data, error }) => {
        if (!error && data) {
          setListasResult(data)
          const nivel = calcNivelListas(data)
          setListasNivel(nivel)
          // Si hay coincidencia real, elevar calificación a ALTO automáticamente
          if (nivel === 'COINCIDENCIA') {
            setCalificacionManual('alto')
            setObservaciones('⚠️ Cliente figura en listas internacionales de sanciones. Requiere DDC reforzada — Art. 24 Acuerdo SUGEF 13-19.')
          }
        }
        setListasLoading(false)
      })
    }

    // Si el cliente tiene inscripción SUGEF pendiente → riesgo ALTO automático
    if (c?.sugef_estado === 'pendiente') {
      setCalificacionManual('alto')
      setObservaciones(prev =>
        (prev ? prev + ' | ' : '') +
        'ALERTA: Cliente con inscripcion SUGEF pendiente (Ley 7786). No se recomienda aceptar clientes en esta condicion hasta regularizar su situacion ante SUGEF.'
      )
    }
  }

  function setRespF(setFn, key, val) { setFn(prev => ({ ...prev, [key]: val })) }

  // Calcular scores en tiempo real
  const scoreCli = calcularScoreFactor(respCliente, CRITERIOS_CLIENTE[tipoPersona])
  const scoreGeo = calcularScoreFactor(respGeo, CRITERIOS_GEO[tipoPersona])
  const scoreProd = calcularScoreFactor(respProductos, CRITERIOS_PRODUCTOS[tipoPersona])
  const scoreCan = calcularScoreFactor(respCanales, CRITERIOS_CANALES[tipoPersona])
  const scoreTotal = calcularScoreTotal({ cliente: scoreCli, geo: scoreGeo, productos: scoreProd, canales: scoreCan }, tipoPersona)
  const calificacionAuto = clasificar(scoreTotal)
  const calificacionFinal = calificacionManual || calificacionAuto
  const alertaSugefPendiente = clienteActual?.sugef_estado === 'pendiente'

  async function guardar() {
    if (!clienteId) { alert('Seleccione un cliente.'); return }
    if (!calificacionAuto && !calificacionManual) { alert('Complete al menos los factores principales.'); return }
    setSaving(true)
    try {
      const hoy = new Date().toISOString().split('T')[0]

      // 1. Marcar anteriores como no vigentes
      await supabase.from('calificaciones_riesgo')
        .update({ vigente: false })
        .eq('cliente_id', clienteId)

      // 2. Insertar nueva calificación histórica
      const { error: errInsert } = await supabase.from('calificaciones_riesgo').insert({
        tenant_id:           tenantEfectivo?.id,
        cliente_id:          clienteId,
        tipo_persona:        tipoPersona,
        resp_cliente:        respCliente,
        resp_geo:            respGeo,
        resp_productos:      respProductos,
        resp_canales:        respCanales,
        score_cliente:       scoreCli,
        score_geo:           scoreGeo,
        score_productos:     scoreProd,
        score_canales:       scoreCan,
        score_total:         scoreTotal,
        calificacion:        calificacionAuto,
        calificacion_manual: calificacionManual || null,
        observaciones:       observaciones || null,
        calificador_id:      profile?.id,
        fecha_calificacion:  hoy,
        vigente:             true,
      })
      if (errInsert) throw new Error('Error al insertar calificación: ' + errInsert.message)

      // 3. Actualizar calificacion_riesgo en clientes (columna base — siempre existe)
      const { error: errBase, data: dataBase } = await supabase
        .from('clientes')
        .update({ calificacion_riesgo: calificacionFinal })
        .eq('id', clienteId)
        .select('id, calificacion_riesgo')

      if (errBase) {
        throw new Error('Error al actualizar cliente (calificacion_riesgo): ' + errBase.message)
      }

      // 4. Intentar también las columnas extendidas (si ya se ejecutó el SQL de migración)
      await supabase.from('clientes').update({
        nivel_riesgo_actual:       calificacionFinal,
        estado_calificacion:       'completado',
        fecha_ultima_calificacion: hoy,
        fecha_calificacion_riesgo: hoy,
      }).eq('id', clienteId)
      // Si falla (columnas no existen) lo ignoramos — la columna base ya quedó guardada

      alert(`✅ Calificación${calificacionFinal.toUpperCase()} guardada correctamente.`)
      loadClientes()
      loadStats()
    } catch (err) {
      console.error('guardar() error:', err)
      alert('Error al guardar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const nombreCliente = clienteActual
    ? (clienteActual.nombre_empresa || `${clienteActual.nombre_cliente || ''} ${clienteActual.primer_apellido || ''}`.trim())
    : ''

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calificación de Riesgo de Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">Metodología N06 — Basel AML Index 2023{isONG ? ' · Lista FT activa para ONG' : ''}</p>
        </div>
        <div className="flex gap-2">
          {['calificar', 'dashboard'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${tab === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'calificar' ? '📋 Calificar' : '📊 Dashboard'}
            </button>
          ))}
        </div>
      </div>

      {/* Panel de periodicidad — informes vencidos penalizan la calificación global */}
      {tenant?.id && (
        <PanelPeriodicidad
          tenantId={tenant.id}
          onPenalizacion={setPenalizacionInformes}
        />
      )}
      {penalizacionInformes > 0 && (
        <div className="px-4 py-3 bg-red-50 border border-red-300 rounded-xl text-sm text-red-800 space-y-1">
          <p className="font-bold">⚠️ Penalización por informes vencidos: -{penalizacionInformes} puntos sobre la calificación global de cumplimiento</p>
          <p className="text-xs text-red-600">El nivel de cumplimiento del sujeto obligado se ve afectado mientras existan informes SUGEF 13-19 sin generar. Vaya a <strong>Informes de Cumplimiento</strong> para regularizarlos.</p>
        </div>
      )}

      {/* ======= DASHBOARD ======= */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Total clientes', val: stats.total, color: 'gray' },
                { label: 'Sin calificar', val: stats.sinCalif, color: 'blue' },
                { label: 'Riesgo Bajo', val: stats.bajo, color: 'green' },
                { label: 'Riesgo Medio', val: stats.medio, color: 'yellow' },
                { label: 'Riesgo Alto', val: stats.alto, color: 'red' },
              ].map(s => (
                <div key={s.label} className={`card text-center border-t-4 ${
                  s.color === 'red' ? 'border-red-400' : s.color === 'yellow' ? 'border-yellow-400' :
                  s.color === 'green' ? 'border-green-400' : s.color === 'blue' ? 'border-brand-400' : 'border-gray-200'
                }`}>
                  <p className="text-3xl font-bold text-gray-900">{s.val}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sin calificar */}
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">⚠ Pendientes de calificar</h3>
              {sinCalificar.length === 0
                ? <p className="text-sm text-green-600">✓ Todos los clientes están calificados</p>
                : sinCalificar.map(c => (
                    <button key={c.id} onClick={() => { setTab('calificar'); handleSelectCliente(c.id) }}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 mb-2">
                      <span className="text-gray-400 text-sm font-mono">{c.numero_identificacion}</span>
                      <span className="text-sm text-gray-700 flex-1">{c.nombre_empresa || c.nombre_cliente}</span>
                      <span className="text-xs text-brand-600">Calificar →</span>
                    </button>
                  ))
              }
            </div>

            {/* Últimas calificaciones */}
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3">🕐 Últimas calificaciones</h3>
              {ultimasCalif.length === 0
                ? <p className="text-sm text-gray-400">Sin calificaciones registradas</p>
                : ultimasCalif.slice(0, 8).map(c => {
                    const nom = c.clientes?.nombre_empresa || c.clientes?.nombre_cliente || c.clientes?.numero_identificacion
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-400 w-20 flex-shrink-0">{new Date(c.fecha_calificacion).toLocaleDateString('es-CR')}</span>
                        <span className="text-sm text-gray-700 flex-1 truncate">{nom}</span>
                        <RiesgoBadge nivel={c.calificacion_manual || c.calificacion} score={c.score_total} />
                      </div>
                    )
                  })
              }
            </div>
          </div>

          {/* Leyenda metodología */}
          <div className="card bg-gray-50 text-sm text-gray-600 space-y-2">
            <p className="font-semibold text-gray-800">📌 Escala de calificación — N06 Metodología de Riesgo</p>
            <div className="flex gap-6">
              <span>🟢 <strong>Bajo:</strong> Score 0.00–1.00</span>
              <span>🟡 <strong>Medio:</strong> Score 1.01–2.00</span>
              <span>🔴 <strong>Alto:</strong> Score 2.01–3.00</span>
            </div>
            <p className="text-xs text-gray-400">Fuente: Basel AML Index 2023. Lista de países se actualiza anualmente. Para ONG se aplica además la lista GAFI de jurisdicciones bajo monitoreo (FT).</p>
          </div>
        </div>
      )}

      {/* ======= FORMULARIO DE CALIFICACIÓN ======= */}
      {tab === 'calificar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: selector + resumen */}
          <div className="space-y-4">
            {/* Selector sujeto obligado (superadmin) */}
            {isSuperAdmin && (
              <div className="card">
                <label className="label">Sujeto Obligado</label>
                <select className="input-field" value={tenantId} onChange={e => { setTenantId(e.target.value); setClienteId(''); setClienteActual(null) }}>
                  <option value="">— Seleccione —</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}

            {/* Selector cliente */}
            <div className="card">
              <label className="label">Cliente a calificar *</label>
              <select className="input-field" value={clienteId} onChange={e => handleSelectCliente(e.target.value)}>
                <option value="">— Seleccione cliente —</option>
                {clientes.map(c => {
                  const nom = c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim()
                  return <option key={c.id} value={c.id}>{nom} · {c.numero_identificacion}</option>
                })}
              </select>

              {clienteActual && (
                <div className="mt-3 space-y-3">
                  {/* Alerta SUGEF pendiente */}
                  {alertaSugefPendiente && (
                    <div className="p-3 bg-red-50 border-2 border-red-400 rounded-lg">
                      <p className="font-bold text-red-700 text-sm">CLIENTE NO RECOMENDADO — Inscripcion SUGEF Pendiente</p>
                      <p className="text-xs text-red-600 mt-1">Este cliente tiene inscripcion pendiente ante SUGEF (Ley 7786). No se recomienda aceptar clientes en esta condicion hasta que regularicen su situacion. La calificacion se establece automaticamente como ALTO.</p>
                    </div>
                  )}
                  {/* Info básica del cliente */}
                  <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
                    <p className="font-medium text-gray-900">{nombreCliente}</p>
                    <p className="text-gray-500 text-xs">{clienteActual.numero_identificacion}</p>
                    {clienteActual.calificacion_riesgo && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-500 text-xs">Calificación actual:</span>
                        <RiesgoBadge nivel={clienteActual.calificacion_riesgo} />
                      </div>
                    )}
                    {/* Tipo de persona */}
                    <div className="flex gap-2 mt-2">
                      {['fisica', 'juridica'].map(tp => (
                        <button key={tp}
                          onClick={() => setTipoPersona(tp)}
                          className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${tipoPersona === tp ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
                          {tp === 'fisica' ? '👤 Persona Física' : '🏢 Persona Jurídica'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Botón pre-llenado automático */}
                  <div className="border border-brand-200 rounded-xl p-3 bg-brand-50 space-y-2">
                    <p className="text-xs font-semibold text-brand-800">📋 Datos disponibles en base de datos:</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                      <span>{clienteActual.pais_ubicacion || clienteActual.nacionalidad ? '✅' : '⬜'} País / origen</span>
                      <span>{clienteActual.actividad_eco_nombre || clienteActual.profesion_nombre ? '✅' : '⬜'} Actividad / profesión</span>
                      <span>{clienteActual.ingreso_mensual_est ? '✅' : '⬜'} Ingreso estimado</span>
                      <span>{clienteActual.canton || clienteActual.provincia ? '✅' : '⬜'} Cantón / provincia</span>
                      <span>{clienteActual.pep ? '✅' : '⬜'} PEP</span>
                    </div>
                    <button
                      onClick={() => preLlenarDesdeDB(clienteActual)}
                      className="w-full mt-1 py-2 px-3 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                      📥 Pre-llenar formulario desde base de datos
                    </button>
                    <p className="text-xs text-brand-600 text-center">Puede ajustar los valores manualmente después</p>
                  </div>
                </div>
              )}

              {/* Panel listas ALA/CFT */}
              {clienteActual && (
                <div className="mt-3">
                  <ListasSancionesPanel
                    nivel={listasNivel}
                    resultado={listasResult}
                    loading={listasLoading}
                  />
                </div>
              )}
            </div>

            {/* Resumen de scores */}
            {clienteActual && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-900 text-sm">Resultado en tiempo real</h3>

                {[
                  { label: 'Factor Cliente', score: scoreCli, peso: tipoPersona === 'fisica' ? 60 : 50 },
                  { label: 'Zona Geográfica', score: scoreGeo, peso: tipoPersona === 'fisica' ? 40 : 15 },
                  { label: 'Productos', score: scoreProd, peso: tipoPersona === 'fisica' ? 0 : 20 },
                  { label: 'Canales de Distribución', score: scoreCan, peso: tipoPersona === 'fisica' ? 0 : 15 },
                ].map(f => (
                  <div key={f.label} className={f.peso === 0 ? 'opacity-40' : ''}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{f.label} ({f.peso}%)</span>
                      <span className="font-mono font-medium text-gray-700">{f.score != null ? f.score.toFixed(3) : '—'}</span>
                    </div>
                    <ScoreBar score={f.score} />
                  </div>
                ))}

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">Score Consolidado</span>
                    <span className="font-bold font-mono text-lg text-gray-900">{scoreTotal != null ? scoreTotal.toFixed(3) : '—'}</span>
                  </div>
                  <ScoreBar score={scoreTotal} />
                  {calificacionAuto && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Calificación automática:</span>
                      <RiesgoBadge nivel={calificacionAuto} />
                    </div>
                  )}
                </div>

                {/* Override manual */}
                <div className="border-t pt-3 space-y-2">
                  <label className="text-xs font-medium text-gray-600">Calificación manual (oficial de cumplimiento)</label>
                  <div className="flex gap-2">
                    {['bajo', 'medio', 'alto'].map(n => (
                      <button key={n}
                        onClick={() => setCalificacionManual(prev => prev === n ? '' : n)}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${calificacionManual === n
                          ? n === 'bajo' ? 'bg-green-500 text-white border-green-500'
                          : n === 'medio' ? 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-red-500 text-white border-red-500'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}>
                        {n.charAt(0).toUpperCase() + n.slice(1)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input-field text-sm h-20"
                    placeholder="Observaciones o justificación del oficial…"
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                  />
                  <button onClick={guardar} disabled={saving || !clienteId}
                    className="btn-primary w-full">
                    {saving ? 'Guardando…' : '💾 Guardar calificación'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={!clienteId || !calificacionFinal}
                    className="w-full text-sm py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                  >
                    🖨 Imprimir calificación
                  </button>
                </div>
              </div>
            )}

            {/* Historial */}
            {clienteActual && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">🕐 Historial — {nombreCliente}</h3>
                <HistorialCalificaciones clienteId={clienteId} />
              </div>
            )}
          </div>

          {/* Columna derecha: formularios de factores */}
          <div className="lg:col-span-2 space-y-4">
            {!clienteActual ? (
              <div className="card py-16 text-center text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium">Seleccione un cliente para iniciar la calificación</p>
                <p className="text-sm mt-1">La calificación se basa en la Metodología N06 del sujeto obligado</p>
              </div>
            ) : (
              <>
                {/* Factor Cliente */}
                <FactorForm
                  titulo={`Factor Cliente — ${tipoPersona === 'fisica' ? 'Persona Física' : 'Persona Jurídica'} (${tipoPersona === 'fisica' ? '60' : '50'}%)`}
                  criterios={CRITERIOS_CLIENTE[tipoPersona]}
                  respuestas={respCliente}
                  onChange={(k, v) => setRespF(setRespCliente, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />

                {/* Factor Zona Geográfica */}
                <FactorForm
                  titulo={`Factor Zona Geográfica (${tipoPersona === 'fisica' ? '40' : '15'}%)`}
                  criterios={CRITERIOS_GEO[tipoPersona]}
                  respuestas={respGeo}
                  onChange={(k, v) => setRespF(setRespGeo, k, v)}
                  tipo={tipoPersona}
                  esGeo={true}
                  esONG={isONG}
                />

                {/* Factor Productos */}
                <FactorForm
                  titulo={`Factor Productos / Servicios (${tipoPersona === 'fisica' ? '0' : '20'}%)`}
                  criterios={CRITERIOS_PRODUCTOS[tipoPersona]}
                  respuestas={respProductos}
                  onChange={(k, v) => setRespF(setRespProductos, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />

                {/* Factor Canales */}
                <FactorForm
                  titulo={`Factor Canales de Distribución (${tipoPersona === 'fisica' ? '0' : '15'}%)`}
                  criterios={CRITERIOS_CANALES[tipoPersona]}
                  respuestas={respCanales}
                  onChange={(k, v) => setRespF(setRespCanales, k, v)}
                  tipo={tipoPersona}
                  esONG={isONG}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Print CSS + reporte imprimible ──────────────────────────────── */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #reporte-cal {
            display: block !important;
            position: static !important;
            visibility: visible !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #reporte-cal * { visibility: visible !important; }
          @page { margin: 15mm; size: A4 portrait; }
        }
      `}</style>
      <ReporteImprimible
        clienteActual={clienteActual}
        nombreCliente={nombreCliente}
        tipoPersona={tipoPersona}
        calificacionFinal={calificacionFinal}
        calificacionAuto={calificacionAuto}
        calificacionManual={calificacionManual}
        scoreTotal={scoreTotal}
        scoreCli={scoreCli}
        scoreGeo={scoreGeo}
        scoreProd={scoreProd}
        scoreCan={scoreCan}
        observaciones={observaciones}
        listasNivel={listasNivel}
        respCliente={respCliente}
        respGeo={respGeo}
        respProductos={respProductos}
        respCanales={respCanales}
        fecha={new Date().toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      />
    </div>
  )
}
