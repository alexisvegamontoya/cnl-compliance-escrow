import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  TIPO_IDENTIFICACION, TIPO_REPORTE, TIPO_OPERACION,
  TIPO_MOVIMIENTO, TIPO_MONEDA, MOTIVO_CREDITO,
  getTiposIngreso, getTiposSalida,
} from '../../lib/catalogos'

const EMPTY_FORM = {
  numero_identificacion: '',
  tipo_identificacion: 2,
  nombre_cliente: '',
  primer_apellido: '',
  segundo_apellido: '',
  nombre_empresa: '',
  tipo_reporte: 2,
  tipo_operacion: 1,
  tipo_movimiento: 1,
  tipo_ingreso: 0,
  tipo_salida: 0,
  tipo_moneda_movimiento: 2,
  monto_movimiento: '',
  fecha_transaccion: '',
  motivo_transaccion: '',
  origen_recursos: '',
  ubicacion_cliente: '',
  motivo_credito: 0,
  ubicacion_comprador_vendedor: '',
  pais_origen_recursos: '',
  pais_destino_recursos: '',
  periodo: new Date().toISOString().substring(0, 7) + '-01',
}

export default function TransactionForm({ onSaved, editData, onCancel }) {
  const { tenant } = useAuth()
  const [form, setForm]           = useState(editData || EMPTY_FORM)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [clienteEncontrado, setClienteEncontrado] = useState(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)

  const esFisica = [1, 3, 5].includes(Number(form.tipo_identificacion))
  const claseDato = tenant?.clase_dato || 47
  const esFacilidadCrediticia = claseDato === 47
  const tiposIngreso = getTiposIngreso(claseDato)
  const tiposSalida  = getTiposSalida(claseDato)

  useEffect(() => {
    if (editData) setForm(editData)
  }, [editData])

  // Autollenado al ingresar número de identificación
  async function buscarCliente(numId) {
    if (!numId || numId.length < 9 || !tenant) return
    setBuscandoCliente(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('numero_identificacion', numId)
      .single()
    if (data) {
      setClienteEncontrado(data)
      setForm(f => ({
        ...f,
        tipo_identificacion: data.tipo_identificacion,
        nombre_cliente: data.nombre_cliente || '',
        primer_apellido: data.primer_apellido || '',
        segundo_apellido: data.segundo_apellido || '',
        nombre_empresa: data.nombre_empresa || '',
      }))
    } else {
      setClienteEncontrado(null)
    }
    setBuscandoCliente(false)
  }

  function set(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value }
      // Limpiar tipo_ingreso/salida cuando cambia el movimiento
      if (field === 'tipo_movimiento') {
        if (value === 1) next.tipo_salida = 0
        if (value === 2) next.tipo_ingreso = 0
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!tenant) { setError('No se encontró el sujeto obligado.'); return }

    setLoading(true)
    try {
      // Buscar o crear cliente en BD
      let clienteId = clienteEncontrado?.id
      if (!clienteId) {
        const clienteData = {
          tenant_id: tenant.id,
          numero_identificacion: form.numero_identificacion,
          tipo_identificacion: Number(form.tipo_identificacion),
          nombre_cliente: esFisica ? form.nombre_cliente : null,
          primer_apellido: esFisica ? form.primer_apellido : null,
          segundo_apellido: esFisica ? form.segundo_apellido : null,
          nombre_empresa: !esFisica ? form.nombre_empresa : null,
        }
        const { data: nuevoCliente } = await supabase
          .from('clientes')
          .upsert(clienteData, { onConflict: 'tenant_id,numero_identificacion', ignoreDuplicates: false })
          .select('id')
          .single()
        clienteId = nuevoCliente?.id
      }

      const payload = {
        tenant_id: tenant.id,
        cliente_id: clienteId,
        numero_identificacion: form.numero_identificacion,
        tipo_identificacion: Number(form.tipo_identificacion),
        nombre_cliente: esFisica ? form.nombre_cliente : null,
        primer_apellido: esFisica ? form.primer_apellido : null,
        segundo_apellido: esFisica ? form.segundo_apellido : null,
        nombre_empresa: !esFisica ? form.nombre_empresa : null,
        tipo_reporte: Number(form.tipo_reporte),
        tipo_operacion: Number(form.tipo_operacion),
        tipo_movimiento: Number(form.tipo_movimiento),
        tipo_ingreso: Number(form.tipo_ingreso) || 0,
        tipo_salida: Number(form.tipo_salida) || 0,
        tipo_moneda_movimiento: Number(form.tipo_moneda_movimiento),
        monto_movimiento: parseFloat(form.monto_movimiento),
        fecha_transaccion: form.fecha_transaccion || null,
        motivo_transaccion: form.motivo_transaccion || null,
        origen_recursos: form.origen_recursos || null,
        ubicacion_cliente: form.ubicacion_cliente || null,
        motivo_credito: esFacilidadCrediticia ? Number(form.motivo_credito) : 0,
        ubicacion_comprador_vendedor: form.ubicacion_comprador_vendedor || null,
        pais_origen_recursos: form.pais_origen_recursos || null,
        pais_destino_recursos: form.pais_destino_recursos || null,
        periodo: form.periodo,
        accion: editData ? 'modificar' : 'insertar',
      }

      let result
      if (editData?.id) {
        result = await supabase.from('transacciones').update(payload).eq('id', editData.id)
      } else {
        result = await supabase.from('transacciones').insert(payload)
      }

      if (result.error) throw result.error

      // Marcar el período como con_movimiento en periodos_declarados
      if (tenant?.id && form.periodo) {
        const periodoISO = form.periodo.substring(0, 7) + '-01'
        await supabase.from('periodos_declarados').upsert({
          tenant_id:     tenant.id,
          periodo:       periodoISO,
          tipo:          'con_movimiento',
          declarado_por: null,
        }, { onConflict: 'tenant_id,periodo', ignoreDuplicates: true })
      }

      setForm(EMPTY_FORM)
      setClienteEncontrado(null)
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Error al guardar la transacción.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Período */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Período de reporte</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Período *</label>
            <input type="month" className="input-field" required
              value={form.periodo?.substring(0, 7)}
              onChange={e => set('periodo', e.target.value + '-01')} />
          </div>
          <div>
            <label className="label">Actividad APNFD</label>
            <input type="text" className="input-field bg-gray-50" readOnly
              value={tenant?.actividad_apnfd || '—'} />
          </div>
        </div>
      </div>

      {/* 1. Identificación del cliente */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">1. Identificación del cliente</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Número de identificación *</label>
            <div className="relative">
              <input type="text" className="input-field pr-16" required
                placeholder="Sin guiones"
                value={form.numero_identificacion}
                onChange={e => set('numero_identificacion', e.target.value)}
                onBlur={e => buscarCliente(e.target.value)} />
              {buscandoCliente && (
                <span className="absolute right-3 top-2.5 text-xs text-gray-400">Buscando…</span>
              )}
            </div>
            {clienteEncontrado && (
              <p className="text-xs text-green-600 mt-1">✓ Cliente encontrado en base de datos</p>
            )}
          </div>
          <div>
            <label className="label">Tipo de identificación *</label>
            <select className="input-field" value={form.tipo_identificacion}
              onChange={e => set('tipo_identificacion', Number(e.target.value))}>
              {TIPO_IDENTIFICACION.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>

          {esFisica ? (
            <>
              <div>
                <label className="label">Nombre *</label>
                <input type="text" className="input-field bg-green-50" required
                  value={form.nombre_cliente}
                  onChange={e => set('nombre_cliente', e.target.value)} />
              </div>
              <div>
                <label className="label">Primer apellido *</label>
                <input type="text" className="input-field bg-green-50" required
                  value={form.primer_apellido}
                  onChange={e => set('primer_apellido', e.target.value)} />
              </div>
              <div>
                <label className="label">Segundo apellido</label>
                <input type="text" className="input-field bg-green-50"
                  value={form.segundo_apellido}
                  onChange={e => set('segundo_apellido', e.target.value)} />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <label className="label">Nombre de la empresa *</label>
              <input type="text" className="input-field bg-green-50" required
                value={form.nombre_empresa}
                onChange={e => set('nombre_empresa', e.target.value)} />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Los campos en verde se autocompletan si el cliente ya existe.</p>
      </div>

      {/* 2. Clasificación de la operación */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">2. Clasificación de la operación</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tipo de reporte *</label>
            <select className="input-field" value={form.tipo_reporte}
              onChange={e => set('tipo_reporte', Number(e.target.value))}>
              {TIPO_REPORTE.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo de operación *</label>
            <select className="input-field" value={form.tipo_operacion}
              onChange={e => set('tipo_operacion', Number(e.target.value))}>
              {TIPO_OPERACION.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tipo de movimiento *</label>
            <select className="input-field" value={form.tipo_movimiento}
              onChange={e => set('tipo_movimiento', Number(e.target.value))}>
              {TIPO_MOVIMIENTO.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>

          {/* Tipo ingreso — solo si movimiento = 1 (Ingreso) */}
          {Number(form.tipo_movimiento) !== 2 && (
            <div>
              <label className="label">Tipo de ingreso *</label>
              <select className="input-field" value={form.tipo_ingreso}
                onChange={e => set('tipo_ingreso', Number(e.target.value))}>
                {tiposIngreso.map(t => (
                  <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tipo salida — solo si movimiento = 2 (Salida) */}
          {Number(form.tipo_movimiento) !== 1 && (
            <div>
              <label className="label">Tipo de salida *</label>
              <select className="input-field" value={form.tipo_salida}
                onChange={e => set('tipo_salida', Number(e.target.value))}>
                {tiposSalida.map(t => (
                  <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. Detalle del movimiento */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">3. Detalle del movimiento</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Moneda *</label>
            <select className="input-field" value={form.tipo_moneda_movimiento}
              onChange={e => set('tipo_moneda_movimiento', Number(e.target.value))}>
              {TIPO_MONEDA.map(t => (
                <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Monto del movimiento *</label>
            <input type="number" className="input-field" required min="0" step="0.01"
              placeholder="0.00"
              value={form.monto_movimiento}
              onChange={e => set('monto_movimiento', e.target.value)} />
            {(() => {
              const umbral = Number(tenant?.monto_minimo_usd) || 10000
              const monto  = Number(form.monto_movimiento)
              if (monto >= umbral) {
                return (
                  <p className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                    🔴 Supera el umbral SUGEF de USD {umbral.toLocaleString()} — reporte obligatorio
                  </p>
                )
              }
              if (monto > 0 && monto >= umbral * 0.75 && monto % 500 === 0) {
                return (
                  <p className="mt-1 text-xs font-medium text-orange-600 flex items-center gap-1">
                    🟠 Monto redondo cercano al umbral ({Math.round(monto / umbral * 100)}%) — verifique estructuración
                  </p>
                )
              }
              return null
            })()}
          </div>
          <div>
            <label className="label">Fecha de la transacción</label>
            <input type="date" className="input-field"
              value={form.fecha_transaccion}
              onChange={e => set('fecha_transaccion', e.target.value)} />
          </div>
          <div>
            <label className="label">Motivo de la transacción</label>
            <input type="text" className="input-field"
              placeholder="Descripción breve"
              value={form.motivo_transaccion}
              onChange={e => set('motivo_transaccion', e.target.value)} />
          </div>

          {/* Motivo crédito — solo Facilidades Crediticias */}
          {esFacilidadCrediticia && (
            <div>
              <label className="label">Motivo de crédito *</label>
              <select className="input-field" value={form.motivo_credito}
                onChange={e => set('motivo_credito', Number(e.target.value))}>
                {MOTIVO_CREDITO.map(t => (
                  <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descripcion}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 4. Ubicación y países */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">4. Origen de recursos y ubicación</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Origen de recursos <span className="text-red-500">*</span></label>
            <input type="text" className="input-field" required
              placeholder="Ej: Flujo de caja de la empresa para atender la deuda"
              value={form.origen_recursos}
              onChange={e => set('origen_recursos', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Requerido por SUGEF/SICVECA. Describa el origen de los fondos de la transacción.</p>
          </div>
          <div>
            <label className="label">Ubicación del cliente</label>
            <input type="text" className="input-field"
              placeholder="Ej: San José, Costa Rica"
              value={form.ubicacion_cliente}
              onChange={e => set('ubicacion_cliente', e.target.value)} />
          </div>
          <div>
            <label className="label">Ubicación comprador/vendedor</label>
            <input type="text" className="input-field"
              value={form.ubicacion_comprador_vendedor}
              onChange={e => set('ubicacion_comprador_vendedor', e.target.value)} />
          </div>
          <div>
            <label className="label">País origen de recursos (ISO)</label>
            <input type="text" className="input-field" maxLength={2}
              placeholder="Ej: CR"
              value={form.pais_origen_recursos}
              onChange={e => set('pais_origen_recursos', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">País destino de recursos (ISO)</label>
            <input type="text" className="input-field" maxLength={2}
              placeholder="Ej: CR"
              value={form.pais_destino_recursos}
              onChange={e => set('pais_destino_recursos', e.target.value.toUpperCase())} />
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Guardando…' : editData ? 'Actualizar transacción' : 'Registrar transacción'}
        </button>
      </div>
    </form>
  )
}
