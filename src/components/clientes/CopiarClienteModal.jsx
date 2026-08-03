/**
 * CopiarClienteModal.jsx
 * Copia un cliente ya registrado de un sujeto obligado a otro.
 *
 * Disponible para cualquier usuario con acceso a más de un sujeto obligado
 * (membresías múltiples) y para el superadministrador, que los ve todos.
 *
 * La RLS de `clientes` permite insertar en cualquier tenant de mis_tenant_ids(),
 * así que la copia no requiere permisos especiales: el usuario solo puede
 * copiar hacia sujetos obligados a los que ya pertenece.
 */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { logAudit } from '../../lib/auditLog'

// Columnas que identifican la fila o las gestiona la base: nunca se copian
const CAMPOS_NO_COPIABLES = ['id', 'tenant_id', 'created_at', 'updated_at']

// Documentación presentada y banderas del expediente
const CAMPOS_DOCUMENTACION = {
  checklist_documental:     {},
  checklist_actualizado_en: null,
  kyc_actualizado:          false,
  legal_actualizado:        false,
  ingresos_actualizados:    false,
}

// Gestiones de cumplimiento: las ejecutó el sujeto obligado de origen, así que
// por defecto el cliente nace "pendiente" en el destino.
const CAMPOS_CUMPLIMIENTO = {
  estado_dd:                 'pendiente',
  estado_listas:             'pendiente',
  estado_calificacion:       'pendiente',
  nivel_riesgo_actual:       null,
  calificacion_riesgo:       null,
  aparece_en_listas:         false,
  sugef_estado:              null,
  ccss_estado:               null,
  ultima_calificacion:       null,
  ultima_revision_dd:        null,
  ultima_consulta_listas:    null,
  fecha_ultima_calificacion: null,
  fecha_calificacion_riesgo: null,
  fecha_consulta_listas:     null,
  fecha_debida_diligencia:   null,
}

// Campos de personas relacionadas que se reasignan en la copia
const CPR_NO_COPIABLES = ['id', 'tenant_id', 'cliente_id', 'creado_en', 'creado_por', 'cliente_relacionado_id']

