import { useState, useEffect, useCallback } from 'react'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'

const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || ''
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ''
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || ''

const EMPTY = {
  tipo: 'denuncia',
  descripcion: '',
  fecha_hecho: '',
  area_relacionada: '',
  nombre_denunciante: '',
  es_confidencial: false,
}

const TIPO_LABEL = { denuncia: 'Denuncia', senal_alerta: 'Señal de alerta' }
const ESTADO_CONFIG = {
  pendiente:   { label: 'Pendiente',    color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  en_revision: { label: 'En revisión',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  resuelto:    { label: 'Resuelto',     color: 'bg-green-100 text-green-700 border-green-200' },
  archivado:   { label: 'Archivado',    color: 'bg-gray-100 text-gray-500 border-gray-200' },
}

// Copia permanente para CNL; el destinatario principal es el oficial de
// cumplimiento del sujeto obligado al que se asigna la denuncia.
const EMAIL_CNL = 'canaldedenuncias@cnl.cr'

async function enviarEmail(denuncia, tenantNombre, emailOficial) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) return

  const destino = emailOficial?.trim()
    ? `${emailOficial.trim()}, ${EMAIL_CNL}`
    : EMAIL_CNL

  try {
    const { default: emailjs } = await import('@emailjs/browser')
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email:    destino,
        tipo:        TIPO_LABEL[denuncia.tipo],
        sujeto:      tenantNombre || 'No especificado',
        descripcion: denuncia.descripcion,
        fecha_hecho: denuncia.fecha_hecho || 'No indicada',
        area:        denuncia.area_relacionada || 'No indicada',
        confidencial: denuncia.es_confidencial ? 'SÍ — Reporte confidencial' : 'No',
        denunciante:  denuncia.es_confidencial ? '(Confidencial)' : (denuncia.nombre_denunciante || 'Anónimo'),
        fecha_envio:  new Date().toLocaleString('es-CR'),
      },
      EMAILJS_PUBLIC_KEY
    )
  } catch (err) {
    console.warn('Email no enviado (EmailJS no configurado):', err.message)
  }
}

