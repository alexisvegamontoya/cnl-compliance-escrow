import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)

  useEffect(() => {
    // Verificar que hay una sesión activa (del link de invitación)
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) {
      setError('Error al establecer la contraseña: ' + err.message)
      return
    }

    setListo(true)
    setTimeout(() => navigate('/', { replace: true }), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0e6e]"
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
          Establece tu contraseña para activar tu cuenta
        </p>

        {listo ? (
          <div className="bg-green-500/20 border border-green-400 text-green-200 rounded-lg p-4 text-center">
            ✅ Contraseña configurada. Ingresando a la plataforma…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full bg-white text-[#0e0e6e] font-bold py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-50 mt-2"
            >
              {loading ? 'Guardando…' : 'Activar mi cuenta'}
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
