// ============================================================
// Recolección KYC — lado del oficial (Fase A/B)
// Crea solicitudes de recolección (cliente nuevo o existente), envía el enlace
// al cliente y lista el estado de cada una. El portal del cliente (/portal/:token)
// y la bandeja de revisión llegan en las siguientes fases.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const ESTADO = {
  enviada:   { label: 'Enviada',    clase: 'bg-blue-50 text-blue-700' },
  en_proceso:{ label: 'En proceso', clase: 'bg-amber-50 text-amber-700' },
  recibida:  { label: 'Recibida',   clase: 'bg-violet-50 text-violet-700' },
  aprobada:  { label: 'Aprobada',   clase: 'bg-green-50 text-green-700' },
  rechazada: { label: 'Rechazada',  clase: 'bg-red-50 text-red-700' },
}

function fecha(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

export default function RecoleccionKYC() {
  const { tenant, session } = useAuth()
  const [solicitudes, setSolicitudes] = useState([])
  const [clientes, setClientes]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [copiado, setCopiado]         = useState(null)

  // Formulario de nueva solicitud
  const [tipoPersona, setTipoPersona] = useState('fisica')
  const [modo, setModo]               = useState('nuevo') // nuevo | existente
  const [clienteId, setClienteId]     = useState('')
  const [correo, setCorreo]           = useState('')
  const [nombre, setNombre]           = useState('')
  const [guardando, setGuardando]     = useState(false)

  const cargar = useCallback(async () => {
    if (!tenant?.id) { setLoading(false); return }
    setLoading(true); setError('')
    const [s, c] = await Promise.all([
      supabase.from('solicitudes_kyc').select('*').eq('tenant_id', tenant.id).order('creado_en', { ascending: false }),
      supabase.from('clientes').select('id, nombre_cliente, primer_apellido, nombre_empresa, correo_electronico, tipo_persona')
        .eq('tenant_id', tenant.id).order('id', { ascending: false }),
    ])
    if (s.error) { setError(s.error.message); setLoading(false); return }
    setSolicitudes(s.data || [])
    setClientes(c.data || [])
    setLoading(false)
  }, [tenant?.id])

  useEffect(() => { cargar() }, [cargar])

  const nombreCliente = (c) => c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim() || '(sin nombre)'
  const enlacePortal = (token) => `${window.location.origin}/portal/${token}`

  function elegirExistente(id) {
    setClienteId(id)
    const c = clientes.find(x => x.id === id)
    if (c) {
      setNombre(nombreCliente(c))
      setCorreo(c.correo_electronico || '')
      setTipoPersona(c.tipo_persona === 'juridica' ? 'juridica' : 'fisica')
    }
  }

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!correo.trim()) { setError('Ingresá el correo del cliente.'); return }
    if (modo === 'existente' && !clienteId) { setError('Elegí el cliente existente a actualizar.'); return }
    setGuardando(true)
    const { data, error } = await supabase.from('solicitudes_kyc').insert({
      tenant_id:      tenant.id,
      tipo_persona:   tipoPersona,
      cliente_id:     modo === 'existente' ? clienteId : null,
      correo_cliente: correo.trim(),
      nombre_cliente: nombre.trim() || null,
      estado:         'enviada',
      creado_por:     session?.user?.id,
      enviada_en:     new Date().toISOString(),
    }).select('*').single()
    setGuardando(false)
    if (error) { setError(error.message); return }
    // Reset y refrescar
    setShowForm(false); setTipoPersona('fisica'); setModo('nuevo'); setClienteId(''); setCorreo(''); setNombre('')
    setSolicitudes(prev => [data, ...prev])
    // Abrir el correo del oficial con el enlace listo para enviar
    abrirCorreo(data)
  }

  function abrirCorreo(sol) {
    const link = enlacePortal(sol.token)
    const asunto = encodeURIComponent(`Complete su información — ${tenant?.nombre || 'Debida diligencia'}`)
    const cuerpo = encodeURIComponent(
      `Estimado/a ${sol.nombre_cliente || 'cliente'},\n\n` +
      `Para completar su proceso de debida diligencia, ingrese al siguiente enlace seguro y complete su información y documentos:\n\n${link}\n\n` +
      `El enlace vence el ${fecha(sol.vence_en)}.\n\nSaludos,\n${tenant?.nombre || 'CNL Craniley'}`
    )
    window.open(`mailto:${sol.correo_cliente}?subject=${asunto}&body=${cuerpo}`, '_blank')
  }

  async function copiar(sol) {
    try { await navigator.clipboard.writeText(enlacePortal(sol.token)); setCopiado(sol.id); setTimeout(() => setCopiado(null), 1500) }
    catch { /* ignore */ }
  }

  if (loading) return <div className="p-6 text-gray-500">Cargando…</div>

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recolección KYC</h1>
          <p className="text-gray-500 text-sm mt-1">Enviá al cliente un enlace para que complete su información de debida diligencia y suba sus documentos.</p>
        </div>
        {!showForm && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Nueva solicitud</button>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={crear} className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Nueva solicitud</h2>

          <div className="flex gap-2">
            {[['fisica', '👤 Persona Física'], ['juridica', '🏢 Persona Jurídica']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTipoPersona(v)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${tipoPersona === v ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-300 text-gray-600 hover:border-brand-400'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={modo === 'nuevo'} onChange={() => { setModo('nuevo'); setClienteId('') }} />
              Cliente nuevo
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={modo === 'existente'} onChange={() => setModo('existente')} />
              Actualizar cliente existente
            </label>
          </div>

          {modo === 'existente' && (
            <div>
              <label className="label text-xs">Cliente a actualizar</label>
              <select className="input text-sm" value={clienteId} onChange={e => elegirExistente(e.target.value)}>
                <option value="">— Seleccione el cliente —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Nombre del cliente</label>
              <input className="input text-sm" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre o razón social" />
            </div>
            <div>
              <label className="label text-xs">Correo del cliente *</label>
              <input className="input text-sm" type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary text-sm disabled:opacity-50">
              {guardando ? 'Creando…' : 'Crear y abrir correo'}
            </button>
          </div>
        </form>
      )}

      {/* Listado */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-2 font-semibold">Cliente</th>
              <th className="px-4 py-2 font-semibold">Tipo</th>
              <th className="px-4 py-2 font-semibold">Correo</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
              <th className="px-4 py-2 font-semibold">Enviada</th>
              <th className="px-4 py-2 font-semibold text-right">Enlace</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Todavía no hay solicitudes. Creá la primera.</td></tr>
            ) : solicitudes.map(s => {
              const est = ESTADO[s.estado] || ESTADO.enviada
              return (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{s.nombre_cliente || '—'}</td>
                  <td className="px-4 py-2">{s.tipo_persona === 'juridica' ? 'Jurídica' : 'Física'}</td>
                  <td className="px-4 py-2 text-gray-500">{s.correo_cliente}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${est.clase}`}>{est.label}</span></td>
                  <td className="px-4 py-2 text-gray-500">{fecha(s.enviada_en || s.creado_en)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => copiar(s)} className="text-xs text-brand-600 hover:underline">
                        {copiado === s.id ? '¡Copiado!' : 'Copiar enlace'}
                      </button>
                      <button onClick={() => abrirCorreo(s)} className="text-xs text-gray-500 hover:text-brand-700">Reenviar</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Al crear una solicitud se abre tu correo con el enlace listo para enviar al cliente. El portal donde el cliente
        completa la información y la bandeja de revisión se activan en las siguientes fases.
      </p>
    </div>
  )
}
