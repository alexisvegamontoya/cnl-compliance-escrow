import { useState, useEffect, useCallback } from 'react'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { TIPO_IDENTIFICACION, getEtiquetaCliente } from '../lib/catalogos'
import CargaMasivaClientesSicveca from '../components/carga/CargaMasivaClientesSicveca'
import { exportarExcel } from '../lib/exportExcel'
import { logAudit } from '../lib/auditLog'
import { alertaListasCliente } from '../lib/emailAlertas'
import ErrorBanner from '../components/ui/ErrorBanner'
import { clasificarError } from '../lib/errorHandler'
import { imprimirFichaCliente } from '../utils/imprimirFicha'

const TIPO_ID_LABEL = Object.fromEntries(TIPO_IDENTIFICACION.map(t => [t.codigo, t.descripcion]))

const RIESGO_CONFIG = {
  alto:  { label: 'Alto',  color: 'bg-red-100 text-red-700 border-red-200' },
  medio: { label: 'Medio', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  bajo:  { label: 'Bajo',  color: 'bg-green-100 text-green-700 border-green-200' },
}

const EMPTY = {
  numero_identificacion: '',
  tipo_identificacion: 2,
  nombre_cliente: '',
  primer_apellido: '',
  segundo_apellido: '',
  nombre_empresa: '',
  nacionalidad: '',
  pais_ubicacion: '',
  actividad_economica: '',
  nombre_contacto: '',
  telefono: '',
  correo_electronico: '',
  fecha_vinculacion: '',
  fecha_termino_relacion: '',
  pep: false,
  calificacion_riesgo: '',
  ingreso_mensual_est: '',
  kyc_actualizado: false,
  legal_actualizado: false,
  ingresos_actualizados: false,
  aparece_en_listas: false,
  notas: '',
}

export default function Clientes() {
  const { tenant, profile, isSuperAdmin } = useAuth()
  const etiqueta = getEtiquetaCliente(tenant)
  const etiquetaSingular = getEtiquetaCliente(tenant, false)
  const [tenants, setTenants] = useState([])
  const [clientes, setClientes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [showForm, setShowForm]   = useState(false)
  const [busqueda, setBusqueda]   = useState('')
  const [filtroRiesgo, setFiltroRiesgo] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [detalleId, setDetalleId] = useState(null)
  const [txnsCliente, setTxnsCliente] = useState([])
  const [tenantId, setTenantId]   = useState(null) // para superadmin: tenant seleccionado en el form
  const [tenantVista, setTenantVista] = useState(null) // para superadmin: tenant seleccionado para VER clientes
  const [padronInfo, setPadronInfo]     = useState(null)   // resultado del padr├│n SUGEF
  const [padronLoading, setPadronLoading] = useState(false)

  const esFisica = [1, 3, 5].includes(Number(form.tipo_identificacion))

  // ÔöÇÔöÇ Autocomplete desde padr├│n SUGEF ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  useEffect(() => {
    const cedula = form.numero_identificacion.trim().replace(/[-\s]/g, '')
    if (cedula.length < 9) { setPadronInfo(null); return }

    setPadronLoading(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_padron', { p_identificacion: cedula })
      if (data && data.length > 0) {
        const reg = data[0]
        setPadronInfo(reg)
        // Auto-completar campos vac├¡os
        if (reg.tipo === 'J' && !form.nombre_empresa) {
          setForm(p => ({ ...p, nombre_empresa: reg.nombre_completo }))
        } else if (reg.tipo === 'F') {
          const parts = reg.nombre_completo.trim().split(/\s+/)
          // Formato SUGEF: NOMBRE AP1 AP2
          const ap2   = parts.length >= 3 ? parts[parts.length - 1] : ''
          const ap1   = parts.length >= 2 ? parts[parts.length - 2] : ''
          const nomb  = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(' ') : parts[0] || ''
          setForm(p => ({
            ...p,
            nombre_cliente:   p.nombre_cliente   || nomb,
            primer_apellido:  p.primer_apellido  || ap1,
            segundo_apellido: p.segundo_apellido || ap2,
          }))
        }
      } else {
        setPadronInfo(null)
      }
      setPadronLoading(false)
    }, 600)
    return () => { clearTimeout(timer); setPadronLoading(false) }
  }, [form.numero_identificacion])

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('id, nombre, actividad_apnfd, clase_dato').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // tenant efectivo para la VISTA: superadmin puede seleccionar cualquier sujeto obligado
  const tenantVistaId = isSuperAdmin ? (tenantVista?.id || null) : tenant?.id

  const load = useCallback(async () => {
    if (!tenantVistaId) { setClientes([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('tenant_id', tenantVistaId)
      .order('nombre_empresa', { ascending: true, nullsLast: true })
    setClientes(data || [])
    setLoading(false)
  }, [tenantVistaId])

  useEffect(() => { load() }, [load])

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  function startEdit(c) {
    setForm({ ...EMPTY, ...c, pep: c.pep || false })
    setEditId(c.id)
    setTenantId(c.tenant_id)   // superadmin: cargar el tenant del cliente
    setShowForm(true)
    setDetalleId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() { setForm(EMPTY); setEditId(null); setShowForm(false); setError(''); setTenantId(null); setPadronInfo(null) }

  async function verDetalle(c) {
    if (detalleId === c.id) { setDetalleId(null); return }
    setDetalleId(c.id)
    const { data } = await supabase
      .from('transacciones')
      .select('monto_movimiento, tipo_movimiento, fecha_transaccion, periodo')
      .eq('tenant_id', tenant.id)
      .eq('numero_identificacion', c.numero_identificacion)
      .order('periodo', { ascending: false })
      .limit(10)
    setTxnsCliente(data || [])
  }

  async function imprimirFicha(c) {
    // Obtener personas vinculadas (representantes, socios, junta) para jurídicas
    let personas = []
    if (c.nombre_empresa || [2, 4].includes(Number(c.tipo_identificacion))) {
      const { data } = await supabase
        .from('clientes_personas_relacionadas')
        .select('*')
        .eq('cliente_id', c.id)
      personas = data || []
    }
    imprimirFichaCliente({ cliente: c, personas, tenant, profile })
  }

  async function guardar(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const efectivoTenantId = (isSuperAdmin && tenantId) ? tenantId : tenant.id
    if (isSuperAdmin && !tenantId) {
      setError({ tipo: 'operativo', mensaje: 'Debe seleccionar un sujeto obligado para asignar el cliente.' })
      setSaving(false)
      return
    }
    const payload = {
      tenant_id: efectivoTenantId,
      numero_identificacion: form.numero_identificacion,
      tipo_identificacion: Number(form.tipo_identificacion),
      nombre_cliente: esFisica ? form.nombre_cliente : null,
      primer_apellido: esFisica ? form.primer_apellido : null,
      segundo_apellido: esFisica ? form.segundo_apellido : null,
      nombre_empresa: !esFisica ? form.nombre_empresa : null,
      nacionalidad: form.nacionalidad || null,
      pais_ubicacion: form.pais_ubicacion || null,
      actividad_economica: form.actividad_economica || null,
      nombre_contacto: form.nombre_contacto || null,
      telefono: form.telefono || null,
      correo_electronico: form.correo_electronico || null,
      fecha_vinculacion: form.fecha_vinculacion || null,
      fecha_termino_relacion: form.fecha_termino_relacion || null,
      pep: form.pep,
      calificacion_riesgo: form.calificacion_riesgo || null,
      ingreso_mensual_est: form.ingreso_mensual_est ? Number(form.ingreso_mensual_est) : null,
      kyc_actualizado: form.kyc_actualizado,
      legal_actualizado: form.legal_actualizado,
      ingresos_actualizados: form.ingresos_actualizados,
      aparece_en_listas: form.aparece_en_listas,
      notas: form.notas || null,
    }
    const isNew = !editId
    const { error: err } = editId
      ? await supabase.from('clientes').update(payload).eq('id', editId)
      : await supabase.from('clientes').insert(payload)
    if (err) { setError(clasificarError(err)); setSaving(false); return }

    // Alerta si aparece en listas internacionales
    if (form.aparece_en_listas) {
      const nombreCliente = esFisica
        ? `${form.nombre_cliente} ${form.primer_apellido}`.trim()
        : form.nombre_empresa
      alertaListasCliente({
        nombreCliente,
        identificacion: form.numero_identificacion,
      })
    }
    logAudit({
      accion: isNew ? 'crear' : 'editar',
      tabla: 'clientes',
      descripcion: `${isNew ? 'Nuevo' : 'Edici├│n'} cliente: ${form.nombre_empresa || form.nombre_cliente}`,
    })

    cancelar()
    load()
    setSaving(false)
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este cliente?')) return
    const { error: eBorrar } = await supabase.from('clientes').delete().eq('id', id)
    if (eBorrar) { setError(eBorrar.message || 'No se pudo eliminar el cliente.'); return }
    load()
  }

  const filtrados = clientes.filter(c => {
    const nombre = (c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`).toLowerCase()
    const matchTexto = nombre.includes(busqueda.toLowerCase()) || c.numero_identificacion.includes(busqueda)
    const matchRiesgo = !filtroRiesgo || c.calificacion_riesgo === filtroRiesgo
    return matchTexto && matchRiesgo
  })

  const resumen = {
    total: clientes.length,
    alto: clientes.filter(c => c.calificacion_riesgo === 'alto').length,
    medio: clientes.filter(c => c.calificacion_riesgo === 'medio').length,
    bajo: clientes.filter(c => c.calificacion_riesgo === 'bajo').length,
    pep: clientes.filter(c => c.pep).length,
  }

  return (
    <div className="p-6 max-w-6xl space-y-6">
      {/* Selector de sujeto obligado (solo superadmin) */}
      {isSuperAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-amber-700 text-sm font-medium whitespace-nowrap">­ƒæü Viendo clientes de:</span>
          <select
            className="input-field text-sm flex-1 max-w-sm"
            value={tenantVista?.id || ''}
            onChange={e => {
              const t = tenants.find(t => t.id === e.target.value) || null
              setTenantVista(t)
              setClientes([])
              setBusqueda('')
            }}
          >
            <option value="">ÔÇö Seleccione un sujeto obligado ÔÇö</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {tenantVista && (
            <span className="text-xs text-amber-600 font-medium">{clientes.length} cliente{clientes.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isSuperAdmin
              ? tenantVista ? `Sujeto obligado: ${tenantVista.nombre}` : 'Seleccione un sujeto obligado para ver sus clientes'
              : `Base de datos de ${etiqueta} ÔÇö ${tenant?.nombre}`
            }
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              exportarExcel({
                data: clientes.map(c => ({
                  ...c,
                  tipo_identificacion: TIPO_ID_LABEL[c.tipo_identificacion] || c.tipo_identificacion,
                  pep:               c.pep ? 'S├¡' : 'No',
                  aparece_en_listas: c.aparece_en_listas ? 'S├¡' : 'No',
                  kyc_actualizado:   c.kyc_actualizado   ? 'S├¡' : 'No',
                  legal_actualizado: c.legal_actualizado  ? 'S├¡' : 'No',
                  ingresos_actualizados: c.ingresos_actualizados ? 'S├¡' : 'No',
                  activo:            c.activo ? 'S├¡' : 'No',
                })),
                columnas: [
                  'numero_identificacion','cedula_juridica','tipo_identificacion',
                  'nombre_cliente','primer_apellido','segundo_apellido','nombre_empresa',
                  'nacionalidad','pais_ubicacion','pais_nacimiento','pais_constitucion',
                  'fecha_nacimiento','fecha_constitucion',
                  'profesion_nombre','actividad_economica','actividad_eco_nombre',
                  'telefono','correo_electronico',
                  'fecha_vinculacion','fecha_termino_relacion',
                  'proposito_relacion',
                  'pep','aparece_en_listas','estado_listas',
                  'calificacion_riesgo','nivel_riesgo_actual','estado_calificacion','fecha_ultima_calificacion',
                  'estado_dd',
                  'kyc_actualizado','legal_actualizado','ingresos_actualizados',
                  'ingreso_mensual_est',
                  'activo','notas',
                ],
                headers: {
                  numero_identificacion:     'N┬░ Identificaci├│n',
                  cedula_juridica:           'C├®dula Jur├¡dica',
                  tipo_identificacion:       'Tipo ID',
                  nombre_cliente:            'Nombre',
                  primer_apellido:           'Primer Apellido',
                  segundo_apellido:          'Segundo Apellido',
                  nombre_empresa:            'Raz├│n Social',
                  nacionalidad:              'Nacionalidad',
                  pais_ubicacion:            'Pa├¡s Ubicaci├│n',
                  pais_nacimiento:           'Pa├¡s Nacimiento',
                  pais_constitucion:         'Pa├¡s Constituci├│n',
                  fecha_nacimiento:          'Fecha Nacimiento',
                  fecha_constitucion:        'Fecha Constituci├│n',
                  profesion_nombre:          'Profesi├│n',
                  actividad_economica:       'C├│d. Actividad',
                  actividad_eco_nombre:      'Actividad Econ├│mica',
                  telefono:                  'Tel├®fono',
                  correo_electronico:        'Correo',
                  fecha_vinculacion:         'Fecha Vinculaci├│n',
                  fecha_termino_relacion:    'Fecha T├®rmino Relaci├│n',
                  proposito_relacion:        'Prop├│sito Relaci├│n',
                  pep:                       'PEP',
                  aparece_en_listas:         'Aparece en Listas',
                  estado_listas:             'Estado Listas',
                  calificacion_riesgo:       'Calificaci├│n Riesgo',
                  nivel_riesgo_actual:       'Nivel Riesgo',
                  estado_calificacion:       'Estado Calificaci├│n',
                  fecha_ultima_calificacion: '├Ültima Calificaci├│n',
                  estado_dd:                 'Estado DD',
                  kyc_actualizado:           'KYC Actualizado',
                  legal_actualizado:         'Doc. Legal OK',
                  ingresos_actualizados:     'Ingresos Actualizados',
                  ingreso_mensual_est: 'Ingreso Mensual Est. (USD)',
                  activo:                    'Activo',
                  notas:                     'Notas',
                },
                nombreArchivo: `clientes_${tenant?.nombre?.replace(/\s/g,'_') || 'cnl'}`,
                nombreHoja: 'Clientes',
              })
              logAudit({ accion: 'exportar', tabla: 'clientes', descripcion: `Exportaci├│n Excel de ${clientes.length} clientes` })
            }}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700"
          >
            ­ƒôÑ Exportar Excel
          </button>
          <button className="btn-primary" onClick={() => { cancelar(); setShowForm(s => !s) }}>
            {showForm && !editId ? 'Ô£ò Cancelar' : `+ Nuevo ${etiquetaSingular}`}
          </button>
        </div>
      </div>

      {/* Resumen de riesgo */}
      {!showForm && clientes.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total', val: resumen.total, color: 'text-brand-600', bg: 'bg-brand-50', filter: '' },
            { label: 'Riesgo alto', val: resumen.alto, color: 'text-red-600', bg: 'bg-red-50', filter: 'alto' },
            { label: 'Riesgo medio', val: resumen.medio, color: 'text-yellow-600', bg: 'bg-yellow-50', filter: 'medio' },
            { label: 'Riesgo bajo', val: resumen.bajo, color: 'text-green-600', bg: 'bg-green-50', filter: 'bajo' },
            { label: 'PEPs', val: resumen.pep, color: 'text-dorado-700', bg: 'bg-dorado-50', filter: null },
          ].map(r => (
            <button key={r.label}
              onClick={() => r.filter !== null ? setFiltroRiesgo(r.filter === filtroRiesgo ? '' : r.filter) : null}
              className={`card text-center transition-all ${r.bg} ${r.filter !== null ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${filtroRiesgo === r.filter && r.filter ? 'ring-2 ring-brand-500' : ''}`}
            >
              <p className={`text-2xl font-bold ${r.color}`}>{r.val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{r.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <form onSubmit={guardar} className="card space-y-6">
          <h3 className="font-semibold text-gray-900 text-lg">{editId ? `Editar ${etiquetaSingular}` : `Nuevo ${etiquetaSingular}`}</h3>
          <ErrorBanner error={error} onClose={() => setError(null)} />

          {/* Selector de sujeto obligado ÔÇö solo superadmin */}
          {isSuperAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <label className="block text-sm font-semibold text-amber-800 mb-2">
                ­ƒÅó Asignar a Sujeto Obligado *
              </label>
              <select
                className="input"
                value={tenantId || ''}
                onChange={e => setTenantId(e.target.value)}
                required
              >
                <option value="">Seleccione el sujeto obligadoÔÇª</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
              <p className="text-xs text-amber-600 mt-1.5">
                Como superadministrador, debe asignar este cliente a un sujeto obligado espec├¡fico.
              </p>
            </div>
          )}

          {/* Identificaci├│n */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Identificaci├│n</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">N├║mero de identificaci├│n *</label>
                <input className="input-field" required placeholder="Sin guiones"
                  value={form.numero_identificacion} onChange={e => { set('numero_identificacion', e.target.value); setPadronInfo(null) }} />
                {padronLoading && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <span className="animate-spin inline-block">ÔÅ│</span> Consultando padr├│n SUGEFÔÇª
                  </p>
                )}
                {!padronLoading && padronInfo && (
                  <p className="text-xs text-green-600 font-medium mt-1">
                    Ô£à Encontrado en padr├│n SUGEF ÔÇö datos autocompletados
                  </p>
                )}
                {!padronLoading && !padronInfo && form.numero_identificacion.replace(/[-\s]/g,'').length >= 9 && (
                  <p className="text-xs text-amber-500 mt-1">
                    ÔÜá No encontrado en padr├│n SUGEF ÔÇö complete el nombre manualmente
                  </p>
                )}
              </div>
              <div>
                <label className="label">Tipo de identificaci├│n *</label>
                <select className="input-field" value={form.tipo_identificacion}
                  onChange={e => set('tipo_identificacion', Number(e.target.value))}>
                  {TIPO_IDENTIFICACION.map(t => (
                    <option key={t.codigo} value={t.codigo}>{t.codigo} ÔÇö {t.descripcion}</option>
                  ))}
                </select>
              </div>
              {esFisica ? (
                <>
                  <div><label className="label">Nombre *</label>
                    <input className="input-field" required value={form.nombre_cliente}
                      onChange={e => set('nombre_cliente', e.target.value)} /></div>
                  <div><label className="label">Primer apellido *</label>
                    <input className="input-field" required value={form.primer_apellido}
                      onChange={e => set('primer_apellido', e.target.value)} /></div>
                  <div><label className="label">Segundo apellido</label>
                    <input className="input-field" value={form.segundo_apellido}
                      onChange={e => set('segundo_apellido', e.target.value)} /></div>
                </>
              ) : (
                <div className="col-span-2"><label className="label">Nombre de la empresa *</label>
                  <input className="input-field" required value={form.nombre_empresa}
                    onChange={e => set('nombre_empresa', e.target.value)} /></div>
              )}
            </div>
          </div>

          {/* Contacto */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Contacto y actividad</p>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Actividad econ├│mica</label>
                <input className="input-field" placeholder="Ej: Comercio, Servicios, Manufactura"
                  value={form.actividad_economica} onChange={e => set('actividad_economica', e.target.value)} /></div>
              <div><label className="label">Fecha de vinculaci├│n</label>
                <input type="date" className="input-field"
                  value={form.fecha_vinculacion} onChange={e => set('fecha_vinculacion', e.target.value)} /></div>
              <div><label className="label">Nacionalidad</label>
                <input className="input-field" placeholder="Ej: Costarricense, Estadounidense"
                  value={form.nacionalidad} onChange={e => set('nacionalidad', e.target.value)} /></div>
              <div><label className="label">Pa├¡s de ubicaci├│n</label>
                <input className="input-field" placeholder="Ej: Costa Rica, Panam├í"
                  value={form.pais_ubicacion} onChange={e => set('pais_ubicacion', e.target.value)} /></div>
              <div className="col-span-2"><label className="label">Nombre del contacto</label>
                <input className="input-field" placeholder="Ej: Mar├¡a Gonz├ílez (persona de contacto)"
                  value={form.nombre_contacto} onChange={e => set('nombre_contacto', e.target.value)} /></div>
              <div><label className="label">Tel├®fono</label>
                <input className="input-field" placeholder="Ej: 8888-8888"
                  value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
              <div><label className="label">Correo electr├│nico</label>
                <input type="email" className="input-field"
                  value={form.correo_electronico} onChange={e => set('correo_electronico', e.target.value)} /></div>
            </div>
          </div>

          {/* Riesgo */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Perfil de riesgo</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Calificaci├│n de riesgo</label>
                <select className="input-field" value={form.calificacion_riesgo}
                  onChange={e => set('calificacion_riesgo', e.target.value)}>
                  <option value="">ÔÇö Sin calificar ÔÇö</option>
                  <option value="bajo">Bajo</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                </select>
              </div>
              <div>
                <label className="label">Ingreso mensual estimado (USD)</label>
                <input type="number" className="input-field" min="0" step="0.01"
                  placeholder="Para análisis transaccional SICVECA"
                  value={form.ingreso_mensual_est}
                  onChange={e => set('ingreso_mensual_est', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded text-brand-600"
                    checked={form.pep} onChange={e => set('pep', e.target.checked)} />
                  <span className="text-sm font-medium text-gray-700">
                    Persona Expuesta Pol├¡ticamente (PEP)
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-1 ml-7">
                  Marque si el cliente es un funcionario p├║blico, familiar de este, o colaborador cercano.
                </p>
              </div>
            </div>
          </div>

          {/* Seguimiento y cumplimiento */}
          <div>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Seguimiento y cumplimiento</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Fecha de t├®rmino de relaci├│n</label>
                <input type="date" className="input-field"
                  value={form.fecha_termino_relacion}
                  onChange={e => set('fecha_termino_relacion', e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Dejar en blanco si la relaci├│n est├í activa.</p>
              </div>
              <div />
              {/* Checkboxes de documentaci├│n actualizada */}
              {[
                { key: 'kyc_actualizado',      label: 'Formulario KYC actualizado',              desc: 'El formulario de Conozca a su Cliente est├í vigente y firmado.' },
                { key: 'legal_actualizado',    label: 'Informaci├│n legal del cliente actualizada', desc: 'Documentos legales (c├®dula, constituci├│n, poderes) est├ín al d├¡a.' },
                { key: 'ingresos_actualizados',label: 'Informaci├│n de ingresos actualizada',      desc: 'Declaraci├│n de ingresos o estados financieros est├ín vigentes.' },
                { key: 'aparece_en_listas',    label: 'Aparece en listas internacionales de investigaci├│n', desc: 'El cliente figura en listas de control internacionales (OFAC, ONU, GAFI, etc.).' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="col-span-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded text-brand-600 mt-0.5 flex-shrink-0"
                      checked={form[key]} onChange={e => set(key, e.target.checked)} />
                    <div>
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </label>
                </div>
              ))}
              <div className="col-span-2">
                <label className="label">Notas / observaciones</label>
                <textarea className="input-field" rows={2}
                  value={form.notas} onChange={e => set('notas', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={cancelar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'GuardandoÔÇª' : editId ? 'Actualizar' : 'Guardar cliente'}
            </button>
          </div>
        </form>
      )}

      {/* Carga masiva */}
      <CargaMasivaClientesSicveca
        tenants={tenants}
        etiquetaCliente={etiqueta}
        onImportado={load}
      />

      {/* Lista */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">{filtrados.length} de {clientes.length} clientes</p>
          <div className="flex gap-2">
            {filtroRiesgo && (
              <button onClick={() => setFiltroRiesgo('')}
                className="text-xs px-2 py-1 bg-brand-100 text-brand-700 rounded-full">
                Ô£ò Filtro: {filtroRiesgo}
              </button>
            )}
            <input className="input-field w-64" placeholder="Buscar por nombre o identificaci├│nÔÇª"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400">CargandoÔÇª</div>
        ) : filtrados.length === 0 ? (
          <div className="py-10 text-center text-gray-400">No hay clientes que coincidan.</div>
        ) : (
          <div className="space-y-2">
            {filtrados.map(c => {
              const nombre = c.nombre_empresa || `${c.nombre_cliente || ''} ${c.primer_apellido || ''}`.trim()
              const riesgo = c.calificacion_riesgo ? RIESGO_CONFIG[c.calificacion_riesgo] : null
              const esDetalle = detalleId === c.id
              return (
                <div key={c.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 flex items-center gap-4 hover:bg-gray-50">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                      c.calificacion_riesgo === 'alto' ? 'bg-red-500' :
                      c.calificacion_riesgo === 'medio' ? 'bg-yellow-500' :
                      c.calificacion_riesgo === 'bajo' ? 'bg-green-500' : 'bg-brand-600'
                    }`}>
                      {nombre[0]?.toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 truncate">{nombre}</p>
                        {c.pep && (
                          <span className="px-1.5 py-0.5 bg-dorado-100 text-dorado-800 text-xs font-bold rounded">PEP</span>
                        )}
                        {riesgo && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${riesgo.color}`}>
                            Riesgo {riesgo.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 font-mono">{c.numero_identificacion} ┬À {TIPO_ID_LABEL[c.tipo_identificacion]}</p>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-6 text-sm text-gray-500 flex-shrink-0">
                      {c.actividad_economica && (
                        <span className="text-xs">{c.actividad_economica}</span>
                      )}
                      {c.ingreso_mensual_est && (
                        <div className="text-center">
                          <p className="font-medium text-gray-900 text-xs">USD {Number(c.ingreso_mensual_est).toLocaleString()}</p>
                          <p className="text-xs text-gray-400">Ingreso/mes</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => verDetalle(c)}
                        className="text-brand-600 hover:text-brand-800 text-xs font-medium">
                        {esDetalle ? 'Ocultar' : 'Ver detalle'}
                      </button>
                      <button onClick={() => startEdit(c)}
                        className="btn-secondary text-xs py-1.5 px-3">Editar</button>
                      <button
                        onClick={() => imprimirFicha(c)}
                        title="Imprimir ficha completa del cliente"
                        className="text-xs py-1.5 px-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors">
                        🖨️ Ficha
                      </button>
                      <button onClick={() => eliminar(c.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">Eliminar</button>
                    </div>
                  </div>

                  {/* Detalle expandible */}
                  {esDetalle && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4 text-sm">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Info general */}
                        <div>
                          <p className="font-semibold text-gray-700 mb-2">Informaci├│n del cliente</p>
                          <dl className="space-y-1.5">
                            {c.actividad_economica && <div className="flex justify-between"><dt className="text-gray-400">Actividad</dt><dd className="font-medium">{c.actividad_economica}</dd></div>}
                            {c.nacionalidad && <div className="flex justify-between"><dt className="text-gray-400">Nacionalidad</dt><dd className="font-medium">{c.nacionalidad}</dd></div>}
                            {c.pais_ubicacion && <div className="flex justify-between"><dt className="text-gray-400">Pa├¡s</dt><dd className="font-medium">{c.pais_ubicacion}</dd></div>}
                            {c.nombre_contacto && <div className="flex justify-between"><dt className="text-gray-400">Contacto</dt><dd className="font-medium">{c.nombre_contacto}</dd></div>}
                            {c.telefono && <div className="flex justify-between"><dt className="text-gray-400">Tel├®fono</dt><dd className="font-medium">{c.telefono}</dd></div>}
                            {c.correo_electronico && <div className="flex justify-between"><dt className="text-gray-400">Correo</dt><dd className="font-medium">{c.correo_electronico}</dd></div>}
                            {c.fecha_vinculacion && <div className="flex justify-between"><dt className="text-gray-400">Vinculado desde</dt><dd className="font-medium">{c.fecha_vinculacion}</dd></div>}
                            {c.fecha_termino_relacion && (
                              <div className="flex justify-between">
                                <dt className="text-gray-400">T├®rmino relaci├│n</dt>
                                <dd className="font-medium text-red-600">{c.fecha_termino_relacion}</dd>
                              </div>
                            )}
                            {c.notas && <div className="mt-2"><p className="text-gray-400 text-xs mb-1">Notas:</p><p className="text-gray-700 text-xs bg-white p-2 rounded border">{c.notas}</p></div>}
                          </dl>
                        </div>
                        {/* ├Ültimas transacciones */}
                        <div>
                          <p className="font-semibold text-gray-700 mb-2">├Ültimas transacciones</p>
                          {txnsCliente.length === 0 ? (
                            <p className="text-gray-400 text-xs">Sin transacciones registradas para este {etiquetaSingular}.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {txnsCliente.map((t, i) => (
                                <div key={i} className="flex items-center justify-between bg-white rounded p-2 border text-xs">
                                  <span className="text-gray-500">{t.periodo?.substring(0, 7)}</span>
                                  <span className={t.tipo_movimiento === 1 ? 'text-green-600' : 'text-orange-600'}>
                                    {t.tipo_movimiento === 1 ? 'Ô¼å' : 'Ô¼ç'} USD {Number(t.monto_movimiento).toLocaleString('es-CR')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Estado de cumplimiento documental */}
                      <div className="border-t border-gray-200 pt-4">
                        <p className="font-semibold text-gray-700 mb-3">Estado de cumplimiento documental</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { key: 'kyc_actualizado',      label: 'KYC actualizado',       icon: '­ƒôï', invertir: false },
                            { key: 'legal_actualizado',    label: 'Info legal actualizada', icon: 'ÔÜû´©Å', invertir: false },
                            { key: 'ingresos_actualizados',label: 'Info ingresos actual.',  icon: '­ƒÆ░', invertir: false },
                            { key: 'aparece_en_listas',    label: 'Listas internacionales', icon: '­ƒöì', invertir: true },
                          ].map(({ key, label, icon, invertir }) => {
                            const ok = invertir ? !c[key] : c[key]
                            return (
                              <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                                <span>{icon}</span>
                                <span className="flex-1">{label}</span>
                                <span>{ok ? 'Ô£ô' : 'Ô£ù'}</span>
                              </div>
                            )
                          })}
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${c.fecha_ultima_calificacion ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                            <span>­ƒÄ»</span>
                            <div className="flex-1">
                              <p>├Ültima calificaci├│n</p>
                              <p className="font-bold">{c.fecha_ultima_calificacion ? new Date(c.fecha_ultima_calificacion).toLocaleDateString('es-CR') : 'Sin calificar'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
