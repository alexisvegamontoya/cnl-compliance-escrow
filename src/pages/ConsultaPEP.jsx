import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logAudit } from '../lib/auditLog'

// ── Configuración de fuentes ──────────────────────────────────────────────────
const FUENTES_CONFIG = {
  OFAC_SDN:   { label: 'OFAC SDN',                    flag: '🇺🇸', color: '#86111a', bg: '#fdf3f3' },
  OFAC_CONS:  { label: 'OFAC Consolidated',            flag: '🇺🇸', color: '#86111a', bg: '#fdf3f3' },
  ONU:        { label: 'ONU Consejo de Seguridad',     flag: '🇺🇳', color: '#293670', bg: '#eef2fc' },
  UK_OFSI:    { label: 'UK OFSI',                      flag: '🇬🇧', color: '#a87813', bg: '#fdf8ec' },
  INTERPOL:   { label: 'INTERPOL',                     flag: '🚨', color: '#c31b26', bg: '#fdf3f3' },
  GAFI_NEGRO: { label: 'GAFI Lista Negra',             flag: '⬛', color: '#14141a', bg: '#f7f7f9' },
  GAFI_GRIS:  { label: 'GAFI Lista Gris',              flag: '🔘', color: '#6b6b76', bg: '#f7f7f9' },
  GAFILAT:    { label: 'GAFILAT',                      flag: '🌎', color: '#63470d', bg: '#fdf8ec' },
  ICD_CR_PEP: { label: 'ICD CR — Lista PEP',           flag: '🇨🇷', color: '#15442c', bg: '#eff7f1' },
}

const TODAS_LAS_FUENTES = Object.keys(FUENTES_CONFIG)

function RiskBadge({ nivel }) {
  const cfg = {
    COINCIDENCIA:    { bg: 'bg-red-600',    text: 'text-white',      label: '🚨 COINCIDENCIA',     desc: 'Figura en lista de sanciones' },
    REVISAR:         { bg: 'bg-orange-500', text: 'text-white',      label: '⚠️ REVISAR',           desc: 'Similitud alta — verifique manualmente' },
    SIN_COINCIDENCIA:{ bg: 'bg-green-600',  text: 'text-white',      label: '✅ SIN COINCIDENCIA',  desc: 'No figura en ninguna lista consultada' },
  }
  const c = cfg[nivel] || cfg.SIN_COINCIDENCIA
  return (
    <div className={`inline-flex flex-col items-center px-5 py-2 rounded-xl ${c.bg} ${c.text}`}>
      <span className="text-base font-bold">{c.label}</span>
      <span className="text-xs opacity-80">{c.desc}</span>
    </div>
  )
}

// ── Cálculo del nivel de riesgo global ───────────────────────────────────────
function calcularNivelRiesgo(resultados) {
  if (!resultados?.length) return 'SIN_COINCIDENCIA'
  const max = Math.max(...resultados.map(r => r.similitud))
  if (max >= 0.85) return 'COINCIDENCIA'
  if (max >= 0.65) return 'REVISAR'
  return 'SIN_COINCIDENCIA'
}

