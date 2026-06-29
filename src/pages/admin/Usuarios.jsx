import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import ErrorBanner from '../../components/ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'

const ROL_TENANT_LABEL = {
  operador:    { label: 'Operador',    color: 'bg-gray-100 text-gray-700' },
  admin_tenant:{ label: 'Administrador', color: 'bg-brand-100 text-brand-700' },
}

// ──────────────────────────────────────────────────────────────
// Formulario para crear nuevo usuario (solo superadmin)
// ──────────────────────────────────────────────────────────────
function FormCrearUsuario({ tenants, onCreado, onCancel }) {
  const [email, setEmail]   = useState('')
  const [nombre, setNombre] = useState('')
  const [sel, setSel]       = useState({}) // { tenant_id: rol }
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [ok, setOk]         = useState('')

  function toggleTenant(tid) {
    setSel(prev => {
      if (prev[tid]) {
        const next = { ...prev }
        delete next[tid]
        return next
      }
      return { ...prev, [tid]: 'operador' }
    })
  }

  function setRol(tid, rol) {
    setSel(prev => ({ ...prev, [tid]: rol }))
  }

  const tenantsSeleccionados = Object.keys(sel)

  async function enviar(e) {
    e.preventDefault()
    setError(null)
    setOk('')

    if (!email.trim() || !nombre.trim()) {
      setError({ tipo: 'operativo', mensaje: 'El correo y el nombre son requeridos.' })
      return
    }
    if (tenantsSeleccionados.length === 0) {
      setError({ tipo: 'operativo', mensaje: 'Seleccione al menos un sujeto obligado.' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        email: email.trim(),
        nombre: nombre.trim(),
        tenants: tenantsSeleccionados.map(tid => ({ tenant_id: tid, rol: sel[tid] })),
      }

      const res = await fetch('/api/admin-invite-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      // Leer respuesta de forma segura
      const text = await res.text()
      let json = {}
      try { json = JSON.parse(text) } catch (_) {
        // Respuesta no es JSON (posiblemente HTML de error 500)
        setError({ tipo: 'operativo', mensaje: `Error HTTP ${res.status}: ${text.substring(0, 200)}` })
        return
      }

      if (!res.ok) {
        setError({ tipo: 'operativo', mensaje: json.error || `Error ${res.status} al crear el usuario` })
        return
      }

      setOk(json.message)
      setEmail('')
      setNombre('')
      setSel({})
      onCreado?.()
    } catch (err) {
      setError({ tipo: 'operativo', mensaje: 'Error de conexión: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={enviar} className="card border-2 border-brand-200 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Nuevo usuario</h3>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      {/* Datos personales */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Correo electrónico *</label>
          <input
            type="email"
            className="input-field"
            placeholder="usuario@empresa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Nombre completo *</label>
          <input
            type="text"
            className="input-field"
            placeholder="Nombre Apellido"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Sujetos obligados */}
      <div>
        <label className="label mb-2 block">
          Sujetos obligados *
          <span className="font-normal text-gray-400 ml-1">— seleccione uno o varios</span>
        </label>
        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
          {tenants.length === 0 && (
            <p className="text-sm text-gray-400">No hay sujetos obligados registrados.</p>
          )}
          {tenants.map(t => {
            const marcado = !!sel[t.id]
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  marcado ? 'border-brand-300 bg-brand-50' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggleTenant(t.id)}
                  className="w-4 h-4 accent-brand-600 flex-shrink-0"
                  id={`t-${t.id}`}
                />
                <label htmlFor={`t-${t.id}`} className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium text-gray-900">{t.nombre}</p>
                  <p className="text-xs text-gray-400">{t.actividad_apnfd}</p>
                </label>
                {marcado && (
                  <select
                    value={sel[t.id]}
                    onChange={e => setRol(t.id, e.target.value)}
                    className="input-field text-xs py-1 w-36"
                  >
                    <option value="operador">Operador</option>
                    <option value="admin_tenant">Administrador</option>
                  </select>
                )}
              </div>
            )
          })}
        </div>
        {tenantsSeleccionados.length > 0 && (
          <p className="text-xs text-brand-600 mt-1">
            ✓ {tenantsSeleccionados.length} sujeto{tenantsSeleccionados.length > 1 ? 's' : ''} seleccionado{tenantsSeleccionados.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />

      {ok && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
          ✅ {ok}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">
          Cancelar
        </button>
        <button
          type="submit"
          className="btn-primary text-sm"
          disabled={saving}
        >
          {saving ? 'Enviando invitación…' : '✉️ Enviar invitación'}
        </button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────────────────────────
// Panel de membresías de un usuario
// ──────────────────────────────────────────────────────────────
function MembresiasUsuario({ userId, tenantsDisponibles, onCambio }) {
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading]         = useState(true)
  const [agregando, setAgregando]     = useState(false)
  const [nuevaTenant, setNuevaTenant] = useState('')
  const [nuevoRol, setNuevoRol]       = useState('operador')
  const [saving, setSaving]           = useState(null)

  const cargarMem = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_tenant_memberships')
      .select('*, tenants(id, nombre, actividad_apnfd)')
      .eq('user_id', userId)
      .order('created_at')
    setMemberships(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { cargarMem() }, [cargarMem])

  async function toggleMembresia(memId, activo) {
    setSaving(memId)
    await supabase
      .from('user_tenant_memberships')
      .update({ activo: !activo })
      .eq('id', memId)
    await cargarMem()
    onCambio?.()
    setSaving(null)
  }

  async function cambiarRolMem(memId, rol) {
    setSaving(memId)
    await supabase
      .from('user_tenant_memberships')
      .update({ rol })
      .eq('id', memId)
    await cargarMem()
    setSaving(null)
  }

  async function agregarMem() {
    if (!nuevaTenant) return
    setSaving('new')
    await supabase
      .from('user_tenant_memberships')
      .upsert({ user_id: userId, tenant_id: nuevaTenant, rol: nuevoRol, activo: true },
               { onConflict: 'user_id,tenant_id' })
    setAgregando(false)
    setNuevaTenant('')
    setNuevoRol('operador')
    await cargarMem()
    onCambio?.()
    setSaving(null)
  }

  const tenantIds = memberships.map(m => m.tenant_id)
  const disponiblesParaAgregar = tenantsDisponibles.filter(t => !tenantIds.includes(t.id))

  if (loading) return <p className="text-xs text-gray-400 pl-14 pb-2">Cargando…</p>

  return (
    <div className="pl-14 pb-3 pr-4 space-y-1.5">
      {memberships.map(m => {
        const rolInfo = ROL_TENANT_LABEL[m.rol] || { label: m.rol, color: 'bg-gray-100 text-gray-600' }
        return (
          <div
            key={m.id}
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
              m.activo ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-100 opacity-60'
            }`}
          >
            <span className="font-medium text-gray-700 flex-1 truncate">
              🏢 {m.tenants?.nombre}
            </span>
            <select
              value={m.rol}
              disabled={!m.activo || saving === m.id}
              onChange={e => cambiarRolMem(m.id, e.target.value)}
              className="border border-gray-200 rounded px-2 py-0.5 text-xs bg-white"
            >
              <option value="operador">Operador</option>
              <option value="admin_tenant">Administrador</option>
            </select>
            <button
              disabled={saving === m.id}
              onClick={() => toggleMembresia(m.id, m.activo)}
              className={`px-2 py-0.5 rounded border text-xs font-medium transition-colors ${
                m.activo
                  ? 'text-red-500 border-red-200 hover:bg-red-50'
                  : 'text-green-600 border-green-200 hover:bg-green-50'
              }`}
            >
              {saving === m.id ? '…' : m.activo ? 'Quitar' : 'Reactivar'}
            </button>
          </div>
        )
      })}

      {/* Agregar membresía */}
      {!agregando && disponiblesParaAgregar.length > 0 && (
        <button
          onClick={() => setAgregando(true)}
          className="text-xs text-brand-600 hover:underline ml-1"
        >
          + Agregar sujeto obligado
        </button>
      )}
      {agregando && (
        <div className="flex items-center gap-2 mt-1">
          <select
            value={nuevaTenant}
            onChange={e => setNuevaTenant(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
          >
            <option value="">— Seleccione —</option>
            {disponiblesParaAgregar.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <select
            value={nuevoRol}
            onChange={e => setNuevoRol(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs"
          >
            <option value="operador">Operador</option>
            <option value="admin_tenant">Administrador</option>
          </select>
          <button
            onClick={agregarMem}
            disabled={!nuevaTenant || saving === 'new'}
            className="btn-primary text-xs py-1 px-3"
          >
            {saving === 'new' ? '…' : 'Agregar'}
          </button>
          <button onClick={() => setAgregando(false)} className="text-gray-400 hover:text-gray-600 text-base">✕</button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────────────────────
export default function Usuarios() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const [usuarios, setUsuarios]     = useState([])
  const [tenants, setTenants]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [expandido, setExpandido]   = useState(null)
  const [saving, setSaving]         = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (!isSuperAdmin && tenant) {
      // Admin de tenant: solo usuarios de su tenant (vía membresías)
      const { data: mems } = await supabase
        .from('user_tenant_memberships')
        .select('user_id')
        .eq('tenant_id', tenant.id)
      const ids = (mems || []).map(m => m.user_id)
      if (ids.length > 0) query.in('id', ids)
      else { setUsuarios([]); setLoading(false); return }
    }

    const { data, error: err } = await query
    if (!err) setUsuarios(data || [])
    setLoading(false)
  }, [tenant, isSuperAdmin])

  useEffect(() => {
    cargar()
    // Cargar lista de tenants (para formulario de creación y panel de membresías)
    supabase
      .from('tenants')
      .select('id, nombre, actividad_apnfd')
      .order('nombre')
      .then(({ data }) => setTenants(data || []))
  }, [cargar])

  async function toggleActivo(userId, activo) {
    setSaving(userId)
    await supabase.from('user_profiles').update({ activo: !activo }).eq('id', userId)
    await cargar()
    setSaving(null)
  }

  async function eliminarUsuario(u) {
    if (!confirm(`¿Eliminar permanentemente a ${u.nombre || u.email}?\n\nEsta acción no se puede deshacer. Se eliminarán sus accesos y datos de perfil.`)) return
    setSaving(u.id)
    setError(null)
    try {
      const res = await fetch('/api/admin-delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      })
      const text = await res.text()
      let json = {}
      try { json = JSON.parse(text) } catch (_) {}
      if (!res.ok) {
        setError({ tipo: 'operativo', mensaje: json.error || `Error ${res.status} al eliminar usuario` })
      } else {
        await cargar()
      }
    } catch (err) {
      setError({ tipo: 'operativo', mensaje: 'Error de conexión: ' + err.message })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSuperAdmin ? 'Todos los usuarios del sistema' : `Usuarios de ${tenant?.nombre}`}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            className="btn-primary text-sm"
            onClick={() => setShowForm(s => !s)}
          >
            {showForm ? '✕ Cancelar' : '+ Nuevo usuario'}
          </button>
        )}
      </div>

      {/* Formulario crear usuario */}
      {showForm && isSuperAdmin && (
        <FormCrearUsuario
          tenants={tenants}
          onCreado={() => { cargar(); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ErrorBanner error={error} onClose={() => setError(null)} />

      {/* Lista de usuarios */}
      <div className="card space-y-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando…' : `${usuarios.length} usuario${usuarios.length !== 1 ? 's' : ''}`}
          </p>
          <button onClick={cargar} className="btn-secondary text-xs py-1 px-3">Actualizar</button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-4xl mb-2">👥</p>
            <p className="text-sm">No hay usuarios registrados.</p>
            {isSuperAdmin && (
              <button
                className="mt-3 text-sm text-brand-600 underline"
                onClick={() => setShowForm(true)}
              >
                Crear el primer usuario
              </button>
            )}
          </div>
        ) : (
          usuarios.map(u => {
            const esYo = u.id === profile?.id
            const activo = u.activo !== false
            return (
              <div key={u.id} className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Fila principal */}
                <div
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !activo ? 'opacity-60' : ''
                  }`}
                  onClick={() => setExpandido(prev => prev === u.id ? null : u.id)}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(u.nombre || u.email || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {u.nombre || u.email}
                        {esYo && <span className="ml-1 text-xs text-brand-400">(tú)</span>}
                      </p>
                      {u.rol === 'superadmin' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                          Super Admin
                        </span>
                      )}
                      {!activo && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {!esYo && u.rol !== 'superadmin' && (
                      <button
                        disabled={saving === u.id}
                        onClick={() => toggleActivo(u.id, activo)}
                        className={`text-xs py-1 px-3 rounded-lg font-medium border transition-colors ${
                          activo
                            ? 'text-red-500 border-red-200 hover:bg-red-50'
                            : 'text-green-600 border-green-200 hover:bg-green-50'
                        }`}
                      >
                        {saving === u.id ? '…' : activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                    <span className="text-gray-300 text-xs select-none">
                      {expandido === u.id ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Panel expandible */}
                {expandido === u.id && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    {u.rol !== 'superadmin' ? (
                      <>
                        <p className="text-xs font-medium text-gray-500 px-4 pt-2 pb-1">
                          Sujetos obligados asignados:
                        </p>
                        <MembresiasUsuario
                          userId={u.id}
                          tenantsDisponibles={tenants}
                          onCambio={cargar}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 px-14 py-3">
                        El Super Admin tiene acceso global a todos los sujetos obligados.
                      </p>
                    )}

                    {/* Zona peligrosa — solo superadmin, nunca sobre sí mismo */}
                    {isSuperAdmin && !esYo && u.rol !== 'superadmin' && (
                      <div className="mx-4 mb-3 mt-1 pt-3 border-t border-red-100 flex items-center justify-between">
                        <p className="text-xs text-red-400">Zona peligrosa — acción irreversible</p>
                        <button
                          disabled={saving === u.id}
                          onClick={() => eliminarUsuario(u)}
                          className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          {saving === u.id ? '…' : '🗑 Eliminar usuario'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Info de roles */}
      <div className="card bg-gray-50 border border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Roles disponibles</h4>
        <div className="space-y-1 text-xs text-gray-600">
          <p><strong>Operador:</strong> puede registrar y consultar transacciones, clientes y ROS del sujeto obligado.</p>
          <p><strong>Administrador:</strong> operador + puede gestionar usuarios de su sujeto obligado y acceder a informes.</p>
          <p><strong>Super Admin:</strong> acceso total a todos los sujetos obligados (solo CNL Craniley).</p>
        </div>
      </div>
    </div>
  )
}
