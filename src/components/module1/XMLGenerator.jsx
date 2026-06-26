import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { generarXMLSICVECA, descargarXML } from '../../lib/xmlGenerator'
import { TIPO_CARGA } from '../../lib/catalogos'
import ErrorBanner from '../ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'

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
    setError(null)
    setLoading(true)
    try {
      const desde = periodo + '-01'
      const hasta = periodo + '-31'
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
    const hasta = periodo + '-31'
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
            <select className="input-field text-sm"
              value={tenantVistaId}
              onChange={e => setTenantVistaId(e.target.value)}>
              <option value="">— Seleccione el sujeto obligado —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
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
