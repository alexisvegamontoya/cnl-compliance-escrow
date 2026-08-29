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
  const [machotes, setMachotes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(null)
  const [q, setQ]               = useState('')
  // Alta de machote
  const [mNombre, setMNombre]   = useState('')
  const [mClave, setMClave]     = useState('autorizacion_cic')
  const [mSector, setMSector]   = useState('credito')
  const [mArchivo, setMArchivo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    const [t, m, mac] = await Promise.all([
      tenantsDeLaApp('id, nombre, actividad_apnfd'),
      supabase.from('modulos_habilitados').select('tenant_id, modulo, habilitado'),
      supabase.from('machotes').select('*').order('creado_en', { ascending: false }),
    ])
    if (t.error || m.error) { setError((t.error || m.error).message); setLoading(false); return }
    setTenants(t.data || [])
    const map = {}
    ;(m.data || []).forEach(r => { if (r.habilitado) map[`${r.tenant_id}:${r.modulo}`] = true })
    setHabil(map)
    setMachotes(mac.data || [])
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

  async function subirMachote(e) {
    e.preventDefault(); setError('')
    if (!mNombre.trim() || !mClave.trim() || !mArchivo) { setError('Complete nombre, clave y archivo del machote.'); return }
    setSubiendo(true)
    const ext = (mArchivo.name.split('.').pop() || 'pdf').toLowerCase()
    const path = `${mClave.trim()}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('machotes').upload(path, mArchivo, { contentType: mArchivo.type || 'application/pdf', upsert: false })
    if (up.error) { setSubiendo(false); setError(up.error.message); return }
    const url = supabase.storage.from('machotes').getPublicUrl(path).data.publicUrl
    const { error } = await supabase.from('machotes').insert({
      nombre: mNombre.trim(), clave: mClave.trim(), sector: mSector || null, archivo_url: url, archivo_path: path,
    })
    setSubiendo(false)
    if (error) { await supabase.storage.from('machotes').remove([path]); setError(error.message); return }
    setMNombre(''); setMArchivo(null)
    cargar()
  }

  async function eliminarMachote(m) {
    if (!window.confirm(`¿Eliminar el machote "${m.nombre}"?`)) return
    if (m.archivo_path) await supabase.storage.from('machotes').remove([m.archivo_path])
    await supabase.from('machotes').delete().eq('id', m.id)
    setMachotes(prev => prev.filter(x => x.id !== m.id))
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

      {/* Machotes globales (para el portal KYC) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Machotes / plantillas</h2>
          <p className="text-xs text-gray-500">Documentos que el cliente descarga, completa/firma y vuelve a subir en el portal (ej. autorización CIC para facilidades crediticias).</p>
        </div>
        <form onSubmit={subirMachote} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className="label text-xs">Nombre visible</label>
            <input className="input text-sm" value={mNombre} onChange={e => setMNombre(e.target.value)} placeholder="Ej. Autorización de consulta al CIC" />
          </div>
          <div>
            <label className="label text-xs">Clave</label>
            <input className="input text-sm" value={mClave} onChange={e => setMClave(e.target.value.replace(/[^a-z0-9_]/gi, '_'))} placeholder="autorizacion_cic" />
          </div>
          <div>
            <label className="label text-xs">Sector</label>
            <select className="input text-sm" value={mSector} onChange={e => setMSector(e.target.value)}>
              <option value="">General (todos)</option>
              <option value="credito">Facilidades crediticias</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <input type="file" accept="application/pdf,.doc,.docx,image/*" onChange={e => setMArchivo(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </div>
          <button type="submit" disabled={subiendo} className="btn-primary text-sm disabled:opacity-50">
            {subiendo ? 'Subiendo…' : '+ Agregar machote'}
          </button>
        </form>

        {machotes.length === 0 ? (
          <p className="text-sm text-gray-400">Sin machotes cargados.</p>
        ) : (
          <div className="space-y-1">
            {machotes.map(m => (
              <div key={m.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-700">
                  📄 {m.nombre} <span className="text-xs text-gray-400">· {m.sector || 'general'} · {m.clave}</span>
                </span>
                <div className="flex items-center gap-3">
                  <a href={m.archivo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">Ver</a>
                  <button onClick={() => eliminarMachote(m)} className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