// ─── Formulario de envío ───────────────────────────────────────────────────────
function FormularioDenuncia({ tenant, opciones, profile, onEnviado }) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [exito, setExito]   = useState(false)
  // Sujeto obligado al que se asigna la denuncia. Arranca en el activo, pero
  // se elige explícitamente porque define quién la atiende y a quién le llega.
  const [tenantId, setTenantId] = useState(tenant?.id || '')

  const tenantElegido = opciones.find(t => t.id === tenantId) || null

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  async function enviar(e) {
    e.preventDefault()
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria.'); return }
    if (!tenantId) { setError('Seleccione el sujeto obligado al que corresponde el reporte.'); return }
    setSaving(true)
    setError('')

    const payload = {
      tenant_id:         tenantId,
      tipo:              form.tipo,
      descripcion:       form.descripcion.trim(),
      fecha_hecho:       form.fecha_hecho || null,
      area_relacionada:  form.area_relacionada.trim() || null,
      nombre_denunciante: form.es_confidencial ? null : (form.nombre_denunciante.trim() || null),
      es_confidencial:   form.es_confidencial,
      reportado_por:     profile?.id || null,
    }

    const { error: err } = await supabase.from('denuncias').insert(payload)
    if (err) { setError(clasificarError(err)); setSaving(false); return }

    // Notificar al oficial de cumplimiento del sujeto obligado elegido
    await enviarEmail(payload, tenantElegido?.nombre, tenantElegido?.email_oficial_cumplimiento)

    setExito(true)
    setForm(EMPTY)
    setSaving(false)
    if (onEnviado) onEnviado()
  }

  if (exito) {
    return (
      <div className="card py-12 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h3 className="text-xl font-bold text-gray-800">Reporte enviado correctamente</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Su reporte ha sido registrado y notificado al equipo de cumplimiento de CNL Craniley.
          {form.es_confidencial && ' Su identidad se mantiene en estricta confidencialidad.'}
        </p>
        <button className="btn-primary" onClick={() => setExito(false)}>Enviar otro reporte</button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="card space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Nuevo reporte</h2>
        <p className="text-sm text-gray-500 mt-1">
          Todos los reportes son tratados con discreción. Si marca "Confidencial", su nombre no será registrado.
        </p>
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />

      {/* Sujeto obligado al que se asigna */}
      <div>
        <label className="label">Sujeto obligado *</label>
        <select
          className="input-field"
          value={tenantId}
          onChange={e => setTenantId(e.target.value)}
          required
        >
          <option value="">— Seleccione el sujeto obligado —</option>
          {opciones.map(t => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        {tenantElegido && (
          <p className="text-xs text-gray-400 mt-1">
            {tenantElegido.email_oficial_cumplimiento
              ? `Se notificará al oficial de cumplimiento: ${tenantElegido.email_oficial_cumplimiento}`
              : '⚠ Este sujeto obligado no tiene oficial de cumplimiento registrado; el reporte llegará solo a CNL.'}
          </p>
        )}
      </div>

      {/* Tipo */}
      <div>
        <label className="label">Tipo de reporte *</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {[
            { val: 'denuncia',     icon: '🚨', titulo: 'Denuncia',         desc: 'Incumplimiento, fraude o conducta ilegal' },
            { val: 'senal_alerta', icon: '⚠️', titulo: 'Señal de alerta',  desc: 'Situación sospechosa o irregular' },
          ].map(op => (
            <button key={op.val} type="button"
              onClick={() => set('tipo', op.val)}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${form.tipo === op.val ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className="text-2xl flex-shrink-0">{op.icon}</span>
              <div>
                <p className={`font-semibold text-sm ${form.tipo === op.val ? 'text-brand-700' : 'text-gray-800'}`}>{op.titulo}</p>
                <p className="text-xs text-gray-400 mt-0.5">{op.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Descripción */}
      <div>
        <label className="label">Descripción detallada *</label>
        <textarea className="input-field" rows={5}
          placeholder="Describa los hechos con el mayor detalle posible: qué ocurrió, cuándo, quiénes están involucrados, evidencia disponible…"
          value={form.descripcion}
          onChange={e => set('descripcion', e.target.value)}
          required />
      </div>

      {/* Fecha y área */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha aproximada del hecho</label>
          <input type="date" className="input-field"
            value={form.fecha_hecho}
            onChange={e => set('fecha_hecho', e.target.value)} />
        </div>
        <div>
          <label className="label">Área o departamento relacionado</label>
          <input className="input-field" placeholder="Ej: Contabilidad, Operaciones…"
            value={form.area_relacionada}
            onChange={e => set('area_relacionada', e.target.value)} />
        </div>
      </div>

      {/* Confidencialidad */}
      <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 rounded text-brand-600 mt-0.5 flex-shrink-0"
            checked={form.es_confidencial}
            onChange={e => set('es_confidencial', e.target.checked)} />
          <div>
            <p className="font-semibold text-sm text-gray-800">🔒 Reporte confidencial</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Si marca esta opción, su nombre no será registrado ni divulgado. Solo el equipo de cumplimiento de CNL Craniley tendrá acceso a este reporte.
            </p>
          </div>
        </label>

        {!form.es_confidencial && (
          <div>
            <label className="label">Su nombre (opcional)</label>
            <input className="input-field" placeholder="Puede dejarlo en blanco si prefiere el anonimato"
              value={form.nombre_denunciante}
              onChange={e => set('nombre_denunciante', e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Enviando…' : '📨 Enviar reporte'}
        </button>
      </div>
    </form>
  )
}

// ─── Vista de superadmin ───────────────────────────────────────────────────────
function VistaSuperAdmin() {
  const [denuncias, setDenuncias] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [detalleId, setDetalleId]       = useState(null)
  const [notasEdit, setNotasEdit]       = useState('')
  const [estadoEdit, setEstadoEdit]     = useState('')
  const [saving, setSaving]             = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('denuncias')
      .select('*, tenants(nombre)')
      .order('created_at', { ascending: false })
    setDenuncias(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function abrirDetalle(d) {
    if (detalleId === d.id) { setDetalleId(null); return }
    setDetalleId(d.id)
    setNotasEdit(d.notas_internas || '')
    setEstadoEdit(d.estado)
  }

  async function guardarDetalle(id) {
    setSaving(true)
    await supabase.from('denuncias').update({
      estado: estadoEdit,
      notas_internas: notasEdit,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await load()
    setSaving(false)
  }

  const filtradas = denuncias.filter(d => {
    const matchEstado = !filtroEstado || d.estado === filtroEstado
    const matchTipo   = !filtroTipo   || d.tipo   === filtroTipo
    return matchEstado && matchTipo
  })

  const contadores = {
    total:       denuncias.length,
    pendiente:   denuncias.filter(d => d.estado === 'pendiente').length,
    en_revision: denuncias.filter(d => d.estado === 'en_revision').length,
    resuelto:    denuncias.filter(d => d.estado === 'resuelto').length,
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',       val: contadores.total,       color: 'text-brand-600', bg: 'bg-brand-50',  filter: '' },
          { label: 'Pendientes',  val: contadores.pendiente,   color: 'text-yellow-600',bg: 'bg-yellow-50', filter: 'pendiente' },
          { label: 'En revisión', val: contadores.en_revision, color: 'text-blue-600',  bg: 'bg-blue-50',   filter: 'en_revision' },
          { label: 'Resueltos',   val: contadores.resuelto,    color: 'text-green-600', bg: 'bg-green-50',  filter: 'resuelto' },
        ].map(r => (
          <button key={r.label} onClick={() => setFiltroEstado(r.filter === filtroEstado ? '' : r.filter)}
            className={`card text-center cursor-pointer hover:shadow-md transition-all ${r.bg} ${filtroEstado === r.filter && r.filter ? 'ring-2 ring-brand-500' : ''}`}>
            <p className={`text-2xl font-bold ${r.color}`}>{r.val}</p>
            <p className="text-xs text-gray-500 mt-0.5">{r.label}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <select className="input-field w-44" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="denuncia">Denuncias</option>
          <option value="senal_alerta">Señales de alerta</option>
        </select>
        <select className="input-field w-44" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card py-10 text-center text-gray-400">Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card py-10 text-center text-gray-400">No hay reportes que coincidan.</div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(d => {
            const esDetalle = detalleId === d.id
            const estado = ESTADO_CONFIG[d.estado]
            return (
              <div key={d.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-4 flex items-start gap-4">
                  <div className="text-2xl flex-shrink-0">{d.tipo === 'denuncia' ? '🚨' : '⚠️'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm">{TIPO_LABEL[d.tipo]}</span>
                      {d.es_confidencial && (
                        <span className="px-2 py-0.5 bg-brand-100 text-brand-800 text-xs font-bold rounded-full">🔒 Confidencial</span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${estado.color}`}>{estado.label}</span>
                      {d.tenants?.nombre && (
                        <span className="px-2 py-0.5 bg-brand-50 text-brand-600 text-xs rounded-full">{d.tenants.nombre}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{d.descripcion}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>📅 {new Date(d.created_at).toLocaleDateString('es-CR')}</span>
                      {d.fecha_hecho && <span>Hecho: {d.fecha_hecho}</span>}
                      {d.area_relacionada && <span>Área: {d.area_relacionada}</span>}
                      {!d.es_confidencial && d.nombre_denunciante && <span>Por: {d.nombre_denunciante}</span>}
                    </div>
                  </div>
                  <button onClick={() => abrirDetalle(d)}
                    className="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
                    {esDetalle ? 'Cerrar' : 'Gestionar'}
                  </button>
                </div>

                {/* Panel de gestión */}
                {esDetalle && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    <div className="bg-white rounded-lg p-3 border text-sm text-gray-700">
                      <p className="font-semibold text-gray-500 text-xs mb-1">DESCRIPCIÓN COMPLETA</p>
                      <p>{d.descripcion}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Estado</label>
                        <select className="input-field" value={estadoEdit} onChange={e => setEstadoEdit(e.target.value)}>
                          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Notas internas (solo visible para superadmin)</label>
                      <textarea className="input-field" rows={3}
                        placeholder="Acciones tomadas, seguimiento, resolución…"
                        value={notasEdit}
                        onChange={e => setNotasEdit(e.target.value)} />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => guardarDetalle(d.id)} disabled={saving}
                        className="btn-primary text-sm">
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function CanalDenuncias() {
  const { tenant, tenantsDisponibles, profile, isSuperAdmin } = useAuth()
  const [tab, setTab] = useState(isSuperAdmin ? 'bandeja' : 'nuevo')
  const [refresh, setRefresh] = useState(0)
  const [todosTenants, setTodosTenants] = useState([])

  // El superadmin puede asignar la denuncia a cualquier sujeto obligado;
  // el resto, solo a los suyos.
  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('id, nombre, email_oficial_cumplimiento')
        .order('nombre')
        .then(({ data }) => setTodosTenants(data || []))
    }
  }, [isSuperAdmin])

  const opciones = isSuperAdmin ? todosTenants : (tenantsDisponibles || [])

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Canal de Denuncias</h1>
          <p className="text-gray-500 text-sm mt-1">
            Reporte conductas irregulares o señales de alerta de forma segura y confidencial.
          </p>
        </div>
        {/* Banner confidencialidad */}
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2 text-sm text-brand-700">
          <span>🔒</span>
          <span>Los reportes confidenciales son gestionados exclusivamente por CNL Craniley</span>
        </div>
      </div>

      {/* Tabs (superadmin ve bandeja + nuevo) */}
      {isSuperAdmin && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: 'bandeja', label: '📥 Bandeja de reportes' },
            { id: 'nuevo',   label: '✏️ Nuevo reporte' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Contenido */}
      {tab === 'nuevo' && (
        <FormularioDenuncia
          tenant={tenant}
          opciones={opciones}
          profile={profile}
          onEnviado={() => setRefresh(r => r + 1)}
        />
      )}

      {tab === 'bandeja' && isSuperAdmin && (
        <VistaSuperAdmin key={refresh} />
      )}
    </div>
  )
}
