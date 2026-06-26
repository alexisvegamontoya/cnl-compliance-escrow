import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { generarXMLSICVECA, descargarXML } from '../../lib/xmlGenerator'
import { TIPO_CARGA } from '../../lib/catalogos'

export default function XMLGenerator() {
  const { tenant } = useAuth()
  const [periodo, setPeriodo]       = useState(new Date().toISOString().substring(0, 7))
  const [tipoCarga, setTipoCarga]   = useState(1)
  const [tipoMoneda, setTipoMoneda] = useState(tenant?.tipo_moneda_default || 1)
  const [loading, setLoading]       = useState(false)
  const [preview, setPreview]       = useState('')
  const [stats, setStats]           = useState(null)
  const [error, setError]           = useState('')

  async function generarXML() {
    if (!tenant) { setError('No se encontró el sujeto obligado.'); return }
    setError('')
    setLoading(true)
    try {
      const desde = periodo + '-01'
      const hasta = periodo + '-31'
      const { data: txs, error: txErr } = await supabase
        .from('transacciones')
        .select('*')
        .eq('tenant_id', tenant.id)
        .gte('periodo', desde)
        .lte('periodo', hasta)
        .order('created_at')

      if (txErr) throw txErr
      if (!txs || txs.length === 0) {
        setError('No hay transacciones registradas para este período.')
        setLoading(false)
        return
      }

      const xml = generarXMLSICVECA({
        clase_dato: tenant.clase_dato,
        archivo: tenant.archivo,
        cedula_juridica: tenant.cedula_juridica,
        tipo_carga: tipoCarga,
        tipo_moneda: tipoMoneda,
        periodo: desde,
      }, txs)

      const nombreArchivo = `${tenant.actividad_apnfd?.replace(/\s+/g, '_')}_${periodo}`
      setPreview(xml)
      setStats({
        registros: txs.length,
        nombreArchivo,
        xml,
      })
    } catch (err) {
      setError(err.message || 'Error al generar el XML.')
    } finally {
      setLoading(false)
    }
  }

  function descargar() {
    if (!stats) return
    descargarXML(stats.xml, stats.nombreArchivo)
  }

  async function marcarEnviado() {
    if (!tenant || !stats) return
    const desde = periodo + '-01'
    const hasta = periodo + '-31'
    await supabase
      .from('transacciones')
      .update({ enviado_sugef: true, fecha_envio_sugef: new Date().toISOString() })
      .eq('tenant_id', tenant.id)
      .gte('periodo', desde)
      .lte('periodo', hasta)
    alert('Transacciones marcadas como enviadas a SUGEF.')
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Generador XML SICVECA</h3>
        <p className="text-sm text-gray-500 mb-6">
          Genera el archivo XML en formato APNFD para cargarlo en la plataforma SICVECA de SUGEF.
          {tenant && (
            <span className="block mt-1 font-medium text-gray-700">
              Actividad: {tenant.actividad_apnfd} — ClaseDato: {tenant.clase_dato} — Archivo: {tenant.archivo}
            </span>
          )}
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="label">Período *</label>
            <input type="month" className="input-field"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)} />
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <button className="btn-primary" onClick={generarXML} disabled={loading}>
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
              <button onClick={marcarEnviado} className="btn-secondary text-sm">
                ✓ Marcar como enviado
              </button>
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
