import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { generarXMLSICVECA, descargarXML } from '../../lib/xmlGenerator'
import { TIPO_CARGA } from '../../lib/catalogos'
import ErrorBanner from '../ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'

// Selector de tenant con búsqueda
function TenantSearch({ tenants, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)
  const selected = tenants.find(t => t.id === value)
  const filtered = tenants.filter(t => t.nombre.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative flex-1">
      <button type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="input-field text-sm w-full text-left flex items-center justify-between gap-2">
        <span className="truncate">{selected ? selected.nombre : '— Seleccione el sujeto obligado —'}</span>
        <span className="text-gray-400 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus className="input-field text-sm py-1.5" placeholder="Escriba para buscar…"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-400 italic">Sin resultados</li>}
            {filtered.map(t => (
              <li key={t.id} onClick={() => { onChange(t.id); setOpen(false) }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-brand-50 hover:text-brand-700 ${t.id === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}>
                {t.nombre}
                {(!t.clase_dato || !t.archivo) && <span className="ml-2 text-xs text-amber-500">⚠ config. incompleta</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function XMLGenerator() {
  const { tenant, isSuperAdmin } = useAuth()
  const [tenants, setTenants]       = useState([])
  const [tenantVistaId, setTenantVistaId] = useState('')
  const [tenantActivo, setTenantActivo]   = useState(null)

  const [periodo, setPeriodo]       = useState(new Date().toISOString().substring(0, 7))
  const [tipoCarga, setTipoCarga]   = useState(1)
  const [tipoMoneda, setTipoMoneda] = useState(2)
  const [loading, setLoading]       = useState(false)
  const [preview, setPreview]       = useState('')
  const [stats, setStats]           = useState(null)
  const [error, setError]           = useState(null)
  const [marcado, setMarcado]       = useState(false)

  // Cargar lista de tenants para superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('*').order('nombre').then(({ data }) => setTenants(data || []))
    } else {
      setTenantActivo(tenant)
      setTipoMoneda(tenant?.tipo_moneda_default || 2)
    }
  }, [isSuperAdmin, tenant])

  // Cuando superadmin cambia el tenant seleccionado
  useEffect(() => {
    if (!isSuperAdmin || !tenantVistaId) { setTenantActivo(null); return }
    const t = tenants.find(t => t.id === tenantVistaId)
    setTenantActivo(t || null)
    if (t) setTipoMoneda(t.tipo_moneda_default || 2)
    setStats(null)
    setPreview('')
    setMarcado(false)
  }, [tenantVistaId, tenants, isSuperAdmin])

  async function generarXML() {
    if (!tenantActivo) {
      setError({ tipo: 'operativo', mensaje: 'Seleccione el sujeto obligado antes de generar el XML.' })
      return
    }
    if (!tenantActivo.clase_dato || !tenantActivo.archivo || !tenantActivo.cedula_juridica) {
      setError({ tipo: 'operativo', mensaje: `Faltan campos de configuración SICVECA para ${tenantActivo.nombre}: clase_dato, archivo y cedula_juridica deben estar configurados en Sujetos Obligados.` })
      return
    }
    setError(null)
    setLoading(true)
    try {
      const desde = periodo + '-01'
      const [yr, mo] = periodo.split('-').map(Number)
      const ultimoDia = new Date(yr, mo, 0).getDate()  // día 0 del mes siguiente = último día del mes actual
      const hasta = `${periodo}-${String(ultimoDia).padStart(2, '0')}`
      const { data: txs, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .eq('tenant_id', tenantActivo.id)
        .gte('periodo', desde)
        .lte('periodo', hasta)
        .order('created_at')

      if (txErr) throw txErr
      if (!txs || txs.length === 0) {
        setError({ tipo: 'operativo', mensaje: `No hay transacciones registradas para ${tenantActivo.nombre} en el período ${periodo}.` })
        setLoading(false)
        return
      }

      const xml = generarXMLSICVECA({
        clase_dato: tenantActivo.clase_dato,
        archivo: tenantActivo.archivo,
        cedula_juridica: tenantActivo.cedula_juridica,
        tipo_carga: tipoCarga,
        tipo_moneda: tipoMoneda,
        periodo: desde,
      }, txs)

      const nombreArchivo = `${tenantActivo.actividad_apnfd?.replace(/\s+/g, '_')}_${periodo}`
      setPreview(xml)
      setStats({ registros: txs.length, nombreArchivo, xml })
    } catch (err) {
      setError(clasificarError(err))
    } finally {
      setLoading(false)
    }
  }

  function descargar() {
    if (!stats) return
    descargarXML(stats.xml, stats.nombreArchivo)
  }

  async function marcarEnviado() {
    if (!tenantActivo || !stats) return
    const desde = periodo + '-01'
    const [yr2, mo2] = periodo.split('-').map(Number)
    const hasta = `${periodo}-${String(new Date(yr2, mo2, 0).getDate()).padStart(2, '0')}`
    const { error: err } = await supabase
      .from('transacciones')
      .update({ enviado_sugef: true, fecha_envio_sugef: new Date().toISOString() })
      .eq('tenant_id', tenantActivo.id)
      .gte('periodo', desde)
      .lte('periodo', hasta)
    if (err) { setError(clasificarError(err)); return }
    setMarcado(true)
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Generador XML SICVECA</h3>

        {/* Selector superadmin */}
        {isSuperAdmin && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
            <span className="text-amber-700 text-sm font-medium flex-shrink-0">🏢 Sujeto obligado:</span>
            <TenantSearch
              tenants={tenants}
              value={tenantVistaId}
              onChange={setTenantVistaId}
            />
          </div>
        )}

        {/* Alerta si falta configuración SICVECA */}
        {tenantActivo && (!tenantActivo.clase_dato || !tenantActivo.archivo || !tenantActivo.cedula_juridica) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ⚠ <strong>Configuración incompleta:</strong> Este sujeto obligado no tiene configurados los campos requeridos para SICVECA
            (<code>clase_dato</code>{!tenantActivo.clase_dato ? ' ✗' : ' ✓'},
            <code>archivo</code>{!tenantActivo.archivo ? ' ✗' : ' ✓'},
            <code>cedula_juridica</code>{!tenantActivo.cedula_juridica ? ' ✗' : ' ✓'}).
            Configure estos campos en <strong>Sujetos Obligados</strong> antes de generar el XML.
          </div>
        )}

        <p className="text-sm text-gray-500 mb-6">
          Genera el archivo XML en formato APNFD para cargarlo en la plataforma SICVECA de SUGEF.
          {tenantActivo && (
            <span className="block mt-1 font-medium text-gray-700">
              ✓ {tenantActivo.nombre} — Actividad: {tenantActivo.actividad_apnfd} — ClaseDato: {tenantActivo.clase_dato} — Archivo: {tenantActivo.archivo}
            </span>
          )}
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="label">Período *</label>
            <input type="month" className="input-field"
              value={periodo}
              onChange={e => { setPeriodo(e.target.value); setStats(null); setMarcado(false) }} />
          </div>
          <div>
            <label className="label">Tipo de carga *</label>
            <select className="input-field" value={tipoCarga}
              onChange={e => setTipoCarga(Number(e.target.value))}>
              {TIPO_CARGA.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Moneda del reporte *</label>
            <select className="input-field" value={tipoMoneda}
              onChange={e => setTipoMoneda(Number(e.target.value))}>
              <option value={1}>1 — Colones (CRC)</option>
              <option value={2}>2 — Dólares (USD)</option>
            </select>
          </div>
        </div>

        <ErrorBanner error={error} onClose={() => setError(null)} />

        <button className="btn-primary" onClick={generarXML} disabled={loading || !tenantActivo}>
          {loading ? 'Generando…' : '⚙️ Generar XML'}
        </button>
      </div>

      {stats && (
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-green-700">✅ XML generado correctamente</h3>
              <p className="text-sm text-gray-600 mt-1">
                {stats.registros} registro{stats.registros !== 1 ? 's' : ''} — Archivo: <code className="bg-gray-100 px-1 rounded">{stats.nombreArchivo}.xml</code>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={descargar} className="btn-primary text-sm">
                ⬇ Descargar XML
              </button>
              {marcado ? (
                <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  ✅ Marcado como enviado
                </span>
              ) : (
                <button onClick={marcarEnviado} className="btn-secondary text-sm">
                  ✓ Marcar como enviado
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
            <pre className="text-xs text-green-300 font-mono whitespace-pre">
              {preview.length > 3000 ? preview.substring(0, 3000) + '\n\n[… truncado para vista previa]' : preview}
            </pre>
          </div>

          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Siguiente paso:</strong> Descarga el XML y cárgalo en <strong>SICVECA</strong> (sugef.fi.cr) dentro del plazo establecido.
              Sujeto Tipo I: plazo 20 días naturales post-cierre del período bimestral.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
