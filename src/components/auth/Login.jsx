import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

// Imagen de fondo: edificio corporativo moderno (Unsplash - uso libre)
const BG_IMAGE = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [modo, setModo]         = useState('login') // 'login' | 'reset'
  const [resetEnviado, setResetEnviado] = useState(false)
  const [resetEmail, setResetEmail]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError('Credenciales incorrectas. Verifique su correo y contraseña.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/perfil?reset=true`,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setResetEnviado(true)
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">

      {/* Imagen de fondo */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${BG_IMAGE}')` }}
      />

      {/* Overlay degradado azul navy */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/75 via-brand-800/65 to-brand-700/70" />

      {/* Partículas decorativas */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
      </div>

      {/* Contenido principal */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/logo-blanco.png"
              alt="CNL Craniley Compliance Services"
              className="h-72 w-auto drop-shadow-2xl"
            />
          </div>
          <div className="space-y-1">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
              Plataforma de Cumplimiento ALA/CFT
            </p>
            <div className="w-12 h-0.5 bg-white/30 mx-auto mt-2" />
          </div>
        </div>

        {/* Card */}
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">

          {/* Banda superior */}
          <div className="bg-white/10 px-8 py-4 border-b border-white/10">
            <h2 className="text-white font-semibold text-lg">
              {modo === 'login' ? 'Iniciar sesión' : 'Recuperar contraseña'}
            </h2>
            <p className="text-white/50 text-xs mt-0.5">
              {modo === 'login' ? 'Acceso exclusivo para usuarios autorizados' : 'Le enviaremos un enlace a su correo'}
            </p>
          </div>

          <div className="p-8 space-y-5">

            {/* ── MODO LOGIN ── */}
            {modo === 'login' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-white/70 text-xs font-semibold uppercase tracking-wider mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">✉</span>
                    <input type="email"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 pl-9 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
                      placeholder="usuario@empresa.com"
                      value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-white/70 text-xs font-semibold uppercase tracking-wider">Contraseña</label>
                    <button type="button" onClick={() => { setModo('reset'); setResetEmail(email); setError('') }}
                      className="text-white/40 hover:text-white/70 text-xs transition-colors underline">
                      ¿Olvidó su contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">🔑</span>
                    <input type={showPass ? 'text' : 'password'}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 pl-9 pr-10 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
                      placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 text-xs transition-colors">
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                {error && <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-sm text-red-200">⚠ {error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full bg-white text-brand-900 font-bold py-3 rounded-xl hover:bg-white/90 active:scale-95 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed mt-2">
                  {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Ingresando…</span> : 'Ingresar a la plataforma'}
                </button>
              </form>
            )}

            {/* ── MODO RESET ── */}
            {modo === 'reset' && !resetEnviado && (
              <form onSubmit={handleReset} className="space-y-4">
                <p className="text-white/60 text-sm">Ingrese su correo y le enviaremos un enlace para restablecer su contraseña.</p>
                <div>
                  <label className="block text-white/70 text-xs font-semibold uppercase tracking-wider mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">✉</span>
                    <input type="email"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 pl-9 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all"
                      placeholder="usuario@empresa.com"
                      value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
                  </div>
                </div>
                {error && <div className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 text-sm text-red-200">⚠ {error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full bg-white text-brand-900 font-bold py-3 rounded-xl hover:bg-white/90 active:scale-95 transition-all shadow-lg disabled:opacity-60 mt-2">
                  {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
                </button>
                <button type="button" onClick={() => { setModo('login'); setError('') }}
                  className="w-full text-white/40 hover:text-white/60 text-sm transition-colors">
                  ← Volver al inicio de sesión
                </button>
              </form>
            )}

            {/* ── RESET ENVIADO ── */}
            {modo === 'reset' && resetEnviado && (
              <div className="text-center space-y-4 py-4">
                <div className="text-4xl">📧</div>
                <p className="text-white font-semibold">Correo enviado</p>
                <p className="text-white/60 text-sm">Revise su bandeja de entrada en <strong className="text-white/80">{resetEmail}</strong> y haga clic en el enlace para restablecer su contraseña.</p>
                <button onClick={() => { setModo('login'); setResetEnviado(false); setError('') }}
                  className="text-white/40 hover:text-white/60 text-sm transition-colors underline">
                  Volver al inicio de sesión
                </button>
              </div>
            )}

            {modo === 'login' && (
              <p className="text-center text-white/30 text-xs">¿Problemas de acceso? Contacte a su administrador CNL.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-white/25 text-xs">
            © {new Date().getFullYear()} CNL Craniley Compliance Services
          </p>
          <p className="text-white/20 text-xs">
            Plataforma regulada bajo Ley 7786 — SUGEF Costa Rica
          </p>
        </div>
      </div>
    </div>
  )
}
