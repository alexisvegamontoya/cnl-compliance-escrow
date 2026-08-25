// ============================================================
// Grupos de empresas — administración (solo superadmin)
// Crear grupos, asignar sujetos obligados (una empresa → un grupo) y asignar
// usuarios (un usuario puede estar en varios grupos). Los usuarios de un grupo
// pasan a ser miembros plenos de todas las empresas del grupo (vía RLS) y ven la
// consulta "Cumplimiento por Grupo".
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase, tenantsDeLaApp } from '../../lib/supabase'

export default function GestionGrupos() {
  const { isSuperAdmin } = useAuth()

  const [grupos, setGrupos]       = useState([])
  const [tenants, setTenants]     = useState([])
  const [usuarios, setUsuarios]   = useState([])
  const [miembros, setMiembros]   = useState([]) // filas grupo_usuarios
  const [grupoSel, setGrupoSel]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaDesc, setNuevaDesc]     = useState('')
  const [addTenant, setAddTenant] = useState('')
  const [addUser, setAddUser]     = useState('')

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    const [g, t, u, m] = await Promise.all([
      supabase.from('grupos_empresas').select('*').order('nombre'),
      tenantsDeLaApp('id, nombre, grupo_id'),
      supabase.from('user_profiles').select('id, nombre, email, rol').order('nombre'),
      supabase.from('grupo_usuarios').select('id, grupo_id, user_id, activo'),
    ])
    const fallo = [g, t, u, m].find(r => r.error)
    if (fallo) { setError(fallo.error.message); setLoading(false); return }
    setGrupos(g.data || [])
    setTenants(t.data || [])
    setUsuarios((u.data || []).filter(x => x.rol !== 'superadmin'))
    setMiembros((m.data || []).filter(x => x.activo !== false))
    setGrupoSel(prev => prev || (g.data?.[0]?.id ?? null))
    setLoading(false)
  }, [])

  useEffect(() => { if (isSuperAdmin) cargar(); else setLoading(false) }, [isSuperAdmin, cargar])

  if (!isSuperAdmin) {
    return <div className="p-6 text-gray-500">Esta sección es exclusiva del superadministrador.</div>
  }

  async function crearGrupo(e) {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    const { data, error } = await supabase.from('grupos_empresas')
      .insert({ nombre: nuevoNombre.trim(), descripcion: nuevaDesc.trim() || null })
      .select('id').single()
    if (error) { setError(error.message); return }
    setNuevoNombre(''); setNuevaDesc('')
    await cargar()
    if (data?.id) setGrupoSel(data.id)
  }

  async function renombrarGrupo(id, nombre) {
    const nuevo = window.prompt('Nuevo nombre del grupo:', nombre)
    if (nuevo == null || !nuevo.trim() || nuevo.trim() === nombre) return
    const { error } = await supabase.from('grupos_empresas').update({ nombre: nuevo.trim() }).eq('id', id)
    if (error) { setError(error.message); return }
    cargar()
  }

  async function eliminarGrupo(id) {
    if (!window.confirm('¿Eliminar este grupo? Las empresas quedarán sin grupo y se quitarán sus usuarios.')) return
    const { error } = await supabase.from('grupos_empresas').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setGrupoSel(null)
    cargar()
  }

  async function asignarTenant() {
    if (!addTenant || !grupoSel) return
    const { error } = await supabase.from('tenants').update({ grupo_id: grupoSel }).eq('id', addTenant)
    if (error) { setError(error.message); return }
    setAddTenant('')
    cargar()
  }

  async function quitarTenant(tenantId) {
    const { error } = await supabase.from('tenants').update({ grupo_id: null }).eq('id', tenantId)
    if (error) { setError(error.message); return }
    cargar()
  }

  async function agregarUsuario() {
    if (!addUser || !grupoSel) return
    const { error } = await supabase.from('grupo_usuarios')
      .upsert({ grupo_id: grupoSel, user_id: addUser, activo: true }, { onConflict: 'grupo_id,user_id' })
    if (error) { setError(error.message); return }
    setAddUser('')
    cargar()
  }

  async function quitarUsuario(userId) {
    const { error } = await supabase.from('grupo_usuarios')
      .delete().eq('grupo_id', grupoSel).eq('user_id', userId)
    if (error) { setError(error.message); return }
    cargar()
  }

  if (loading) return <div className="p-6 text-gray-500">Cargando grupos…</div>

  const grupo = grupos.find(g => g.id === grupoSel) || null
  const empresasDelGrupo = tenants.filter(t => t.grupo_id === grupoSel)
  const empresasSinEste  = tenants.filter(t => t.grupo_id !== grupoSel)
  const userIdsDelGrupo  = new Set(miembros.filter(m => m.grupo_id === grupoSel).map(m => m.user_id))
  const usuariosDelGrupo = usuarios.filter(u => userIdsDelGrupo.has(u.id))
  const usuariosFuera    = usuarios.filter(u => !userIdsDelGrupo.has(u.id))
  const nombreUsuario = (u) => u.nombre || u.email || u.id

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Grupos de Empresas</h1>
        <p className="text-sm text-gray-500">Agrupá sujetos obligados y asigná usuarios que verán el cumplimiento del grupo.</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Lista de grupos + crear ── */}
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Grupos</p>
            {grupos.length === 0 && <p className="text-sm text-gray-400 italic">Sin grupos todavía.</p>}
            <div className="space-y-1">
              {grupos.map(g => {
                const nEmp = tenants.filter(t => t.grupo_id === g.id).length
                const nUsr = new Set(miembros.filter(m => m.grupo_id === g.id).map(m => m.user_id)).size
                return (
                  <button key={g.id} onClick={() => setGrupoSel(g.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      g.id === grupoSel ? 'bg-brand-700 text-white' : 'hover:bg-gray-50 text-gray-700'
                    }`}>
                    <div className="font-medium">{g.nombre}</div>
                    <div className={`text-xs ${g.id === grupoSel ? 'text-brand-100' : 'text-gray-400'}`}>
                      {nEmp} empresa{nEmp === 1 ? '' : 's'} · {nUsr} usuario{nUsr === 1 ? '' : 's'}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <form onSubmit={crearGrupo} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nuevo grupo</p>
            <input className="input text-sm" placeholder="Nombre del grupo…"
              value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} />
            <input className="input text-sm" placeholder="Descripción (opcional)…"
              value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} />
            <button type="submit" disabled={!nuevoNombre.trim()}
              className="btn-primary text-sm w-full py-1.5 disabled:opacity-50">+ Crear grupo</button>
          </form>
        </div>

        {/* ── Detalle del grupo seleccionado ── */}
        {!grupo ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-400 text-sm">
            Seleccioná o creá un grupo para asignarle empresas y usuarios.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{grupo.nombre}</h2>
                {grupo.descripcion && <p className="text-sm text-gray-500">{grupo.descripcion}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => renombrarGrupo(grupo.id, grupo.nombre)}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Renombrar</button>
                <button onClick={() => eliminarGrupo(grupo.id)}
                  className="text-xs px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50">Eliminar</button>
              </div>
            </div>

            {/* Empresas del grupo */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-bold text-gray-800">🏢 Sujetos obligados del grupo</p>
              <div className="flex gap-2">
                <select className="input text-sm flex-1" value={addTenant} onChange={e => setAddTenant(e.target.value)}>
                  <option value="">— Agregar empresa al grupo —</option>
                  {empresasSinEste.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}{t.grupo_id ? ` (ya en otro grupo)` : ''}
                    </option>
                  ))}
                </select>
                <button onClick={asignarTenant} disabled={!addTenant}
                  className="btn-secondary text-sm px-4 disabled:opacity-50">Agregar</button>
              </div>
              {empresasDelGrupo.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin empresas en este grupo.</p>
              ) : (
                <div className="space-y-1">
                  {empresasDelGrupo.map(t => (
                    <div key={t.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-800">{t.nombre}</span>
                      <button onClick={() => quitarTenant(t.id)}
                        className="text-red-400 hover:text-red-600 text-sm">Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Usuarios del grupo */}
            <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-bold text-gray-800">👥 Usuarios con acceso al grupo</p>
              <p className="text-xs text-gray-400">
                Estos usuarios pasan a ser miembros de todas las empresas del grupo y ven la consulta de cumplimiento del grupo.
              </p>
              <div className="flex gap-2">
                <select className="input text-sm flex-1" value={addUser} onChange={e => setAddUser(e.target.value)}>
                  <option value="">— Agregar usuario al grupo —</option>
                  {usuariosFuera.map(u => (
                    <option key={u.id} value={u.id}>{nombreUsuario(u)}{u.email ? ` — ${u.email}` : ''}</option>
                  ))}
                </select>
                <button onClick={agregarUsuario} disabled={!addUser}
                  className="btn-secondary text-sm px-4 disabled:opacity-50">Agregar</button>
              </div>
              {usuariosDelGrupo.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin usuarios asignados.</p>
              ) : (
                <div className="space-y-1">
                  {usuariosDelGrupo.map(u => (
                    <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-800">
                        {nombreUsuario(u)}{u.email ? <span className="text-gray-400"> · {u.email}</span> : null}
                      </span>
                      <button onClick={() => quitarUsuario(u.id)}
                        className="text-red-400 hover:text-red-600 text-sm">Quitar</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
