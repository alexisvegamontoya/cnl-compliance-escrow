import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CambiarClaveObligatoria({ onCambiada }) {
  const [nueva, setNueva]       = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSaving(true)
    try {
      // 1. Actualizar la contraseña
      const { error: updateError } = await supabase.auth.updateUser({
        password: nueva,
        data: { must_change_password: false },
      })
      if (updateError) throw updateError

      // 2. Notificar al padre para redirigir al dashboard
      onCambiada?.()
    } catch (err) {
      setError(err.message || 'Error al cambiar la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-600 mb-4">
            <span className="text-white text-2xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cambio de contraseña requerido</h1>
          <p className="text-gray-500 text-sm mt-2">
            Por seguridad, debe establecer una nueva contraseña antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
            ⚠ Su contraseña actual es provisional. Establezca una contraseña personal segura para proteger su cuenta.
          </div>

          <div>
            <label className="label">Nueva contraseña *</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="Mínimo 8 caracteres"
                value={nueva}
                onChange={e => setNueva(e.target.value)}
                required
                autoFocus
              />
              <button type="button" tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPass(s => !s)}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Use letras, números y símbolos para mayor seguridad.</p>
          </div>

          <div>
            <label className="label">Confirmar nueva contraseña *</label>
            <input
              type={showPass ? 'text' : 'password'}
              className="input-field"
              placeholder="Repita la contraseña"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !nueva || !confirmar}
            className="btn-primary w-full"
          >
            {saving ? 'Guardando…' : '✅ Establecer nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