// ── Componente Reporte Imprimible ─────────────────────────────────────────────
function Reporte({ consulta, resultados, allResultados, nivelRiesgo, metadata, onClose, pepDeclaracion }) {
  const { tenant, profile } = useAuth()

  const fuentesConsultadas = TODAS_LAS_FUENTES
  const fuentesConCoincidencia = [...new Set(resultados.map(r => r.fuente))]
  const fuentesSinCoincidencia = fuentesConsultadas.filter(f => !fuentesConCoincidencia.includes(f))

  // Datos para gráfico de barras por fuente (SVG simple)
  const conteoFuente = {}
  fuentesConsultadas.forEach(f => { conteoFuente[f] = resultados.filter(r => r.fuente === f).length })
  const maxConteo = Math.max(1, ...Object.values(conteoFuente))

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-auto" id="reporte-pep">
      {/* Barra de acciones (no imprime) */}
      <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center justify-between print:hidden">
        <p className="text-sm font-medium text-gray-700">Vista previa del reporte — Use Ctrl+P para imprimir/guardar como PDF</p>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
            🖨️ Imprimir / Guardar PDF
          </button>
          <button onClick={onClose}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300">
            ✕ Cerrar
          </button>
        </div>
      </div>

      {/* Reporte */}
      <div className="max-w-4xl mx-auto p-8 space-y-6 print:p-0 print:max-w-none">

        {/* Encabezado */}
        <div className="border-2 border-brand-900 rounded-xl overflow-hidden">
          <div className="bg-brand-900 text-white px-8 py-5 flex items-center gap-6">
            <img src="/logo-blanco.png" alt="CNL" className="h-16 w-auto" />
            <div className="flex-1">
              <p className="text-xl font-bold tracking-wide">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
              <p className="text-brand-300 text-sm mt-0.5">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
            </div>
            <div className="text-right text-sm text-brand-200">
              <p className="font-bold text-white text-base">REPORTE DE CONSULTA</p>
              <p>LISTAS INTERNACIONALES Y PEP</p>
            </div>
          </div>
          <div className="bg-brand-50 px-8 py-3 flex items-center justify-between text-xs text-brand-800">
            <span>📋 Documento válido como evidencia para expediente SUGEF — Acuerdo SUGEF 13-19, Art. 21-28</span>
            <span>🔐 Ref: CNL-PEP-{new Date().getFullYear()}-{Math.floor(Math.random()*90000)+10000}</span>
          </div>
        </div>

        {/* Datos de la consulta */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Datos de la Consulta</p>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Nombre:</span><span className="font-semibold text-gray-900">{consulta.nombre}</span></div>
              {consulta.identificacion && <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Identificación:</span><span className="font-semibold">{consulta.identificacion}</span></div>}
              {consulta.pais && <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">País:</span><span className="font-semibold">{consulta.pais}</span></div>}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Datos del Reporte</p>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Fecha y hora:</span><span className="font-semibold">{new Date().toLocaleString('es-CR')}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Consultó:</span><span className="font-semibold">{profile?.nombre || profile?.email}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Sujeto Obligado:</span><span className="font-semibold">{tenant?.nombre}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-28 flex-shrink-0">Listas consultadas:</span><span className="font-semibold">{fuentesConsultadas.length}</span></div>
            </div>
          </div>
        </div>

        {/* Resultado consolidado */}
        <div className={`rounded-xl p-6 text-center border-2 ${
          nivelRiesgo === 'COINCIDENCIA'    ? 'bg-red-50 border-red-400' :
          nivelRiesgo === 'REVISAR'         ? 'bg-orange-50 border-orange-400' :
                                              'bg-green-50 border-green-400'
        }`}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Resultado Consolidado</p>
          <div className="flex items-center justify-center gap-6">
            <div className={`text-5xl font-extrabold ${
              nivelRiesgo === 'COINCIDENCIA' ? 'text-red-700' :
              nivelRiesgo === 'REVISAR'      ? 'text-orange-700' : 'text-green-700'
            }`}>
              {nivelRiesgo === 'COINCIDENCIA' ? '🚨' : nivelRiesgo === 'REVISAR' ? '⚠️' : '✅'}
            </div>
            <div className="text-left">
              <p className={`text-3xl font-extrabold tracking-wider ${
                nivelRiesgo === 'COINCIDENCIA' ? 'text-red-700' :
                nivelRiesgo === 'REVISAR'      ? 'text-orange-700' : 'text-green-700'
              }`}>{nivelRiesgo.replace('_', ' ')}</p>
              <p className="text-gray-600 text-sm mt-1">
                {nivelRiesgo === 'COINCIDENCIA'    && `Se encontraron ${resultados.length} coincidencias en ${fuentesConCoincidencia.length} lista(s).`}
                {nivelRiesgo === 'REVISAR'         && `Se encontraron coincidencias parciales que requieren verificación manual.`}
                {nivelRiesgo === 'SIN_COINCIDENCIA' && `No se encontraron coincidencias en ninguna de las ${fuentesConsultadas.length} listas consultadas.`}
              </p>
            </div>
          </div>
        </div>

        {/* Gráfico por lista */}
        <div className="border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-bold text-gray-700 mb-4">📊 Resultados por Lista Internacional</p>
          <div className="space-y-2">
            {fuentesConsultadas.map(f => {
              const count = conteoFuente[f] || 0
              const cfg = FUENTES_CONFIG[f] || {}
              const pct = count > 0 ? Math.max(8, (count / maxConteo) * 100) : 0
              return (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-44 flex-shrink-0 truncate">
                    {cfg.flag} {cfg.label || f}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                      style={{
                        width: count > 0 ? `${pct}%` : '0%',
                        backgroundColor: count > 0 ? cfg.color || '#1a2348' : 'transparent',
                        minWidth: count > 0 ? '28px' : '0',
                      }}
                    >
                      {count > 0 && <span className="text-white text-xs font-bold">{count}</span>}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold w-20 text-right flex-shrink-0 ${count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {count > 0 ? `${count} coincid.` : 'Sin coincid.'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Listas sin coincidencia */}
        <div className="border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-bold text-gray-700 mb-3">✅ Listas sin coincidencias ({fuentesSinCoincidencia.length}/{fuentesConsultadas.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {fuentesSinCoincidencia.map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 rounded-lg px-3 py-1.5">
                <span className="text-green-600">✓</span>
                <span>{FUENTES_CONFIG[f]?.flag} {FUENTES_CONFIG[f]?.label || f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detalle de coincidencias */}
        {resultados.length > 0 && (
          <div className="border border-red-200 rounded-xl overflow-hidden">
            <div className="bg-red-600 text-white px-5 py-3">
              <p className="font-bold text-sm">🚨 Detalle de Coincidencias ({resultados.length})</p>
            </div>
            <div className="divide-y divide-gray-100">
              {resultados.map((r, i) => {
                const cfg = FUENTES_CONFIG[r.fuente] || {}
                const sim = Math.round((r.similitud || 0) * 100)
                return (
                  <div key={i} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cfg.color || '#1a2348' }}>
                          {cfg.flag} {cfg.label || r.fuente}
                        </span>
                        <p className="font-bold text-gray-900 text-sm mt-1.5">{r.nombre_completo}</p>
                        {r.aliases?.length > 0 && (
                          <p className="text-xs text-gray-500">Aliases: {r.aliases.slice(0, 3).join(' · ')}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">Similitud</p>
                        <p className={`text-2xl font-extrabold ${sim >= 85 ? 'text-red-600' : sim >= 65 ? 'text-orange-500' : 'text-yellow-600'}`}>{sim}%</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                      {r.tipo_entidad && <span>📋 Tipo: {r.tipo_entidad}</span>}
                      {r.fecha_nacimiento && <span>🎂 Nacimiento: {r.fecha_nacimiento}</span>}
                      {r.paises?.length > 0 && <span>🌍 Países: {r.paises.slice(0, 3).join(', ')}</span>}
                      {r.programa && <span>⚖️ Programa: {r.programa}</span>}
                      {r.nivel_riesgo && <span>🔴 Nivel: {r.nivel_riesgo.replace('_', ' ')}</span>}
                      {r.referencia_id && <span>🔗 Ref: {r.referencia_id}</span>}
                    </div>
                    {r.motivo && <p className="text-xs text-gray-500 italic border-l-2 border-red-200 pl-2">{r.motivo.substring(0, 200)}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Declaración PEP + resultado Lista UIF/ICD */}
        {(() => {
          const uifMatches = (allResultados || []).filter(r => r.fuente === 'ICD_CR_PEP' && r.similitud >= 0.50)
          const enListaUIF = uifMatches.length > 0
          const mejorMatch = uifMatches.sort((a, b) => b.similitud - a.similitud)[0]
          return (
            <div className="border border-amber-200 rounded-xl overflow-hidden">
              <div className="bg-amber-600 text-white px-5 py-3">
                <p className="font-bold text-sm">🏛️ Personas Expuestas Políticamente (PEP)</p>
              </div>
              <div className="divide-y divide-gray-100">
                {/* Resultado Lista UIF/ICD */}
                <div className="px-5 py-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Verificación en Lista Oficial UIF — ICD</p>
                  <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${enListaUIF ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${enListaUIF ? 'text-red-700' : 'text-green-700'}`}>
                        {enListaUIF ? '🚨 FIGURA EN LISTA PEP OFICIAL' : '✅ NO figura en Lista PEP oficial'}
                      </p>
                      {enListaUIF && mejorMatch && (
                        <div className="text-xs text-red-600 mt-1 space-y-0.5">
                          <p><strong>Nombre en lista:</strong> {mejorMatch.nombre_completo}</p>
                          {mejorMatch.programa && <p><strong>Cargo/Institución:</strong> {mejorMatch.programa}</p>}
                          <p><strong>Similitud:</strong> {(mejorMatch.similitud * 100).toFixed(0)}%</p>
                        </div>
                      )}
                    </div>
                    <span className={`ml-3 text-xs font-bold px-3 py-1 rounded-full ${enListaUIF ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {enListaUIF ? 'PEP DETECTADO' : 'Sin coincidencia'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Fuente: Unidad de Información Financiera (UIF) — Instituto Costarricense sobre Drogas (ICD).
                    Lista PEP Costa Rica, corte al 8 de abril de 2026. Ley 7786, Art. 2 inc. 29 — Acuerdo SUGEF 13-19, Art. 36-40.
                  </p>
                </div>

                {/* Declaración del cliente */}
                <div className="px-5 py-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Declaración del Cliente</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {[
                      { label: 'Funcionario público prominente', val: pepDeclaracion?.esPep },
                      { label: 'Familiar directo de PEP',        val: pepDeclaracion?.esFamiliarPep },
                      { label: 'Asociado cercano de PEP',        val: pepDeclaracion?.esAsociadoPep },
                    ].map(item => (
                      <div key={item.label} className="space-y-1">
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className={`font-bold ${item.val === true ? 'text-red-600' : item.val === false ? 'text-green-600' : 'text-gray-400'}`}>
                          {item.val === true ? '⚠ SÍ' : item.val === false ? '✓ NO' : '— No declarado'}
                        </p>
                      </div>
                    ))}
                  </div>
                  {pepDeclaracion?.cargoPep && (
                    <div className="text-sm">
                      <span className="text-gray-500">Cargo declarado: </span>
                      <span className="font-semibold text-gray-800">{pepDeclaracion.cargoPep}</span>
                      {pepDeclaracion.vigenciaCargo && <span className="text-gray-500"> ({pepDeclaracion.vigenciaCargo})</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Pie del reporte */}
        <div className="border-t-2 border-brand-900 pt-5 space-y-3">
          <div className="flex items-start justify-between text-xs text-gray-500">
            <div>
              <p className="font-semibold text-gray-700">CNL Craniley Compliance Services SRL</p>
              <p>Plataforma de Cumplimiento ALA/CFT — app.cnl-cr.com</p>
              <p>Reporte generado: {new Date().toLocaleString('es-CR')} por {profile?.nombre || profile?.email}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-700">Base Legal</p>
              <p>Ley 7786, Art. 15 bis — Debida Diligencia</p>
              <p>Acuerdo SUGEF 13-19, Art. 21-28 y 36-40</p>
            </div>
          </div>
          <div className="bg-brand-900 text-brand-300 text-xs rounded-lg px-4 py-2 text-center">
            Este reporte constituye evidencia de la verificación realizada conforme al Acuerdo SUGEF 13-19 y debe conservarse en el expediente del cliente por un mínimo de 5 años (Ley 7786, Art. 24).
          </div>
        </div>
      </div>

      {/* CSS de impresión */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { margin: 0; }
          #reporte-pep { position: static; overflow: visible; }
        }
      `}</style>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ConsultaPEP() {
  const { session, tenant, profile, isSuperAdmin } = useAuth()
  const [nombre, setNombre]             = useState('')
  const [identificacion, setIdentif]    = useState('')
  const [pais, setPais]                 = useState('')
  const [resultados, setResultados]     = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [showReporte, setShowReporte]   = useState(false)
  const [metadata, setMetadata]         = useState([])
  const [nivelRiesgo, setNivelRiesgo]   = useState(null)

  // ── Superadmin: selector de sujeto obligado ────────────────────────────────
  const [tenants, setTenants]         = useState([])
  const [tenantVista, setTenantVista] = useState(null)
  const tenantEfectivoId = isSuperAdmin ? (tenantVista?.id || null) : tenant?.id

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // ── Selector de cliente desde BD ─────────────────────────────────────────────
  const [clientesDB, setClientesDB]         = useState([])
  const [clienteSelId, setClienteSelId]     = useState('')
  const [savedToDb, setSavedToDb]           = useState(false)
  const [personasRelacionadas, setPersonasRelacionadas] = useState([])
  const [personaSelIdx, setPersonaSelIdx]   = useState(null)

  useEffect(() => {
    if (!tenantEfectivoId) { setClientesDB([]); return }
    supabase.from('clientes')
      .select('id, nombre_cliente, primer_apellido, nombre_empresa, numero_identificacion, cedula_juridica, pais_ubicacion, pais_nacimiento, tipo_identificacion')
      .eq('tenant_id', tenantEfectivoId).eq('activo', true)
      .order('nombre_cliente', { nullsFirst: false })
      .then(({ data }) => setClientesDB(data || []))
  }, [tenantEfectivoId])

  const seleccionarClienteDB = async (id) => {
    setClienteSelId(id)
    setSavedToDb(false)
    setPersonasRelacionadas([])
    setPersonaSelIdx(null)
    const c = clientesDB.find(x => x.id === id)
    if (!c) { setNombre(''); setIdentif(''); setPais(''); return }
    const tipoId = Number(c.tipo_identificacion)
    const esFisica = [1, 3, 4, 5].includes(tipoId)
    const nombreCompleto = esFisica
      ? [c.nombre_cliente, c.primer_apellido].filter(Boolean).join(' ')
      : (c.nombre_empresa || '')
    const cedula = esFisica ? (c.numero_identificacion || '') : (c.cedula_juridica || c.numero_identificacion || '')
    const paisCliente = c.pais_ubicacion || c.pais_nacimiento || ''
    setNombre(nombreCompleto)
    setIdentif(cedula)
    setPais(paisCliente === 'Costa Rica' ? '' : paisCliente)
    // Personas jurídicas: cargar socios, junta directiva, representantes
    if (!esFisica) {
      const { data: personas } = await supabase
        .from('clientes_personas_relacionadas')
        .select('*')
        .eq('cliente_id', id)
        .eq('activo', true)
        .order('orden')
      setPersonasRelacionadas(personas || [])
    }
  }

  const consultarPersonaRelacionada = (idx) => {
    const p = personasRelacionadas[idx]
    if (!p) return
    setPersonaSelIdx(idx)
    setNombre(p.nombre || '')
    setIdentif(p.identificacion || '')
    setPais('')
    setResultados(null)
  }

  const buscar = async (e) => {
    e?.preventDefault()
    if (!nombre.trim()) { setError('Ingrese al menos el nombre a consultar.'); return }
    setError('')
    setLoading(true)
    setResultados(null)
    setSavedToDb(false)

    const { data, error: err } = await supabase.rpc('buscar_en_listas', {
      p_nombre:         nombre.trim(),
      p_identificacion: identificacion.trim() || null,
      p_pais:           pais.trim() || null,
      p_limite:         100,
    })

    setLoading(false)
    if (err) { setError(err.message); return }

    const res = data || []
    const nivel = calcularNivelRiesgo(res)
    setResultados(res)
    setNivelRiesgo(nivel)

    // Guardar en historial de consultas
    await supabase.from('consultas_listas').insert({
      tenant_id:            tenantEfectivoId || tenant?.id,
      user_id:              session?.user?.id,
      user_email:           session?.user?.email,
      nombre_buscado:       nombre.trim(),
      identificacion:       identificacion.trim() || null,
      pais:                 pais.trim() || null,
      listas_consultadas:   TODAS_LAS_FUENTES,
      total_coincidencias:  res.length,
      nivel_riesgo_global:  nivel,
      resultados:           JSON.stringify(res),
    })

    await logAudit({
      accion: 'consultar',
      tabla: 'listas_sanciones',
      descripcion: `Consulta PEP: "${nombre}" — ${nivel} (${res.length} resultados)`,
    })

    // Auto-guardar resultado en clientes si hay cliente seleccionado
    if (clienteSelId) {
      const coincidencias = res.filter(r => (r.similitud || 0) >= 0.65)
      const hayAlerta     = coincidencias.some(r => (r.similitud || 0) >= 0.85)
      const hayPEP        = coincidencias.some(r => r.fuente === 'ICD_CR_PEP' || r.tipo_lista === 'pep')
      await supabase.from('clientes').update({
        estado_listas:         hayAlerta ? 'alerta' : coincidencias.length > 0 ? 'revisar' : 'verificado',
        aparece_en_listas:     hayAlerta,
        pep:                   hayPEP,
        fecha_consulta_listas: new Date().toISOString().substring(0, 10),
      }).eq('id', clienteSelId)
      setSavedToDb(true)
    }
  }

  const coincidencias = resultados?.filter(r => r.similitud >= 0.65) || []
  const revisiones    = resultados?.filter(r => r.similitud >= 0.40 && r.similitud < 0.65) || []

  // ── Estado sección PEP ────────────────────────────────────────────────────────
  const [pepDeclaracion, setPepDeclaracion] = useState({
    esPep:           null,   // true / false
    esFamiliarPep:   null,
    esAsociadoPep:   null,
    cargoPep:        '',
    vigenciaCargo:   '',
  })

  // ── Estado CCSS y SUGEF ───────────────────────────────────────────────────────
  const [ccssAlDia, setCcssAlDia]           = useState(null)  // null / 'al_dia' / 'morosidad' / 'arreglo' / 'no_inscrito'
  const [sujetoObligado, setSujetoObligado] = useState(null)  // null / 'no' / '15' / '15bis' / '15ter' / 'pendiente'

  // Auto-guardar estado SUGEF y CCSS en cliente seleccionado
  useEffect(() => {
    if (clienteSelId && sujetoObligado) {
      supabase.from('clientes').update({ sugef_estado: sujetoObligado }).eq('id', clienteSelId)
    }
  }, [sujetoObligado, clienteSelId])

  useEffect(() => {
    if (clienteSelId && ccssAlDia) {
      supabase.from('clientes').update({ ccss_estado: ccssAlDia }).eq('id', clienteSelId)
    }
  }, [ccssAlDia, clienteSelId])

  return (
    <div className="p-6 max-w-5xl space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Consulta PEP / Listas Internacionales</h1>
          <p className="text-gray-500 text-sm mt-1">
            Búsqueda simultánea en {TODAS_LAS_FUENTES.length} listas: OFAC · ONU · UK · INTERPOL · GAFI/GAFILAT · ICD Costa Rica PEP
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isSuperAdmin && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span className="text-amber-600 text-sm font-semibold whitespace-nowrap">🏢 Sujeto obligado:</span>
              <select
                className="input-field text-sm"
                value={tenantVista?.id || ''}
                onChange={e => {
                  const t = tenants.find(t => t.id === e.target.value) || null
                  setTenantVista(t)
                  setClienteSelId('')
                  setSavedToDb(false)
                }}
              >
                <option value="">— Seleccione —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
          )}
          {resultados !== null && nivelRiesgo && (
            <button onClick={() => setShowReporte(true)}
              className="btn-primary flex items-center gap-2">
              📄 Generar Reporte
            </button>
          )}
        </div>
      </div>

      {/* Selector de cliente desde BD */}
      {clientesDB.length > 0 && (
        <div className="card border-l-4 border-brand-400 space-y-2">
          <p className="text-sm font-semibold text-gray-700">🗄️ Pre-llenar desde base de datos de clientes</p>
          <div className="flex gap-3 items-center">
            <select className="input-field flex-1"
              value={clienteSelId}
              onChange={e => seleccionarClienteDB(e.target.value)}>
              <option value="">— Seleccione cliente —</option>
              {clientesDB.map(c => {
                const nom = c.nombre_empresa || [c.nombre_cliente, c.primer_apellido].filter(Boolean).join(' ')
                return <option key={c.id} value={c.id}>{nom} · {c.numero_identificacion || c.cedula_juridica}</option>
              })}
            </select>
            {clienteSelId && <span className="text-xs text-brand-600 font-medium whitespace-nowrap">✅ Datos cargados</span>}
          </div>
          {savedToDb && (
            <p className="text-xs text-green-600 font-medium">✅ Resultado guardado en ficha del cliente (PEP, listas, estado, fecha)</p>
          )}
        </div>
      )}

      {/* Panel personas relacionadas — solo para personas jurídicas */}
      {personasRelacionadas.length > 0 && (
        <div className="card border-l-4 border-amber-400 bg-amber-50 space-y-3">
          <div>
            <p className="text-sm font-bold text-amber-800">🏢 Persona Jurídica — Personas Vinculadas ({personasRelacionadas.length})</p>
            <p className="text-xs text-amber-700">SUGEF 11-18 requiere consultar en listas a todos los socios, representantes y miembros de junta directiva. Seleccione cada persona para consultarla.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {personasRelacionadas.map((p, idx) => {
              const etiquetaTipo = { socio: 'Socio/Accionista', representante_legal: 'Representante Legal', junta_directiva: 'Junta Directiva', apoderado: 'Apoderado', beneficiario_final: 'Beneficiario Final', otro: 'Otro' }
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => consultarPersonaRelacionada(idx)}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-all ${personaSelIdx === idx ? 'border-amber-500 bg-amber-100 ring-1 ring-amber-400' : 'border-amber-200 bg-white hover:border-amber-400'}`}
                >
                  <span className="text-lg mt-0.5">👤</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-500">{etiquetaTipo[p.tipo_relacion] || p.tipo_relacion}</p>
                    {p.identificacion && <p className="text-xs text-gray-400">{p.identificacion}</p>}
                    {p.porcentaje_participacion && <p className="text-xs text-amber-600">Participación: {p.porcentaje_participacion}%</p>}
                  </div>
                  <span className="ml-auto text-xs text-amber-600 font-medium shrink-0">Consultar →</span>
                </button>
              )
            })}
          </div>
          {personaSelIdx !== null && (
            <p className="text-xs text-amber-800 font-medium bg-amber-100 rounded-lg px-3 py-2">
              ✍️ Consultando a: <strong>{personasRelacionadas[personaSelIdx]?.nombre}</strong> ({({ socio: 'Socio', representante_legal: 'Rep. Legal', junta_directiva: 'Junta Directiva', apoderado: 'Apoderado', beneficiario_final: 'Benef. Final' })[personasRelacionadas[personaSelIdx]?.tipo_relacion] || personasRelacionadas[personaSelIdx]?.tipo_relacion}) — El formulario ya tiene los datos precargados. Presione "Consultar en listas".
            </p>
          )}
        </div>
      )}

      {/* Formulario de búsqueda */}
      <form onSubmit={buscar} className="card space-y-4">
        <p className="text-sm font-semibold text-gray-700">Datos de la consulta</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="label">Nombre completo *</label>
            <input type="text" className="input" required
              placeholder="Nombre y apellidos..."
              value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="label">Cédula / Pasaporte</label>
            <input type="text" className="input"
              placeholder="Número de identificación"
              value={identificacion} onChange={e => setIdentif(e.target.value)} />
          </div>
          <div>
            <label className="label">País (opcional)</label>
            <input type="text" className="input"
              placeholder="Ej: Venezuela, Iran..."
              value={pais} onChange={e => setPais(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">⚠ {error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-60">
            {loading ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Consultando {TODAS_LAS_FUENTES.length} listas…</>
            ) : (
              <>🔍 Consultar listas</>
            )}
          </button>
        </div>
      </form>

      {/* ── Sección PEP — Declaración del Cliente ── */}
      <div className="card border-l-4 border-amber-400 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏛️</span>
          <div>
            <p className="font-semibold text-gray-900">Verificación PEP — Declaración del Cliente</p>
            <p className="text-xs text-gray-500">Acuerdo SUGEF 13-19, Art. 36-40 — Personas Expuestas Políticamente</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* ¿Es PEP? */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">¿Es o fue funcionario público prominente?</p>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button key={String(v)} type="button"
                  onClick={() => setPepDeclaracion(p => ({ ...p, esPep: v }))}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                    pepDeclaracion.esPep === v
                      ? v ? 'bg-red-600 text-white border-red-600' : 'bg-green-600 text-white border-green-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {v ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* ¿Familiar de PEP? */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">¿Es familiar directo de un PEP?</p>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button key={String(v)} type="button"
                  onClick={() => setPepDeclaracion(p => ({ ...p, esFamiliarPep: v }))}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                    pepDeclaracion.esFamiliarPep === v
                      ? v ? 'bg-red-600 text-white border-red-600' : 'bg-green-600 text-white border-green-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {v ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>

          {/* ¿Asociado de PEP? */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">¿Es asociado cercano de un PEP?</p>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button key={String(v)} type="button"
                  onClick={() => setPepDeclaracion(p => ({ ...p, esAsociadoPep: v }))}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                    pepDeclaracion.esAsociadoPep === v
                      ? v ? 'bg-red-600 text-white border-red-600' : 'bg-green-600 text-white border-green-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {v ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Si es PEP → campos adicionales */}
        {(pepDeclaracion.esPep || pepDeclaracion.esFamiliarPep || pepDeclaracion.esAsociadoPep) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-red-800">⚠️ Cliente identificado como PEP — Se requiere DDC Ampliada (Art. 23-24 y 38)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Cargo o función pública</label>
                <input type="text" className="input text-sm"
                  placeholder="Ej: Diputado, Ministro, Alcalde..."
                  value={pepDeclaracion.cargoPep}
                  onChange={e => setPepDeclaracion(p => ({ ...p, cargoPep: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Período en el cargo</label>
                <input type="text" className="input text-sm"
                  placeholder="Ej: 2018-2022"
                  value={pepDeclaracion.vigenciaCargo}
                  onChange={e => setPepDeclaracion(p => ({ ...p, vigenciaCargo: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-red-700">Recuerde: la condición de PEP se mantiene por al menos 2 años después de dejar el cargo (Art. 37). Debe obtener aprobación de la alta gerencia para establecer o continuar la relación comercial.</p>
          </div>
        )}

        {/* Todos en No → limpio */}
        {pepDeclaracion.esPep === false && pepDeclaracion.esFamiliarPep === false && pepDeclaracion.esAsociadoPep === false && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-green-600 text-lg">✅</span>
            <p className="text-sm text-green-800 font-medium">Cliente no identificado como PEP — aplica DDC estándar según nivel de riesgo</p>
          </div>
        )}
      </div>


      {/* ── CCSS y SUGEF ── */}
      <div className="card border-l-4 border-dorado-400 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🇨🇷</span>
          <div>
            <p className="font-semibold text-gray-900">Verificaciones Adicionales — Costa Rica</p>
            <p className="text-xs text-gray-500">CCSS mora patronal · Sujeto obligado Ley 7786 Art. 15/15 bis/15 ter</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* ── CCSS ── */}
          <div className="space-y-2 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">🏥 Estado CCSS</p>
                <p className="text-xs text-gray-500">Verificar morosidad patronal / obrero-patronal</p>
              </div>
              <a
                href={`https://enlinea.ccss.sa.cr/verificacion/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-dorado-600 text-white px-3 py-1.5 rounded-lg hover:bg-dorado-700 transition-colors flex items-center gap-1"
              >
                🔗 Consultar CCSS
              </a>
            </div>
            <p className="text-xs text-gray-400">Ingrese la cédula en la plataforma CCSS y registre el resultado:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'al_dia',      label: 'Al dia',              cls: 'bg-green-600 text-white border-green-600' },
                { v: 'morosidad',   label: 'Con morosidad',       cls: 'bg-red-600 text-white border-red-600' },
                { v: 'arreglo',     label: 'Con arreglo de pago', cls: 'bg-yellow-500 text-white border-yellow-500' },
                { v: 'no_inscrito', label: 'No inscrito',         cls: 'bg-gray-500 text-white border-gray-500' },
              ].map(opt => (
                <button key={opt.v} type="button"
                  onClick={() => setCcssAlDia(opt.v)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    ccssAlDia === opt.v ? opt.cls : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {ccssAlDia === 'morosidad' && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                El cliente presenta morosidad con la CCSS. Considere esto como factor de riesgo adicional.
              </div>
            )}
            {ccssAlDia === 'arreglo' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                El cliente tiene un arreglo de pago vigente con la CCSS. Monitorear cumplimiento del arreglo.
              </div>
            )}
            {ccssAlDia === 'no_inscrito' && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">
                El cliente no figura inscrito en la CCSS. Verifique si aplica obligacion patronal.
              </div>
            )}
            {ccssAlDia === 'al_dia' && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                Verificado al dia con la CCSS — sin senales de alerta por este criterio.
              </div>
            )}
          </div>

          {/* ── SUGEF Sujeto Obligado ── */}
          <div className="space-y-2 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">🏛️ Sujeto Obligado Ley 7786</p>
                <p className="text-xs text-gray-500">Art. 15, 15 bis o 15 ter — Obligados SUGEF</p>
              </div>
              <a
                href="https://www.sugef.fi.cr/sujetos%20inscritos%20ley%207786%20-%20(%20apnfds)/Consulta_Estado_Inscripcion_%20APNFDs.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 transition-colors flex items-center gap-1"
              >
                🔗 Consultar SUGEF
              </a>
            </div>
            <p className="text-xs text-gray-400">Verifique en el portal SUGEF si la persona/empresa es sujeto obligado:</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {[
                { v: 'no',        label: 'No es sujeto obligado',  cls: 'border-green-500 bg-green-50 text-green-700' },
                { v: '15',        label: 'Art. 15',                cls: 'border-orange-500 bg-orange-50 text-orange-700' },
                { v: '15bis',     label: 'Art. 15 bis',            cls: 'border-orange-500 bg-orange-50 text-orange-700' },
                { v: '15ter',     label: 'Art. 15 ter',            cls: 'border-orange-500 bg-orange-50 text-orange-700' },
                { v: 'pendiente', label: 'Pendiente de inscripcion', cls: 'border-yellow-500 bg-yellow-50 text-yellow-700' },
              ].map(opt => (
                <button key={opt.v} type="button"
                  onClick={() => setSujetoObligado(opt.v)}
                  className={`py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    sujetoObligado === opt.v ? opt.cls : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {sujetoObligado && !['no', 'pendiente'].includes(sujetoObligado) && (
              <div className="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-xs text-orange-800 space-y-1">
                <p className="font-bold">Esta persona/entidad es sujeto obligado ({sujetoObligado === '15' ? 'Art. 15' : sujetoObligado === '15bis' ? 'Art. 15 bis' : 'Art. 15 ter'} — Ley 7786)</p>
                <p>Debe verificar que cuente con un Programa de Cumplimiento ALA/CFT vigente segun el Acuerdo SUGEF 13-19. Se recomienda solicitar evidencia de inscripcion y cumplimiento ante SUGEF.</p>
              </div>
            )}
            {sujetoObligado === 'pendiente' && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2 text-xs text-yellow-800 space-y-1">
                <p className="font-bold">Inscripcion pendiente ante SUGEF (Ley 7786)</p>
                <p>La entidad aun no ha completado su inscripcion como sujeto obligado. Verifique el avance del proceso y solicite evidencia de la gestion ante SUGEF. Considere este pendiente como factor de riesgo adicional.</p>
              </div>
            )}
            {sujetoObligado === 'no' && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                No figura como sujeto obligado — sin senales de alerta por este criterio.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indicadores de fuentes consultadas */}
      <div className="grid grid-cols-4 gap-2">
        {TODAS_LAS_FUENTES.map(f => {
          const cfg = FUENTES_CONFIG[f] || {}
          // Solo contar resultados con similitud ≥ 0.65 (coincidencias reales)
          const count = resultados?.filter(r => r.fuente === f && r.similitud >= 0.65).length || 0
          return (
            <div key={f} className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
              resultados === null ? 'border-gray-200 bg-white' :
              count > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'
            }`}>
              <p className="text-base">{cfg.flag}</p>
              <p className="text-xs font-semibold text-gray-700 leading-tight mt-0.5">{cfg.label || f}</p>
              {resultados !== null && (
                <p className={`text-sm font-bold mt-0.5 ${count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {count > 0 ? `${count} coincid.` : '✓ Limpio'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Resultado */}
      {resultados !== null && (
        <div className="space-y-4">

          {/* Veredicto */}
          <div className={`card flex items-center justify-between ${
            nivelRiesgo === 'COINCIDENCIA'    ? 'border-red-300 bg-red-50' :
            nivelRiesgo === 'REVISAR'         ? 'border-orange-300 bg-orange-50' :
                                                'border-green-300 bg-green-50'
          }`}>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Resultado consolidado para</p>
              <p className="font-bold text-gray-900 text-lg">"{nombre}"</p>
            </div>
            <RiskBadge nivel={nivelRiesgo} />
          </div>

          {/* Coincidencias */}
          {coincidencias.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-red-700">🚨 Coincidencias encontradas ({coincidencias.length})</p>
              {coincidencias.map((r, i) => {
                const cfg = FUENTES_CONFIG[r.fuente] || {}
                const sim = Math.round(r.similitud * 100)
                return (
                  <div key={i} className="card border-l-4 border-red-500 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cfg.color || '#1a2348' }}>
                            {cfg.flag} {cfg.label || r.fuente}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{r.tipo_lista?.replace('_', ' ')}</span>
                        </div>
                        <p className="font-bold text-gray-900 mt-1">{r.nombre_completo}</p>
                        {r.aliases?.length > 0 && (
                          <p className="text-xs text-gray-500">Aliases: {r.aliases.slice(0, 3).join(' · ')}</p>
                        )}
                        <div className="flex gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                          {r.tipo_entidad && <span>Tipo: {r.tipo_entidad}</span>}
                          {r.fecha_nacimiento && <span>Nac.: {r.fecha_nacimiento}</span>}
                          {r.paises?.length > 0 && <span>Países: {r.paises.slice(0, 3).join(', ')}</span>}
                          {r.programa && <span>Programa: {r.programa}</span>}
                        </div>
                        {r.motivo && <p className="text-xs text-gray-600 mt-1 italic">{r.motivo.substring(0, 200)}</p>}
                      </div>
                      <div className="text-center flex-shrink-0">
                        <p className={`text-3xl font-extrabold ${sim >= 85 ? 'text-red-600' : 'text-orange-500'}`}>{sim}%</p>
                        <p className="text-xs text-gray-400">similitud</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sin coincidencias */}
          {coincidencias.length === 0 && (
            <div className="card text-center py-8 bg-green-50 border-green-200">
              <p className="text-4xl mb-2">✅</p>
              <p className="font-semibold text-green-800">Sin coincidencias en ninguna lista</p>
              <p className="text-sm text-green-600 mt-1">
                Se consultaron {TODAS_LAS_FUENTES.length} listas internacionales sin resultados para "{nombre}"
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowReporte(true)}
              className="btn-primary flex items-center gap-2">
              📄 Generar Reporte para Expediente
            </button>
          </div>
        </div>
      )}

      {/* Modal reporte */}
      {showReporte && resultados !== null && (
        <Reporte
          consulta={{ nombre, identificacion, pais }}
          resultados={coincidencias}
          allResultados={resultados}
          nivelRiesgo={nivelRiesgo}
          metadata={metadata}
          onClose={() => setShowReporte(false)}
          pepDeclaracion={pepDeclaracion}
        />
      )}
    </div>
  )
}
