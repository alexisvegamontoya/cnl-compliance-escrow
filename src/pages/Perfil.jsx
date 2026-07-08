import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function Perfil() {
  const { profile, session, tenant } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isReset = searchParams.get('reset') === 'true'

  // ── Estado perfil ──
  const [form, setForm]       = useState({ nombre: '', email: '', telefono: '', cargo: '' })
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  // ── Estado cambio contraseña ──
  const [passForm, setPassForm]       = useState({ nueva: '', confirmar: '' })
  const [showPass, setShowPass]       = useState(false)
  const [savingPass, setSavingPass]   = useState(false)
  const [passMsg, setPassMsg]         = useState(null)
  const [tab, setTab]                 = useState(isReset ? 'password' : 'perfil')

  // ── Estado MFA ──
  const [mfaFactors, setMfaFactors]   = useState([])
  const [enrollData, setEnrollData]   = useState(null)
  const [verifyCode, setVerifyCode]   = useState('')
  const [mfaMsg, setMfaMsg]           = useState(null)
  const [loadingMfa, setLoadingMfa]   = useState(false)

  // ── Cargar perfil ──
  useEffect(() => {
    if (!profile) return
    setForm({
      nombre:   profile.nombre   || '',
      email:    profile.email    || session?.user?.email || '',
      telefono: profile.telefono || '',
      cargo:    profile.cargo    || '',
    })
  }, [profile, session])

  // ── Cargar factores MFA ──
  useEffect(() => { cargarFactores() }, [])

  async function cargarFactores() {
    const { data } = await supabase.auth.mfa.listFactors()
    setMfaFactors(data?.totp || [])
  }

  async function iniciarEnroll() {
    setMfaMsg(null)
    setLoadingMfa(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setLoadingMfa(false)
    if (error) { setMfaMsg({ tipo: 'err', texto: error.message }); return }
    setEnrollData(data)
  }

  async function verificarMfa(e) {
    e.preventDefault()
    setMfaMsg(null)
    setLoadingMfa(true)
    try {
      const { data: challenge, error: e1 } = await supabase.auth.mfa.challenge({ factorId: enrollData.id })
      if (e1) throw e1
      const { error: e2 } = await supabase.auth.mfa.verify({
        factorId: enrollData.id,
        challengeId: challenge.id,
        code: verifyCode.replace(/\s/g, ''),
      })
      if (e2) throw e2
      setMfaMsg({ tipo: 'ok', texto: 'Autenticación de dos factores activada exitosamente.' })
      setEnrollData(null)
      setVerifyCode('')
      cargarFactores()
    } catch (err) {
      setMfaMsg({ tipo: 'err', texto: 'Código incorrecto o expirado. Intente nuevamente.' })
    } finally {
      setLoadingMfa(false)
    }
  }

  async function desactivarMfa(factorId) {
    if (!confirm('¿Desactivar autenticación de dos factores? Su cuenta quedará menos protegida.')) return
    await supabase.auth.mfa.unenroll({ factorId })
    setMfaMsg({ tipo: 'ok', texto: 'MFA desactivado.' })
    cargarFactores()
  }

  // ── Guardar perfil ──
  async function guardarPerfil(e) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('user_profiles')
      .update({
        nombre:   form.nombre,
        email:    form.email,
        telefono: form.telefono,
        cargo:    form.cargo,
      })
      .eq('id', session.user.id)

    setSaving(false)
    if (error) { setMsg({ tipo: 'err', texto: error.message }); return }
    setMsg({ tipo: 'ok', texto: 'Perfil actualizado correctamente.' })
  }

  // ── Cambiar contraseña ──
  async function cambiarPassword(e) {
    e.preventDefault()
    setPassMsg(null)
    if (passForm.nueva !== passForm.confirmar) {
      setPassMsg({ tipo: 'err', texto: 'Las contraseñas no coinciden.' })
      return
    }
    if (passForm.nueva.length < 8) {
      setPassMsg({ tipo: 'err', texto: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    setSavingPass(true)
    const { error } = await supabase.auth.updateUser({ password: passForm.nueva })
    setSavingPass(false)
    if (error) { setPassMsg({ tipo: 'err', texto: error.message }); return }
    setPassMsg({ tipo: 'ok', texto: 'Contraseña actualizada. Ya puede usar su nueva contraseña.' })
    setPassForm({ nueva: '', confirmar: '' })
    // Limpiar el ?reset=true de la URL
    if (isReset) navigate('/perfil', { replace: true })
  }

  const rolLabel = {
    superadmin: '⭐ Super Administrador',
    admin:      '🛡 Administrador',
    usuario:    '👤 Usuario',
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Mi Perfil</h1>
        <p className="text-gray-500 text-sm mt-1">Administre su información personal y credenciales de acceso.</p>
      </div>

      {/* Banner reset */}
      {isReset && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex gap-3 items-start">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="text-brand-900 font-semibold text-sm">Establezca su nueva contraseña</p>
            <p className="text-brand-700 text-xs mt-0.5">Ha llegado desde el enlace de recuperación. Ingrese y confirme su nueva contraseña.</p>
          </div>
        </div>
      )}

      {/* Tarjeta de identidad */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
        <div className="w-16 h-16 rounded-full bg-brand-700 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
          {form.nombre?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-lg truncate">{form.nombre || 'Sin nombre'}</p>
          <p className="text-gray-500 text-sm truncate">{form.email || session?.user?.email}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs bg-brand-100 text-brand-800 px-2 py-0.5 rounded-full font-medium">
              {rolLabel[profile?.rol] || profile?.rol}
            </span>
            {tenant && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {tenant.nombre}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { key: 'perfil',   label: '👤 Datos personales' },
          { key: 'password', label: '🔑 Contraseña' },
          { key: 'mfa',      label: `🛡 2FA ${mfaFactors.length > 0 ? '✓' : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setMfaMsg(null); setEnrollData(null) }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: DATOS PERSONALES ── */}
      {tab === 'perfil' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-800">Información personal</h2>
            <p className="text-xs text-gray-500 mt-0.5">Este correo se usará para recibir notificaciones del sistema.</p>
          </div>
          <form onSubmit={guardarPerfil} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nombre completo</label>
                <input type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre completo" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Correo electrónico</label>
                <input type="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="correo@empresa.com" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Teléfono</label>
                <input type="tel"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+506 8888-8888" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Cargo</label>
                <input type="text"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                  placeholder="Oficial de Cumplimiento" />
              </div>
            </div>

            {msg && (
              <div className={`rounded-lg px-4 py-3 text-sm ${
                msg.tipo === 'ok'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {msg.tipo === 'ok' ? '✅' : '⚠'} {msg.texto}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={saving}
                className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: CONTRASEÑA ── */}
      {tab === 'password' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-800">Cambiar contraseña</h2>
            <p className="text-xs text-gray-500 mt-0.5">Use al menos 8 caracteres con letras y números.</p>
          </div>
          <form onSubmit={cambiarPassword} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nueva contraseña</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'}
                  className="w-full border border-gray-200 rounded-lg px-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={passForm.nueva} onChange={e => setPassForm(f => ({ ...f, nueva: e.target.value }))}
                  placeholder="Mínimo 8 caracteres" required minLength={8} />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Confirmar nueva contraseña</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'}
                  className="w-full border border-gray-200 rounded-lg px-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  value={passForm.confirmar} onChange={e => setPassForm(f => ({ ...f, confirmar: e.target.value }))}
                  placeholder="Repita la contraseña" required minLength={8} />
              </div>
            </div>

            {/* Indicador de fortaleza */}
            {passForm.nueva && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[8, 12, 16].map((len, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                      passForm.nueva.length >= len
                        ? i === 0 ? 'bg-red-400' : i === 1 ? 'bg-yellow-400' : 'bg-green-500'
                        : 'bg-gray-200'
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  {passForm.nueva.length < 8 ? 'Muy corta' : passForm.nueva.length < 12 ? 'Débil' : passForm.nueva.length < 16 ? 'Moderada' : 'Fuerte'}
                </p>
              </div>
            )}

            {passMsg && (
              <div className={`rounded-lg px-4 py-3 text-sm ${
                passMsg.tipo === 'ok'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {passMsg.tipo === 'ok' ? '✅' : '⚠'} {passMsg.texto}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={savingPass}
                className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                {savingPass ? 'Guardando…' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB: MFA ── */}
      {tab === 'mfa' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-semibold text-gray-800">Autenticación de dos factores (2FA)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Proteja su cuenta con un código adicional al iniciar sesión.</p>
          </div>
          <div className="p-6 space-y-4">

            {mfaMsg && (
              <div className={`rounded-lg px-4 py-3 text-sm ${
                mfaMsg.tipo === 'ok'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {mfaMsg.tipo === 'ok' ? '✅' : '⚠'} {mfaMsg.texto}
              </div>
            )}

            {/* MFA activo */}
            {mfaFactors.length > 0 && !enrollData && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <span className="text-2xl">🛡</span>
                  <div>
                    <p className="font-semibold text-green-800 text-sm">2FA activado</p>
                    <p className="text-xs text-green-600">Su cuenta está protegida con autenticación de dos factores.</p>
                  </div>
                </div>
                {mfaFactors.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">📱 App Authenticator (TOTP)</p>
                      <p className="text-xs text-gray-400">Activado el {new Date(f.created_at).toLocaleDateString('es-CR')}</p>
                    </div>
                    <button onClick={() => desactivarMfa(f.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium">
                      Desactivar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sin MFA — botón activar */}
            {mfaFactors.length === 0 && !enrollData && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="text-sm font-semibold text-yellow-800">⚠ 2FA no activado</p>
                  <p className="text-xs text-yellow-700 mt-1">Su cuenta solo está protegida por contraseña. Se recomienda activar el segundo factor, especialmente para administradores.</p>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-700">¿Cómo funciona?</p>
                  <p>1. Instale <strong>Google Authenticator</strong> o <strong>Authy</strong> en su teléfono.</p>
                  <p>2. Escanee el código QR que aparecerá a continuación.</p>
                  <p>3. Ingrese el código de 6 dígitos que genera la app para confirmar.</p>
                </div>
                <button onClick={iniciarEnroll} disabled={loadingMfa}
                  className="bg-brand-700 hover:bg-brand-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                  {loadingMfa ? 'Generando código QR…' : '🛡 Activar autenticación de dos factores'}
                </button>
              </div>
            )}

            {/* Proceso de enroll — mostrar QR */}
            {enrollData && (
              <div className="space-y-5">
                <div className="p-4 bg-brand-50 border border-brand-200 rounded-xl">
                  <p className="text-sm font-semibold text-brand-800 mb-1">Paso 1 — Escanee el código QR</p>
                  <p className="text-xs text-brand-600">Abra Google Authenticator o Authy en su teléfono y escanee este código.</p>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <div className="border-2 border-gray-200 rounded-xl p-3 bg-white"
                    dangerouslySetInnerHTML={{ __html: enrollData.totp.qr_code }} />
                  <div className="text-center">
                    <p className="text-xs text-gray-500">¿No puede escanear? Use este código manual:</p>
                    <p className="font-mono text-sm font-bold text-gray-800 mt-1 tracking-widest bg-gray-100 px-3 py-1.5 rounded-lg">
                      {enrollData.totp.secret}
                    </p>
                  </div>
                </div>

                {/* Verificar código */}
                <form onSubmit={verificarMfa} className="space-y-3">
                  <div className="p-4 bg-brand-50 border border-brand-200 rounded-xl">
                    <p className="text-sm font-semibold text-brand-800 mb-1">Paso 2 — Confirme el código</p>
                    <p className="text-xs text-brand-600">Ingrese el código de 6 dígitos que muestra la app para verificar la configuración.</p>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { setEnrollData(null); setVerifyCode('') }}
                      className="flex-1 border border-gray-200 text-gray-600 font-medium px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loadingMfa || verifyCode.length !== 6}
                      className="flex-1 bg-brand-700 hover:bg-brand-800 text-white font-semibold px-4 py-2.5 rounded-lg text-sm disabled:opacity-60">
                      {loadingMfa ? 'Verificando…' : 'Confirmar y activar'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info sesión */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        <p>🔐 <strong>ID de sesión:</strong> {session?.user?.id?.slice(0, 8)}…</p>
        <p>📧 <strong>Correo de autenticación:</strong> {session?.user?.email}</p>
        <p>📅 <strong>Último acceso:</strong> {session?.user?.last_sign_in_at
          ? new Date(session.user.last_sign_in_at).toLocaleString('es-CR')
          : 'No disponible'}</p>
      </div>
    </div>
  )
}
