import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function SetPassword() {
  const navigate = useNavigate()
  const { setNeedsPasswordSetup } = useAuth()
  const [nombre, setNombre]       = useState('')
  const [password, setPassword]   = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [listo, setListo]         = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/login', { replace: true })
        return
      }
      // Pre-rellenar nombre si ya existe en el perfil
      const uid = data.session.user.id
      supabase.from('user_profiles').select('nombre').eq('id', uid).single()
        .then(({ data: prof }) => {
          if (prof?.nombre) setNombre(prof.nombre)
        })
    })
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!nombre.trim()) {
      setError('Por favor ingrese su nombre completo.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      // 1. Establecer contraseña
      const { error: errPwd } = await supabase.auth.updateUser({ password })
      if (errPwd) throw errPwd

      // 2. Guardar nombre en user_profiles
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('user_profiles')
          .update({ nombre: nombre.trim() })
          .eq('id', user.id)
      }

      setListo(true)
      setNeedsPasswordSetup(false)
      setTimeout(() => navigate('/', { replace: true }), 2000)
    } catch (err) {
      setError('Error al activar la cuenta: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1247]"
      style={{
        backgroundImage: 'url(/bg-login.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}>
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/20">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src="/logo-cnl.png" alt="CNL Craniley" className="h-16 object-contain"
            onError={e => { e.target.style.display = 'none' }} />
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-2">
          Bienvenido a CNL Compliance
        </h2>
        <p className="text-white/70 text-center text-sm mb-6">
          Complete su perfil y establezca su contraseña para activar su cuenta
        </p>

        {listo ? (
          <div className="bg-green-500/20 border border-green-400 text-green-200 rounded-lg p-4 text-center">
            ✅ Cuenta activada. Ingresando a la plataforma…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Nombre completo
              </label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Su nombre y apellidos"
                required
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                placeholder="Repite la contraseña"
                required
                className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/60"
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400 text-red-200 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-[#0a1247] font-bold py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-50 mt-2"
            >
              {loading ? 'Activando cuenta…' : 'Activar mi cuenta'}
            </button>
          </form>
        )}

        <p className="text-white/40 text-xs text-center mt-6">
          © 2026 CNL Craniley Compliance Services
        </p>
      </div>
    </div>
  )
}