function nombreCliente(c) {
  if (!c) return '—'
  if (c.tipo_persona === 'juridica') return c.nombre_empresa || c.nombre_cliente || '—'
  return [c.nombre_cliente, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ') || c.nombre_empresa || '—'
}

function Opcion({ checked, onChange, titulo, detalle, disabled = false }) {
  return (
    <label className={`flex items-start gap-2.5 p-3 border rounded-xl transition-colors ${
      disabled ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
    }`}>
      <input
        type="checkbox"
        className="mt-0.5 flex-shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-800">{titulo}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{detalle}</span>
      </span>
    </label>
  )
}

export default function CopiarClienteModal({ cliente, onClose, onCopiado }) {
  const { tenantsDisponibles, isSuperAdmin } = useAuth()

  const esJuridica = cliente?.tipo_persona === 'juridica'

  const [destino, setDestino]     = useState('')
  const [copiarDoc, setCopiarDoc] = useState(true)
  const [copiarCumpl, setCopiarCumpl]   = useState(false)
  const [copiarEstruct, setCopiarEstruct] = useState(true)
  const [sobrescribir, setSobrescribir]   = useState(false)

  const [existente, setExistente]   = useState(null)
  const [verificando, setVerificando] = useState(false)
  const [copiando, setCopiando]     = useState(false)
  const [error, setError]           = useState('')
  const [aviso, setAviso]           = useState('')
  const [listo, setListo]           = useState(false)

  // Sujetos obligados a los que puedo copiar (todos los míos menos el de origen)
  const destinos = useMemo(
    () => (tenantsDisponibles || []).filter(t => t.id !== cliente?.tenant_id),
    [tenantsDisponibles, cliente?.tenant_id]
  )
  const origen = (tenantsDisponibles || []).find(t => t.id === cliente?.tenant_id)

  const identificacion = (cliente?.numero_identificacion || '').trim()

  // ¿Ya existe un cliente con esa identificación en el destino?
  useEffect(() => {
    setExistente(null)
    setSobrescribir(false)
    if (!destino || !identificacion) return

    let cancelado = false
    setVerificando(true)
    supabase.from('clientes')
      .select('id, tipo_persona, nombre_cliente, primer_apellido, segundo_apellido, nombre_empresa')
      .eq('tenant_id', destino)
      .eq('numero_identificacion', identificacion)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setExistente(data || null)
        setVerificando(false)
      })
    return () => { cancelado = true }
  }, [destino, identificacion])

  const bloqueado = !!existente && !sobrescribir

  async function copiar() {
    if (!destino || bloqueado) return
    setCopiando(true)
    setError('')
    setAviso('')
    try {
      // Releer la fila completa: la que viene por props puede estar recortada
      const { data: origenRow, error: eOrigen } = await supabase
        .from('clientes').select('*').eq('id', cliente.id).single()
      if (eOrigen) throw eOrigen

      const payload = {}
      Object.entries(origenRow).forEach(([k, v]) => {
        if (!CAMPOS_NO_COPIABLES.includes(k)) payload[k] = v
      })
      payload.tenant_id = destino
      // Las filas antiguas pueden traer activo = null
      payload.activo    = origenRow.activo !== false
      if (!copiarDoc)   Object.assign(payload, CAMPOS_DOCUMENTACION)
      if (!copiarCumpl) Object.assign(payload, CAMPOS_CUMPLIMIENTO)

      let nuevoId
      if (existente) {
        const { error: eUpd } = await supabase.from('clientes').update(payload).eq('id', existente.id)
        if (eUpd) throw eUpd
        nuevoId = existente.id
      } else {
        const { data, error: eIns } = await supabase.from('clientes').insert(payload).select('id').single()
        if (eIns) throw eIns
        nuevoId = data.id
      }

      // Estructura de la empresa (personas relacionadas)
      if (copiarEstruct && origenRow.tipo_persona === 'juridica') {
        const { data: personas } = await supabase
          .from('clientes_personas_relacionadas').select('*')
          .eq('cliente_id', origenRow.id).eq('activo', true).order('orden')

        if (personas?.length) {
          // Al sobrescribir, la estructura del destino se reemplaza por la del origen
          if (existente) {
            await supabase.from('clientes_personas_relacionadas').delete().eq('cliente_id', nuevoId)
          }
          const filas = personas.map(p => {
            const fila = {}
            Object.entries(p).forEach(([k, v]) => {
              if (!CPR_NO_COPIABLES.includes(k)) fila[k] = v
            })
            fila.tenant_id  = destino
            fila.cliente_id = nuevoId
            // El vínculo a otro cliente pertenece al sujeto obligado de origen
            fila.cliente_relacionado_id = null
            return fila
          })
          const { error: ePers } = await supabase.from('clientes_personas_relacionadas').insert(filas)
          if (ePers) setAviso(`El cliente se copió, pero la estructura de la empresa no: ${ePers.message}`)
        }
      }

      const nombreDestino = destinos.find(t => t.id === destino)?.nombre || destino
      await logAudit({
        accion:      existente ? 'editar' : 'crear',
        tabla:       'clientes',
        registro_id: nuevoId,
        tenant_id:   destino,
        descripcion: `${existente ? 'Sobrescritura' : 'Copia'} del cliente "${nombreCliente(origenRow)}" (${identificacion || 'sin identificación'}) desde "${origen?.nombre || cliente.tenant_id}" hacia "${nombreDestino}"`,
      })

      setListo(true)
      onCopiado?.({ clienteId: nuevoId, tenantId: destino, sobrescrito: !!existente })
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('duplicate key')) {
        setError('El sujeto obligado destino ya tiene un cliente con esta identificación. Recargue la pantalla e inténtelo de nuevo.')
      } else if (msg.includes('row-level security') || msg.includes('violates row-level')) {
        setError('No tiene permiso para registrar clientes en el sujeto obligado destino.')
      } else {
        setError(msg || 'No se pudo copiar el cliente.')
      }
    } finally {
      setCopiando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📑 Copiar cliente a otro sujeto obligado</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {nombreCliente(cliente)}
              {identificacion && <span className="font-mono"> · {identificacion}</span>}
              {origen?.nombre && <> · origen: <strong>{origen.nombre}</strong></>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {listo ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-4xl">✅</p>
              <p className="font-semibold text-gray-800">
                Cliente {existente ? 'actualizado' : 'copiado'} en{' '}
                {destinos.find(t => t.id === destino)?.nombre}
              </p>
              <p className="text-sm text-gray-500">
                Cambie de sujeto obligado desde el selector superior para verlo en su cartera.
              </p>
              {aviso && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 text-left">
                  ⚠ {aviso}
                </p>
              )}
            </div>
          ) : destinos.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <p className="text-3xl mb-2">🏢</p>
              <p>No hay otro sujeto obligado al que copiar este cliente.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="label text-xs">Sujeto obligado destino</label>
                <select
                  className="input text-sm"
                  value={destino}
                  onChange={e => setDestino(e.target.value)}
                >
                  <option value="">— Seleccione el sujeto obligado —</option>
                  {destinos.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                {isSuperAdmin && (
                  <p className="text-xs text-brand-600 mt-1">
                    🔐 Como superadministrador ve todos los sujetos obligados del sistema.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qué se copia</p>
                <p className="text-xs text-gray-500">
                  Los datos de identificación, ubicación, contacto y perfil financiero se copian siempre.
                </p>
                <Opcion
                  checked={copiarDoc} onChange={setCopiarDoc}
                  titulo="Documentación presentada"
                  detalle="Checklist documental y banderas de KYC, documentación legal e ingresos."
                />
                <Opcion
                  checked={copiarEstruct} onChange={setCopiarEstruct}
                  disabled={!esJuridica}
                  titulo="Estructura de la empresa"
                  detalle={esJuridica
                    ? 'Representantes, junta directiva, socios y beneficiarios finales.'
                    : 'Solo aplica a personas jurídicas.'}
                />
                <Opcion
                  checked={copiarCumpl} onChange={setCopiarCumpl}
                  titulo="Estado de cumplimiento"
                  detalle="Debida diligencia, consulta de listas y calificación de riesgo. Si lo deja sin marcar, el cliente nace como pendiente en el destino."
                />
                <p className="text-xs text-gray-400">
                  El historial de expedientes de debida diligencia y de calificaciones no se copia:
                  cada sujeto obligado documenta sus propias gestiones.
                </p>
              </div>

              {verificando && (
                <p className="text-xs text-gray-400">Verificando si el cliente ya existe en el destino…</p>
              )}

              {existente && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-800">
                    ⚠ Ya existe un cliente con esta identificación en el destino
                  </p>
                  <p className="text-xs text-amber-700">
                    Registrado como <strong>{nombreCliente(existente)}</strong>. Para continuar debe
                    autorizar que sus datos se reemplacen por los del cliente de origen.
                  </p>
                  <label className="flex items-start gap-2 text-xs text-amber-800 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={sobrescribir}
                      onChange={e => setSobrescribir(e.target.checked)} />
                    <span>Sí, sobrescribir el cliente existente en el destino.</span>
                  </label>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                  ⚠ {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          {listo ? (
            <button onClick={onClose} className="btn-primary text-sm">Cerrar</button>
          ) : (
            <>
              <button onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={copiar}
                disabled={!destino || copiando || verificando || bloqueado || destinos.length === 0}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {copiando ? 'Copiando…' : existente ? 'Sobrescribir en el destino' : 'Copiar cliente'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
