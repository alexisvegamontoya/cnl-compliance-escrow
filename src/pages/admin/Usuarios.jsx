import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const ROL_LABEL = {
  superadmin: { label: 'Super Admin', color: 'bg-purple-100 text-purple-700' },
  admin:      { label: 'Administrador', color: 'bg-brand-100 text-brand-700' },
  operador:   { label: 'Operador', color: 'bg-gray-100 text-gray-700' },
}

export default function Usuarios() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const [usuarios, setUsuarios]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(null)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showInfo, setShowInfo]   = useState(false)

  const cargar = useCallback(async () => {
    if (!tenant && !isSuperAdmin) return
    setLoading(true)

    const query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (!isSuperAdmin && tenant) {
      query.eq('tenant_id', tenant.id)
    }

    const { data, error: err } = await query
    if (!err) setUsuarios(data || [])
    setLoading(false)
  }, [tenant, isSuperAdmin])

  useEffect(() => { cargar() }, [cargar])

  async function cambiarRol(userId, nuevoRol) {
    setSaving(userId)
    setError('')
    setSuccess('')
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ rol: nuevoRol })
      .eq('id', userId)
    if (err) {
      setError('Error al actualizar el rol: ' + err.message)
    } else {
      setSuccess('Rol actualizado correctamente.')
      cargar()
    }
    setSaving(null)
  }

  async function toggleActivo(userId, activo) {
    setSaving(userId)
    setError('')
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ activo: !activo })
      .eq('id', userId)
    if (!err) cargar()
    setSaving(null)
  }

  const rolesPermitidos = isSuperAdmin
    ? ['operador', 'admin', 'superadmin']
    : ['operador', 'admin']

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
        <button
          className="btn-secondary text-sm"
          onClick={() => setShowInfo(s => !s)}
        >
          {showInfo ? 'Ocultar ayuda' : '¿Cómo agregar usuarios?'}
        </button>
      </div>

      {/* Mensaje de cómo agregar usuarios */}
      {showInfo && (
        <div className="card border border-brand-200 bg-brand-50">
          <h3 className="font-semibold text-brand-900 mb-3">📋 Cómo agregar un nuevo usuario</h3>
          <ol className="text-sm text-brand-800 space-y-2 list-decimal list-inside">
            <li>Ingrese al panel de <strong>Supabase → Authentication → Users</strong></li>
            <li>Haga clic en <strong>"Add user" → "Create new user"</strong></li>
            <li>Ingrese el correo y una contraseña temporal del nuevo usuario</li>
            <li>Copie el <strong>UUID</strong> del usuario recién creado</li>
            <li>Ejecute en el <strong>SQL Editor</strong> de Supabase:</li>
          </ol>
          <pre className="mt-3 bg-brand-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto">
{`INSERT INTO public.user_profiles (id, tenant_id, email, nombre, rol)
VALUES (
  'UUID-DEL-USUARIO',
  '${tenant?.id || 'UUID-DEL-TENANT'}',
  'correo@empresa.com',
  'Nombre del Usuario',
  'operador'  -- o 'admin'
);`}
          </pre>
          <p className="mt-2 text-xs text-brand-600">
            El usuario recibirá un correo de verificación de Supabase y podrá ingresar con sus credenciales.
          </p>
        </div>
      )}

      {/* Mensajes */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      {/* Lista */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {loading ? 'Cargando…' : `${usuarios.length} usuario${usuarios.length !== 1 ? 's' : ''} registrado${usuarios.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando…</div>
        ) : usuarios.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-4xl mb-2">👥</p>
            <p>No hay usuarios registrados.</p>
            <button
              className="mt-3 text-sm text-brand-600 underline"
              onClick={() => setShowInfo(true)}
            >
              Ver instrucciones para agregar usuarios
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {usuarios.map(u => {
              const esYo = u.id === profile?.id
              const rolInfo = ROL_LABEL[u.rol] || { label: u.rol, color: 'bg-gray-100 text-gray-600' }
              return (
                <div
                  key={u.id}
                  className={`border rounded-xl p-4 flex items-center gap-4 ${
                    u.activo !== false ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(u.nombre || u.email || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">
                        {u.nombre || u.email}
                        {esYo && <span className="ml-1 text-xs text-brand-500">(tú)</span>}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rolInfo.color}`}>
                        {rolInfo.label}
                      </span>
                      {u.activo === false && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                  </div>

                  {/* Cambiar rol */}
                  {!esYo && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        value={u.rol}
                        disabled={saving === u.id}
                        onChange={e => cambiarRol(u.id, e.target.value)}
                        className="input-field text-xs py-1.5 w-36"
                      >
                        {rolesPermitidos.map(r => (
                          <option key={r} value={r}>{ROL_LABEL[r]?.label || r}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => toggleActivo(u.id, u.activo !== false)}
                        disabled={saving === u.id}
                        className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors border ${
                          u.activo !== false
                            ? 'text-red-600 hover:bg-red-50 border-red-200'
                            : 'text-green-600 hover:bg-green-50 border-green-200'
                        }`}
                      >
                        {saving === u.id ? '…' : u.activo !== false ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
