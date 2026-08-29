// ============================================================
// Módulos opcionales por Sujeto Obligado (solo superadmin)
// Habilita/deshabilita módulos adicionales (hoy: Recolección KYC) por empresa.
// Si un módulo no está habilitado, solo el superadmin lo ve.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase, tenantsDeLaApp } from '../../lib/supabase'

const MODULOS = [
  { clave: 'kyc', nombre: 'Recolección KYC', desc: 'Portal para que el cliente complete su información de debida diligencia, suba documentos y firme el KYC.' },
]

export default function ModulosSujetosObligados() {
  const { isSuperAdmin } = useAuth()
  const [tenants, setTenants]   = useState([])
  const [habil, setHabil]       = useState({}) // { `${tenantId}:${modulo}`: true }
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(null)
  const [q, setQ]               = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    const [t, m] = await Promise.all([
      tenantsDeLaApp('id, nombre, actividad_apnfd'),
      supabase.from('modulos_habilitados').select('tenant_id, modulo, habilitado'),
    ])
    if (t.error || m.error) { setError((t.error || m.error).message); setLoading(false); return }
    setTenants(t.data || [])
    const map = {}
    ;(m.data || []).forEach(r => { if (r.habilitado) map[`${r.tenant_id}:${r.modulo}`] = true })
    setHabil(map)
    setLoading(false)
  }, [])

  useEffect(() => { if (isSuperAdmin) cargar(); else setLoading(false) }, [isSuperAdmin, cargar])

  if (!isSuperAdmin) return <div className="p-6 text-gray-500">Sección exclusiva del superadministrador.</div>
  if (loading) return <div className="p-6 text-gray-500">Cargando…</div>

  async function toggle(tenantId, modulo) {
    const key = `${tenantId}:${modulo}`
    const nuevo = !habil[key]
    setBusy(key)
    const { error } = await supabase.from('modulos_habilitados')
      .upsert({ tenant_id: tenantId, modulo, habilitado: nuevo }, { onConflict: 'tenant_id,modulo' })
    setBusy(null)
    if (error) { setError(error.message); return }
    setHabil(prev => ({ ...prev, [key]: nuevo }))
  }

  const filtrados = tenants.filter(t =>
    !q.trim() || (t.nombre || '').toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Módulos por Sujeto Obligado</h1>
        <p className="text-sm text-gray-500">Habilitá módulos adicionales por empresa. Sin habilitar, el módulo solo lo ve el superadministrador.</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <input
        type="search" placeholder="Buscar sujeto obligado…"
        value={q} onChange={e => setQ(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-2 font-semibold">Sujeto obligado</th>
              {MODULOS.map(m => <th key={m.clave} className="px-4 py-2 font-semibold text-center">{m.nombre}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtrados.map(t => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-800">{t.nombre}</div>
                  <div className="text-xs text-gray-400">{t.actividad_apnfd}</div>
                </td>
                {MODULOS.map(m => {
                  const key = `${t.id}:${m.clave}`
                  const on = !!habil[key]
                  return (
                    <td key={m.clave} className="px-4 py-2 text-center">
                      <button
                        onClick={() => toggle(t.id, m.clave)}
                        disabled={busy === key}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300'} disabled:opacity-50`}
                        title={on ? 'Habilitado' : 'Deshabilitado'}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 text-xs text-gray-500 space-y-1">
        {MODULOS.map(m => <p key={m.clave}><strong>{m.nombre}:</strong> {m.desc}</p>)}
      </div>
    </div>
  )
}
