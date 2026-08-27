import { useState, useEffect, useCallback } from 'react'
import { supabase, tenantsDeLaApp } from '../../lib/supabase'
import { apiFetch, apiJson } from '../../lib/apiFetch'
import { useAuth } from '../../lib/AuthContext'
import ErrorBanner from '../../components/ui/ErrorBanner'
import { clasificarError } from '../../lib/errorHandler'
import { generarClave } from '../../lib/generarClave'
import { ROLES_ASIGNABLES } from '../../lib/permisos'

const ROL_TENANT_LABEL = {
  operador:             { label: 'Operador (heredado)', color: 'bg-gray-100 text-gray-600' },
  oficial_cumplimiento: { label: 'Oficial de Cumplimiento', color: 'bg-brand-100 text-brand-700' },
  operativo:            { label: 'Operativo', color: 'bg-sky-100 text-sky-700' },
  financiero:           { label: 'Financiero', color: 'bg-amber-100 text-amber-800' },
  gerencia:             { label: 'Gerencia', color: 'bg-violet-100 text-violet-700' },
  admin_tenant:         { label: 'Administrador', color: 'bg-emerald-100 text-emerald-700' },
}

/** Opciones de rol para los <select> de asignación. */
function OpcionesRol() {
  return ROLES_ASIGNABLES.map(r => <option key={r.valor} value={r.valor}>{r.label}</option>)
}

