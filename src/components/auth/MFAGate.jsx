import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

/**
 * MFAGate — bloquea el acceso a la app para roles admin
 * hasta que completen el enrollment o el challenge MFA.
 *
 * Muestra una de dos pantallas:
 *  - ENROLL: El admin no tiene MFA inscrito → QR + código de verificación
 *  - CHALLENGE: Tiene MFA pero entró con sólo contraseña (AAL1) → pedir código TOTP
 */
export default function MFAGate() {
  const { needsMFAEnroll, setNeedsMFAEnroll, setNeedsMFAChallenge, signOut } = useAuth()

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0a1247 0%, #1b2a6b 60%, #060b2e 100%)',
      }}
    >
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 w-full max-w-md shadow-2xl border border-white/20">
        <div className="flex justify-center mb-6">
          <img
            src="/logo-cnl.png"
            alt="CNL Craniley"
            className="h-14 object-contain"
            onError={e => { e.target.style.display = 'none' }}
          />
        </div>

        {needsMFAEnroll ? (
          <EnrollPanel onDone={() => setNeedsMFAEnroll(false)} onSignOut={signOut} />
        ) : (
          <ChallengePanel onDone={() => setNeedsMFAChallenge(false)} onSignOut={signOut} />
        )}
      </div>
    </div>
  )
}

/* ─── Enrollment Panel ─────────────────────────────────────────────────── */
function EnrollPanel({ onDone, onSignOut }) {
  const [step, setStep]           = useState('init') // init | qr | verify | done
  const [enrollData, setEnrollData] = useState(null)
  const [factorId, setFactorId]   = useState(null)
  const [code, setCode]           = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function startEnroll() {
    setLoading(true)
    setError('')
    try {
      // Limpiar factores no verificados previos para evitar conflicto
      const { data: existing } = await supabase.auth.mfa.listFactors()
      const pendientes = existing?.totp?.filter(f => f.status === 'unverified') || []
      for (const f of pendientes) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'CNL Compliance',
        friendlyName: 'Autenticador CNL',
      })
      if (err) throw err
      setEnrollData(data)
      setFactorId(data.id)
      setStep('qr')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyEnroll() {
    if (code.length !== 6) { setError('Ingrese los 6 dígitos del código.'); return }
    setLoading(true)
    setError('')
    try {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
      const { error: err } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      })
      if (err) throw err
      setStep('done')
      setTimeout(onDone, 1500)
    } catch (e) {
      setError('Código incorrecto o expirado. Inténtelo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-white font-semibold text-lg">¡2FA activado correctamente!</p>
        <p className="text-white/70 text-sm mt-2">Ingresando a la plataforma…</p>
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400 mb-3">
          <span className="text-2xl">🔐</span>
        </div>
        <h2 className="text-xl font-bold text-white">Autenticación en dos pasos requerida</h2>
        <p className="text-white/70 text-sm mt-1">
          Su rol de administrador requiere activar 2FA antes de acceder.
        </p>
      </div>

      {step === 'init' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-400/40 rounded-lg p-3 text-sm text-amber-200">
            <strong>Política de seguridad:</strong> Todos los administradores deben
            proteger su cuenta con una app autenticadora (Google Authenticator,
            Authy, Microsoft Authenticator, etc.).
          </div>
          {error && (
            <div className="bg-red-500/20 border border-red-400 text-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={startEnroll}
            disabled={loading}
            className="w-full bg-white text-[#0a1247] font-bold py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-50"
          >
            {loading ? 'Iniciando…' : 'Activar autenticación 2FA'}
          </button>
          <button
            onClick={onSignOut}
            className="w-full text-white/50 text-sm hover:text-white/80 transition py-2"
          >
            Cerrar sesión
          </button>
        </div>
      )}

      {step === 'qr' && enrollData && (
        <div className="space-y-4">
          <p className="text-white/80 text-sm text-center">
            Escanee este código QR con su app autenticadora:
          </p>
          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-xl">
              <img
                src={enrollData.totp.qr_code}
                alt="Código QR para autenticador 2FA"
                className="w-44 h-44"
              />
            </div>
          </div>
          <div className="bg-white/5 border border-white/20 rounded-lg p-3">
            <p className="text-white/50 text-xs mb-1">Clave manual:</p>
            <p className="text-white font-mono text-sm tracking-widest break-all">
              {enrollData.totp.secret}
            </p>
          </div>
          <button
            onClick={() => setStep('verify')}
            className="w-full bg-white text-[#0a1247] font-bold py-3 rounded-lg hover:bg-white/90 transition"
          >
            Ya lo escaneé → Verificar código
          </button>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-4">
          <p className="text-white/80 text-sm text-center">
            Ingrese el código de 6 dígitos que muestra su app autenticadora:
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.5em] placeholder-white/30 focus:outline-none focus:border-white/60"
          />
          {error && (
            <div className="bg-red-500/20 border border-red-400 text-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={verifyEnroll}
            disabled={loading || code.length !== 6}
            className="w-full bg-white text-[#0a1247] font-bold py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-50"
          >
            {loading ? 'Verificando…' : 'Confirmar y activar 2FA'}
          </button>
          <button
            onClick={() => setStep('qr')}
            className="w-full text-white/50 text-sm hover:text-white/80 transition py-1"
          >
            ← Volver al QR
          </button>
        </div>
      )}
    </>
  )
}

/* ─── Challenge Panel ──────────────────────────────────────────────────── */
function ChallengePanel({ onDone, onSignOut }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  async function handleChallenge() {
    if (code.length !== 6) { setError('Ingrese los 6 dígitos del código.'); return }
    setLoading(true)
    setError('')
    try {
      // Obtener el factor verificado
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const factor = factors?.totp?.find(f => f.status === 'verified')
      if (!factor) throw new Error('No se encontró factor MFA.')

      const { data: challenge, error: errC } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (errC) throw errC

      const { error: errV } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      })
      if (errV) throw errV

      setDone(true)
      setTimeout(onDone, 1200)
    } catch {
      setError('Código incorrecto o expirado. Inténtelo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-white font-semibold text-lg">Acceso verificado</p>
        <p className="text-white/70 text-sm mt-2">Ingresando a la plataforma…</p>
      </div>
    )
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 border border-blue-400 mb-3">
          <span className="text-2xl">🔑</span>
        </div>
        <h2 className="text-xl font-bold text-white">Verificación de dos pasos</h2>
        <p className="text-white/70 text-sm mt-1">
          Ingrese el código de su app autenticadora para continuar.
        </p>
      </div>

      <div className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && handleChallenge()}
          placeholder="000000"
          autoFocus
          className="w-full bg-white/10 border border-white/30 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.5em] placeholder-white/30 focus:outline-none focus:border-white/60"
        />
        {error && (
          <div className="bg-red-500/20 border border-red-400 text-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
        <button
          onClick={handleChallenge}
          disabled={loading || code.length !== 6}
          className="w-full bg-white text-[#0a1247] font-bold py-3 rounded-lg hover:bg-white/90 transition disabled:opacity-50"
        >
          {loading ? 'Verificando…' : 'Verificar código'}
        </button>
        <button
          onClick={onSignOut}
          className="w-full text-white/50 text-sm hover:text-white/80 transition py-2"
        >
          Cerrar sesión
        </button>
      </div>
    </>
  )
}