// ──────────────────────────────────────────────────────────────
// Formulario para crear nuevo usuario (solo superadmin)
// ──────────────────────────────────────────────────────────────
function FormCrearUsuario({ tenants, onCreado, onCancel }) {
  const [email, setEmail]       = useState('')
  const [nombre, setNombre]     = useState('')
  const [password, setPassword] = useState('')
  const [passVer, setPassVer]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [sel, setSel]           = useState({}) // { tenant_id: rol }
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [ok, setOk]             = useState('')

  function toggleTenant(tid) {
    setSel(prev => {
      if (prev[tid]) {
        const next = { ...prev }
        delete next[tid]
        return next
      }
      return { ...prev, [tid]: 'oficial_cumplimiento' }
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
    if (!password || password.length < 6) {
      setError({ tipo: 'operativo', mensaje: 'La contraseña provisional debe tener al menos 6 caracteres.' })
      return
    }
    if (password !== passVer) {
      setError({ tipo: 'operativo', mensaje: 'Las contraseñas no coinciden.' })
      return
    }
    if (tenantsSeleccionados.length === 0) {
      setError({ tipo: 'operativo', mensaje: 'Seleccione al menos un sujeto obligado.' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        email:    email.trim(),
        nombre:   nombre.trim(),
        password: password,
        tenants:  tenantsSeleccionados.map(tid => ({ tenant_id: tid, rol: sel[tid] })),
      }

      const res = await apiFetch('/api/admin-invite-user', {
        method:  'POST',
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
      setPassword('')
      setPassVer('')
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
        <div>
          <label className="label">Contraseña provisional *</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="input-field pr-10"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
              onClick={() => setShowPass(s => !s)}>
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        <div>
          <label className="label">Confirmar contraseña *</label>
          <input
            type={showPass ? 'text' : 'password'}
            className="input-field"
            placeholder="Repetir contraseña"
            value={passVer}
            onChange={e => setPassVer(e.target.value)}
            required
          />
        </div>
      </div>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        ⚠ El sistema solicitará al usuario cambiar esta contraseña al primer ingreso. Comparta las credenciales de forma segura.
      </p>

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
                    className="input-field text-xs py-1 w-48"
                  >
                    <OpcionesRol />
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
          {saving ? 'Creando usuario…' : '👤 Crear usuario'}
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
  const [nuevoRol, setNuevoRol]       = useState('oficial_cumplimiento')
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
    setNuevoRol('oficial_cumplimiento')
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
              {/* Conserva el valor heredado en la lista si aún no se reasignó */}
              {m.rol === 'operador' && <option value="operador">Operador (heredado)</option>}
              <OpcionesRol />
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
            <OpcionesRol />
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
// Restablecer la contraseña de otro usuario (solo superadmin)
//
// La contraseña anterior no se puede recuperar —Supabase solo guarda el
// hash—, así que la única forma de devolverle el acceso a alguien es
// reemplazarla. Se muestra en pantalla para que el administrador se la pase
// por un canal aparte; el usuario deberá cambiarla al ingresar.
// ──────────────────────────────────────────────────────────────
function PanelClaveUsuario({ usuario }) {
  const [clave, setClave]       = useState('')
  const [mostrar, setMostrar]   = useState(false)
  const [forzar, setForzar]     = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState(null)
  const [aplicada, setAplicada] = useState(null)

  async function aplicar(nueva) {
    setError(null)
    if (nueva.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setGuardando(true)
    try {
      await apiJson('/api/admin-set-password', {
        method: 'POST',
        body: JSON.stringify({ userId: usuario.id, password: nueva, forzarCambio: forzar }),
      })
      setAplicada(nueva)
      setClave('')
      setMostrar(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-4 mb-3 mt-1 pt-3 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">🔑 Contraseña de acceso</p>
        {!aplicada && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => aplicar(generarClave())}
            className="text-xs text-brand-700 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60"
          >
            {guardando ? '…' : 'Generar una segura'}
          </button>
        )}
      </div>

      {aplicada ? (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
          <p className="text-xs text-green-800">
            ✅ Contraseña actualizada. Cópiela y entréguesela a {usuario.nombre || usuario.email} por un
            medio seguro: no se vuelve a mostrar.
          </p>
          <code className="block select-all font-mono text-base text-gray-900 bg-white border border-green-200 rounded px-3 py-1.5">
            {aplicada}
          </code>
          {forzar && (
            <p className="text-xs text-green-700">
              Se le pedirá establecer una contraseña personal en su próximo ingreso.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={mostrar ? 'text' : 'password'}
                value={clave}
                onChange={e => setClave(e.target.value)}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                autoComplete="new-password"
                className="w-full border border-gray-200 rounded-lg px-3 pr-14 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setMostrar(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                {mostrar ? 'Ocultar' : 'Ver'}
              </button>
            </div>
            <button
              type="button"
              disabled={guardando || !clave}
              onClick={() => aplicar(clave)}
              className="btn-primary text-xs py-1 px-3 whitespace-nowrap disabled:opacity-60"
            >
              {guardando ? 'Aplicando…' : 'Cambiar'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={forzar} onChange={e => setForzar(e.target.checked)} />
            Pedirle que la cambie en su próximo ingreso
          </label>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>
          )}
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

    if (isSuperAdmin) {
      // Superadmin: usar endpoint de servidor que bypasea RLS
      try {
        const res = await apiFetch('/api/admin-list-users')
        const json = await res.json()
        if (res.ok) {
          setUsuarios(json.usuarios || [])
        } else {
          setError({ tipo: 'operativo', mensaje: json.error || 'Error al cargar usuarios' })
        }
      } catch (err) {
        setError({ tipo: 'operativo', mensaje: 'Error de conexión: ' + err.message })
      }
      setLoading(false)
      return
    }

    // Admin de tenant: solo usuarios de su tenant (vía membresías)
    if (!tenant) { setLoading(false); return }
    const { data: mems } = await supabase
      .from('user_tenant_memberships')
      .select('user_id')
      .eq('tenant_id', tenant.id)
    const ids = (mems || []).map(m => m.user_id)
    if (!ids.length) { setUsuarios([]); setLoading(false); return }

    const { data, error: err } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: true })
    if (!err) setUsuarios(data || [])
    setLoading(false)
  }, [tenant, isSuperAdmin])

  useEffect(() => {
    cargar()
    // Cargar lista de tenants (para formulario de creación y panel de membresías)
    tenantsDeLaApp('id, nombre, actividad_apnfd')
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
      const res = await apiFetch('/api/admin-delete-user', {
        method: 'DELETE',
        body: JSON.stringify({ userId: u.id }),
      })
      const text = await res.text()
      let json = {}
      try {
        json = JSON.parse(text)
      } catch {
        // Respuesta sin cuerpo JSON: se conserva el objeto vacío
      }
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
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-800">
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
                    {/* Tenants asignados — visible en vista superadmin */}
                    {isSuperAdmin && u.rol !== 'superadmin' && u._tenants?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {u._tenants.slice(0, 3).map(t => (
                          <span key={t.id}
                            className="px-1.5 py-0.5 rounded text-xs bg-brand-50 text-brand-700 border border-brand-100">
                            {t.nombre}
                          </span>
                        ))}
                        {u._tenants.length > 3 && (
                          <span className="text-xs text-gray-400">+{u._tenants.length - 3} más</span>
                        )}
                      </div>
                    )}
                    {isSuperAdmin && u.rol !== 'superadmin' && (!u._tenants || u._tenants.length === 0) && (
                      <p className="text-xs text-amber-500 mt-0.5">⚠ Sin sujeto obligado asignado</p>
                    )}
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

                    {/* Contraseña — el superadmin se la puede cambiar a cualquiera,
                        incluido otro superadmin. Sobre sí mismo no: para eso está
                        Mi Perfil, que no requiere pasar por el servidor. */}
                    {isSuperAdmin && !esYo && <PanelClaveUsuario usuario={u} />}
                    {isSuperAdmin && esYo && (
                      <p className="text-xs text-gray-400 px-4 pb-3 pt-1">
                        🔑 Para cambiar su propia contraseña use <strong>Mi Perfil → Contraseña</strong>.
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
          <p><strong>Oficial de Cumplimiento:</strong> acceso total a todos los módulos operativos (clientes, SICVECA, ROS, denuncias, cumplimiento, informes).</p>
          <p><strong>Operativo:</strong> clientes, listas PEP, debida diligencia, calificación, transacciones y canal de denuncias. Sin ROS, informes, XML ni nivel de cumplimiento.</p>
          <p><strong>Financiero:</strong> transacciones, generación de XML y canal de denuncias. Sin clientes, informes, ROS ni nivel de cumplimiento.</p>
          <p><strong>Gerencia:</strong> supervisión en modo lectura + informes y nivel de cumplimiento. No carga datos.</p>
          <p><strong>Administrador:</strong> todo lo del oficial + gestiona los usuarios de su sujeto obligado.</p>
          <p><strong>Super Admin:</strong> acceso total a todos los sujetos obligados (solo CNL Craniley).</p>
          <p className="text-gray-400 pt-1">Los usuarios «Operador (heredado)» conservan acceso total hasta que se les asigne uno de los roles anteriores.</p>
        </div>
      </div>
    </div>
  )
}
