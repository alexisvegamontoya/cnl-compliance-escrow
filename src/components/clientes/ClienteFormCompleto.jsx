/**
 * ClienteFormCompleto.jsx
 * Formulario completo de cliente (persona física y jurídica)
 * con dropdowns de actividad económica, provincia/cantón y país.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  ACTIVIDADES_PROFESIONES,
  CANTONES_CR,
  PROVINCIAS_CR,
  PAISES_RIESGO,
} from '../../lib/metodologiaRiesgo'
import EstructuraEmpresa from './EstructuraEmpresa'
import ChecklistDocumental from './ChecklistDocumental'
import { normalizarChecklist, resumenChecklist, itemsChecklist } from '../../lib/checklistDocumental'

const PAISES = PAISES_RIESGO.map(p => p.pais).sort()
const PAISES_ALL = [...new Set([
  'Costa Rica', 'Estados Unidos', 'México', 'España', 'Panamá', 'Colombia',
  'Venezuela', 'Nicaragua', 'Honduras', 'Guatemala', 'El Salvador',
  ...PAISES
])].sort()

const TIPOS_ID = [
  { v: '1', label: 'Cédula Nacional' },
  { v: '3', label: 'DIMEX' },
  { v: '2', label: 'Cédula Jurídica' },
  { v: '5', label: 'Pasaporte' },
  { v: '4', label: 'Otro' },
]

const ESTADOS_CIVILES  = ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión libre']
const ORIGENES_FONDOS  = ['Salario / planilla', 'Negocio propio', 'Venta de bienes', 'Inversiones', 'Herencia', 'Remesas', 'Pensión', 'Préstamo', 'Otro']

const EMPTY_FISICA = {
  tipo_persona: 'fisica',
  tipo_identificacion: '1',
  numero_identificacion: '',
  nombre_cliente: '',
  primer_apellido: '',
  segundo_apellido: '',
  fecha_nacimiento: '',
  genero: '',
  estado_civil: '',
  profesion_nombre: '',
  profesion_valor: null,
  pais_nacimiento: 'Costa Rica',
  pais_ubicacion: 'Costa Rica',
  pais_residencia: 'Costa Rica',
  provincia: '',
  canton: '',
  direccion_exacta: '',
  nombre_contacto: '',
  telefono: '',
  correo_electronico: '',
  fecha_vinculacion: new Date().toISOString().slice(0, 10),
  proposito_relacion: '',
  origen_fondos: '',
  ingreso_mensual_est: null,
  notas: '',
  nombre_empresa: '',
  actividad_economica: '',
  actividad_eco_nombre: '',
  actividad_eco_valor: null,
}

const EMPTY_JURIDICA = {
  tipo_persona: 'juridica',
  tipo_identificacion: '2',
  numero_identificacion: '',
  cedula_juridica: '',
  nombre_empresa: '',
  nombre_cliente: '',
  pais_constitucion: 'Costa Rica',
  fecha_constitucion: '',
  actividad_economica: '',
  actividad_eco_nombre: '',
  actividad_eco_valor: null,
  provincia: '',
  canton: '',
  direccion_exacta: '',
  nombre_contacto: '',
  telefono: '',
  correo_electronico: '',
  fecha_vinculacion: new Date().toISOString().slice(0, 10),
  proposito_relacion: '',
  origen_fondos: '',
  ingreso_mensual_est: null,
  pais_ubicacion: 'Costa Rica',
  notas: '',
}

export default function ClienteFormCompleto({ clienteInicial = null, onSave, onCancel, onBuscarDuplicado }) {
  const { tenant, session, isSuperAdmin } = useAuth()
  const esEdicion = !!clienteInicial

  const [tipoPers, setTipoPers]       = useState(clienteInicial?.tipo_persona || 'fisica')
  const [form, setForm]               = useState(clienteInicial || (tipoPers === 'fisica' ? EMPTY_FISICA : EMPTY_JURIDICA))
  const [personas, setPersonas]       = useState([])
  const [loadingPersonas, setLoadingPersonas] = useState(false)
  const [checklist, setChecklist]     = useState(() => normalizarChecklist(clienteInicial?.checklist_documental))
  const [tab, setTab]                 = useState('datos') // datos | estructura | documentacion | adicional
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [padronInfo, setPadronInfo]       = useState(null)
  const [padronStatus, setPadronStatus]   = useState('')
  const [padronLoading, setPadronLoading] = useState(false)

  // Superadmin: selector de tenant destino
  const [tenants, setTenants]           = useState([])
  const [tenantDestino, setTenantDestino] = useState(clienteInicial?.tenant_id || tenant?.id || '')

  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('tenants').select('id, nombre, actividad_apnfd').order('nombre')
      .then(({ data }) => {
        if (data) setTenants(data)
        // Si no hay tenant destino aún, dejar vacío para forzar selección
        if (!tenantDestino && data?.length > 0) setTenantDestino(data[0].id)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  // Cargar personas relacionadas si es edición
  useEffect(() => {
    if (esEdicion && clienteInicial?.id) {
      setLoadingPersonas(true)
      supabase.from('clientes_personas_relacionadas')
        .select('*')
        .eq('cliente_id', clienteInicial.id)
        .eq('activo', true)
        .order('orden')
        .then(({ data }) => {
          if (data) setPersonas(data)
          setLoadingPersonas(false)
        })
    }
  }, [esEdicion, clienteInicial?.id])

  // Sincronizar form cuando cambia tipo
  useEffect(() => {
    if (!esEdicion) {
      setForm(tipoPers === 'fisica' ? { ...EMPTY_FISICA, tipo_persona: 'fisica' } : { ...EMPTY_JURIDICA, tipo_persona: 'juridica' })
      setPersonas([])
    }
  }, [tipoPers, esEdicion])

  // Autocompletar desde padrón SUGEF (falla graciosamente si no existe el RPC)
  useEffect(() => {
    const cedula = (form.numero_identificacion || '').trim().replace(/[-\s]/g, '')
    if (cedula.length < 9) { setPadronInfo(null); setPadronStatus(''); return }
    const timer = setTimeout(async () => {
      setPadronLoading(true)
      try {
        const { data, error: rpcErr } = await supabase.rpc('buscar_padron', { p_identificacion: cedula })
        if (rpcErr) {
          // El RPC no existe o hay error — permitir llenar manualmente sin bloquear
          setPadronInfo(null)
          setPadronStatus('error')
        } else if (data?.length > 0) {
          const reg = data[0]
          setPadronInfo(reg)
          setPadronStatus('encontrado')
          if (reg.tipo === 'J' && !form.nombre_empresa) {
            set('nombre_empresa', reg.nombre_completo)
            set('cedula_juridica', cedula)
            set('tipo_persona', 'juridica')
            setTipoPers('juridica')
          } else if (reg.tipo === 'F') {
            const parts = (reg.nombre_completo || '').split(' ')
            if (!form.nombre_cliente) set('nombre_cliente', parts[0] || '')
            if (!form.primer_apellido && parts.length >= 3) {
              set('primer_apellido', parts[parts.length - 2] || '')
              set('segundo_apellido', parts[parts.length - 1] || '')
            }
          }
        } else {
          setPadronInfo(null)
          setPadronStatus('no_encontrado')
        }
      } catch {
        setPadronInfo(null)
        setPadronStatus('error')
      }
      setPadronLoading(false)
    }, 700)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.numero_identificacion])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const cantonesProvincia = CANTONES_CR.filter(c => c.provincia === form.provincia)

  const handleSave = async () => {
    const nombreFinal = tipoPers === 'fisica'
      ? `${form.nombre_cliente || ''} ${form.primer_apellido || ''} ${form.segundo_apellido || ''}`.trim()
      : form.nombre_empresa?.trim()

    if (isSuperAdmin && !tenantDestino) { setError('Debe seleccionar el sujeto obligado destino.'); return }
    if (!nombreFinal) { setError('El nombre es obligatorio.'); return }
    if (!form.numero_identificacion?.trim() && tipoPers === 'fisica') { setError('La identificación es obligatoria.'); return }

    setSaving(true)
    setError('')
    try {
      // Columnas permitidas en la tabla clientes (evita error si hay campos extra en el form state)
      const CAMPOS_PERMITIDOS = [
        'tenant_id','tipo_persona','tipo_identificacion','numero_identificacion',
        'nombre_cliente','primer_apellido','segundo_apellido','nombre_empresa','cedula_juridica',
        'fecha_nacimiento','genero','estado_civil',
        'actividad_economica','actividad_eco_nombre','actividad_eco_valor',
        'profesion_nombre','profesion_valor',
        'pais_nacimiento','pais_ubicacion','pais_residencia','pais_constitucion',
        'provincia','canton','direccion_exacta',
        'nombre_contacto','telefono','correo_electronico','fecha_vinculacion',
        'proposito_relacion','origen_fondos','ingreso_mensual_est',
        'fecha_constitucion',
        'estado_dd','estado_listas','estado_calificacion',
        'nivel_riesgo_actual','notas','activo',
      ]
      const payload = {}
      CAMPOS_PERMITIDOS.forEach(k => {
        if (form[k] !== undefined) payload[k] = form[k]
      })

      // Documentación presentada — mismo checklist de la Debida Diligencia
      payload.checklist_documental = checklist
      if (Object.keys(checklist).length > 0) {
        payload.checklist_actualizado_en = new Date().toISOString().slice(0, 10)
      }
      payload.tipo_persona    = tipoPers
      payload.tenant_id       = isSuperAdmin ? (tenantDestino || tenant?.id) : tenant?.id
      payload.nombre_cliente  = tipoPers === 'fisica'   ? (form.nombre_cliente || '') : ''
      payload.nombre_empresa  = tipoPers === 'juridica' ? (form.nombre_empresa  || '') : ''
      payload.cedula_juridica = tipoPers === 'juridica' ? (form.cedula_juridica || form.numero_identificacion || '') : null
      payload.pais_residencia = form.pais_ubicacion || null   // alias para compatibilidad
      payload.activo          = true

      // Convertir campos enteros/numéricos: vacío → null (evita "invalid input syntax for type integer")
      const CAMPOS_INT = ['profesion_valor','actividad_eco_valor','ingreso_mensual_est']
      CAMPOS_INT.forEach(k => {
        const v = payload[k]
        payload[k] = (v === '' || v === undefined || v === null) ? null : Number(v) || null
      })

      let clienteId
      if (esEdicion) {
        const { error: err } = await supabase.from('clientes').update(payload).eq('id', clienteInicial.id)
        if (err) throw err
        clienteId = clienteInicial.id
      } else {
        const { data, error: err } = await supabase.from('clientes').insert(payload).select('id').single()
        if (err) throw err
        clienteId = data.id
      }

      // Guardar personas relacionadas (para empresas)
      if (tipoPers === 'juridica' && personas.length > 0) {
        // Eliminar anteriores y reinsert
        if (esEdicion) {
          await supabase.from('clientes_personas_relacionadas').delete().eq('cliente_id', clienteId)
        }
        const personasPayload = personas.map((p, i) => ({
          tenant_id: tenant?.id,
          cliente_id: clienteId,
          tipo_relacion: p.tipo_relacion,
          tipo_entidad: p.tipo_entidad,
          nombre: p.nombre,
          identificacion: p.identificacion || null,
          tipo_id: p.tipo_id || null,
          nacionalidad: p.nacionalidad || null,
          pais_residencia: p.pais_residencia || null,
          porcentaje_participacion: p.porcentaje_participacion || null,
          es_beneficiario_final: p.es_beneficiario_final || false,
          cargo: p.cargo || null,
          sub_personas: p.sub_personas || [],
          notas: p.notas || null,
          orden: i,
          activo: true,
        }))
        const { error: errP } = await supabase.from('clientes_personas_relacionadas').insert(personasPayload)
        if (errP) console.warn('Error al guardar personas:', errP.message)
      }

      onSave(clienteId)
    } catch (e) {
      if (e.message?.includes('duplicate key') && e.message?.includes('numero_identificacion')) {
        setError(`__duplicado__${form.numero_identificacion}`)
      } else {
        setError('Error al guardar: ' + e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const resumenDoc = resumenChecklist(checklist, itemsChecklist({ tipoPersona: tipoPers, esPEP: !!form.pep }))

  const TABS = [
    { id: 'datos', label: '📋 Datos principales' },
    ...(tipoPers === 'juridica' ? [{ id: 'estructura', label: '🏢 Estructura' }] : []),
    { id: 'documentacion', label: `📄 Documentación (${resumenDoc.ok}/${resumenDoc.evaluables})` },
    { id: 'adicional', label: '📝 Información adicional' },
  ]

  return (
    <div className="space-y-4">
      {/* Selector de sujeto obligado (solo superadmin) */}
      {isSuperAdmin && (
        <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl flex items-center gap-3">
          <span className="text-brand-600 text-lg">🏢</span>
          <div className="flex-1">
            <label className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
              Sujeto Obligado destino
            </label>
            <select
              className="mt-1 w-full text-sm border border-brand-300 rounded-lg px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
              value={tenantDestino}
              onChange={e => setTenantDestino(e.target.value)}
            >
              <option value="">— Seleccione el sujeto obligado —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nombre}{t.actividad_apnfd ? ` · ${t.actividad_apnfd}` : ''}
                </option>
              ))}
            </select>
          </div>
          {tenantDestino && tenants.find(t => t.id === tenantDestino) && (
            <span className="text-xs bg-brand-600 text-white px-2 py-1 rounded-full whitespace-nowrap">
              ✓ {tenants.find(t => t.id === tenantDestino)?.nombre}
            </span>
          )}
        </div>
      )}

      {/* Selector tipo persona */}
      {!esEdicion && (
        <div className="flex gap-3">
          {[{ v: 'fisica', label: '👤 Persona Física' }, { v: 'juridica', label: '🏢 Persona Jurídica' }].map(opt => (
            <button key={opt.v} type="button" onClick={() => setTipoPers(opt.v)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                tipoPers === opt.v ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-300 text-gray-600 hover:border-brand-400'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      {TABS.length > 1 && (
        <div className="flex border-b border-gray-200">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── TAB: DATOS PRINCIPALES ── */}
      {tab === 'datos' && (
        <div className="space-y-4">
          {/* Identificación */}
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">
              {tipoPers === 'fisica' ? 'Identificación' : 'Datos de la empresa'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Tipo identificación</label>
                <select className="input text-sm" value={form.tipo_identificacion}
                  onChange={e => set('tipo_identificacion', e.target.value)}>
                  {TIPOS_ID.filter(t => tipoPers === 'fisica' ? t.v !== '2' : t.v === '2').map(t => (
                    <option key={t.v} value={t.v}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">
                  N° Identificación {padronLoading && '⟳'}
                </label>
                <input className="input text-sm" value={form.numero_identificacion}
                  onChange={e => set('numero_identificacion', e.target.value)}
                  placeholder="Número de identificación" />
                {padronLoading && (
                  <p className="text-xs text-gray-400 mt-0.5">⟳ Consultando padrón...</p>
                )}
                {!padronLoading && padronStatus === 'encontrado' && padronInfo && (
                  <p className="text-xs text-green-600 mt-0.5">✓ Encontrado en padrón: {padronInfo.nombre_completo}</p>
                )}
                {!padronLoading && padronStatus === 'no_encontrado' && (
                  <p className="text-xs text-amber-600 mt-0.5">⚠ No encontrado en padrón — complete los datos manualmente</p>
                )}
                {!padronLoading && padronStatus === 'error' && (
                  <p className="text-xs text-gray-400 mt-0.5">ℹ Padrón no disponible — complete los datos manualmente</p>
                )}
              </div>

              {tipoPers === 'fisica' ? (
                <>
                  <div>
                    <label className="label text-xs">Nombre *</label>
                    <input className="input text-sm" value={form.nombre_cliente}
                      onChange={e => set('nombre_cliente', e.target.value)} placeholder="Nombre" />
                  </div>
                  <div>
                    <label className="label text-xs">Primer apellido</label>
                    <input className="input text-sm" value={form.primer_apellido}
                      onChange={e => set('primer_apellido', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Segundo apellido</label>
                    <input className="input text-sm" value={form.segundo_apellido}
                      onChange={e => set('segundo_apellido', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Fecha nacimiento</label>
                    <input type="date" className="input text-sm" value={form.fecha_nacimiento}
                      onChange={e => set('fecha_nacimiento', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Género</label>
                    <select className="input text-sm" value={form.genero} onChange={e => set('genero', e.target.value)}>
                      <option value="">— Seleccione —</option>
                      <option value="M">Masculino</option>
                      <option value="F">Femenino</option>
                      <option value="otro">Otro / No indica</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Estado civil</label>
                    <select className="input text-sm" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {ESTADOS_CIVILES.map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <label className="label text-xs">Razón social *</label>
                    <input className="input text-sm" value={form.nombre_empresa}
                      onChange={e => set('nombre_empresa', e.target.value)} placeholder="Nombre completo de la empresa" />
                  </div>
                  <div>
                    <label className="label text-xs">País de constitución</label>
                    <select className="input text-sm" value={form.pais_constitucion}
                      onChange={e => set('pais_constitucion', e.target.value)}>
                      {PAISES_ALL.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Fecha de constitución</label>
                    <input type="date" className="input text-sm" value={form.fecha_constitucion}
                      onChange={e => set('fecha_constitucion', e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actividad / Profesión */}
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">
              {tipoPers === 'fisica' ? 'Profesión u oficio' : 'Actividad económica'}
            </p>
            <div>
              <label className="label text-xs">
                {tipoPers === 'fisica' ? 'Profesión / Ocupación' : 'Actividad económica (CIIU)'}
              </label>
              <select className="input text-sm"
                value={form.profesion_nombre || form.actividad_eco_nombre || ''}
                onChange={e => {
                  const nombre = e.target.value
                  const act = ACTIVIDADES_PROFESIONES.find(a => a.label === nombre)
                  if (tipoPers === 'fisica') {
                    set('profesion_nombre', nombre)
                    set('profesion_valor', act?.valor ?? null)
                    set('actividad_economica', nombre)
                  } else {
                    set('actividad_eco_nombre', nombre)
                    set('actividad_eco_valor', act?.valor ?? null)
                    set('actividad_economica', nombre)
                  }
                }}>
                <option value="">— Seleccione —</option>
                <optgroup label="🔴 Alto riesgo">
                  {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 3).map(a => <option key={a.label}>{a.label}</option>)}
                </optgroup>
                <optgroup label="🟡 Riesgo medio">
                  {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 2).map(a => <option key={a.label}>{a.label}</option>)}
                </optgroup>
                <optgroup label="🟢 Bajo riesgo">
                  {ACTIVIDADES_PROFESIONES.filter(a => a.valor === 1).map(a => <option key={a.label}>{a.label}</option>)}
                </optgroup>
              </select>
              {(form.profesion_valor || form.actividad_eco_valor) && (
                <div className={`mt-1 text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${
                  (form.profesion_valor || form.actividad_eco_valor) == 1 ? 'bg-green-100 text-green-700' :
                  (form.profesion_valor || form.actividad_eco_valor) == 2 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {(form.profesion_valor || form.actividad_eco_valor) == 1 ? '🟢 Riesgo bajo' :
                   (form.profesion_valor || form.actividad_eco_valor) == 2 ? '🟡 Riesgo medio' : '🔴 Riesgo alto'}
                </div>
              )}
            </div>
          </div>

          {/* País / Dirección */}
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">País y dirección</p>
            <div className="grid grid-cols-2 gap-3">
              {tipoPers === 'fisica' && (
                <div>
                  <label className="label text-xs">País de nacimiento</label>
                  <select className="input text-sm" value={form.pais_nacimiento}
                    onChange={e => set('pais_nacimiento', e.target.value)}>
                    {PAISES_ALL.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label text-xs">País de residencia / ubicación</label>
                <select className="input text-sm" value={form.pais_ubicacion}
                  onChange={e => { set('pais_ubicacion', e.target.value); set('pais_residencia', e.target.value) }}>
                  {PAISES_ALL.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Provincia (Costa Rica)</label>
                <select className="input text-sm" value={form.provincia}
                  onChange={e => { set('provincia', e.target.value); set('canton', '') }}>
                  <option value="">— Seleccione —</option>
                  {PROVINCIAS_CR.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Cantón</label>
                <select className="input text-sm" value={form.canton}
                  onChange={e => set('canton', e.target.value)}
                  disabled={!form.provincia}>
                  <option value="">— Seleccione cantón —</option>
                  {cantonesProvincia.map(c => <option key={c.canton}>{c.canton}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label text-xs">Dirección exacta</label>
                <input className="input text-sm" value={form.direccion_exacta}
                  onChange={e => set('direccion_exacta', e.target.value)}
                  placeholder="Dirección completa..." />
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label text-xs">Nombre del contacto</label>
                <input className="input text-sm" value={form.nombre_contacto}
                  onChange={e => set('nombre_contacto', e.target.value)} placeholder="Persona de contacto en la empresa" />
              </div>
              <div>
                <label className="label text-xs">Teléfono</label>
                <input className="input text-sm" value={form.telefono}
                  onChange={e => set('telefono', e.target.value)} placeholder="Número de teléfono" />
              </div>
              <div>
                <label className="label text-xs">Correo electrónico</label>
                <input type="email" className="input text-sm" value={form.correo_electronico}
                  onChange={e => set('correo_electronico', e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="label text-xs">Fecha de vinculación</label>
                <input type="date" className="input text-sm" value={form.fecha_vinculacion}
                  onChange={e => set('fecha_vinculacion', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ESTRUCTURA (solo empresas) ── */}
      {tab === 'estructura' && (
        <div className="card">
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            <p className="font-semibold">Acuerdo SUGEF 13-19, Art. 27-30</p>
            <p>Registre todos los representantes legales, miembros de junta directiva y socios/accionistas. Los socios que sean empresas pueden expandirse para registrar su propia estructura hasta llegar a la persona física (Beneficiario Final).</p>
          </div>
          {loadingPersonas ? (
            <p className="text-sm text-gray-400 text-center py-4">Cargando estructura...</p>
          ) : (
            <EstructuraEmpresa personas={personas} onChange={setPersonas} />
          )}
        </div>
      )}

      {/* ── TAB: DOCUMENTACIÓN PRESENTADA ── */}
      {tab === 'documentacion' && (
        <div className="card space-y-3">
          <div className="border-b pb-2">
            <p className="text-sm font-bold text-gray-700">📄 Documentación presentada</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Marque los documentos que el cliente ya entregó. Es el mismo checklist que se completa
              en la Debida Diligencia y el que más pesa en la calificación de cumplimiento del cliente.
            </p>
          </div>
          <ChecklistDocumental
            checklist={checklist}
            onChange={setChecklist}
            tipoPersona={tipoPers}
            esPEP={!!form.pep}
          />
        </div>
      )}

      {/* ── TAB: INFORMACIÓN ADICIONAL ── */}
      {tab === 'adicional' && (
        <div className="card space-y-4">
          <p className="text-sm font-bold text-gray-700 border-b pb-2">Propósito y perfil financiero</p>
          <div className="space-y-3">
            <div>
              <label className="label text-xs">Propósito de la relación comercial *</label>
              <textarea className="input text-sm" rows={3}
                value={form.proposito_relacion}
                onChange={e => set('proposito_relacion', e.target.value)}
                placeholder="Describa el propósito de la relación comercial (Art. 29, Acuerdo SUGEF 13-19)..." />
            </div>
            <div>
              <label className="label text-xs">Origen de fondos</label>
              <select className="input text-sm" value={form.origen_fondos}
                onChange={e => set('origen_fondos', e.target.value)}>
                <option value="">— Seleccione —</option>
                {ORIGENES_FONDOS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Ingreso mensual estimado (USD)</label>
              <input type="number" className="input text-sm" min="0"
                value={form.ingreso_mensual_est}
                onChange={e => set('ingreso_mensual_est', e.target.value)}
                placeholder="Monto en dólares" />
            </div>
            <div>
              <label className="label text-xs">Notas internas</label>
              <textarea className="input text-sm" rows={3}
                value={form.notas}
                onChange={e => set('notas', e.target.value)}
                placeholder="Observaciones adicionales (uso interno del oficial de cumplimiento)..." />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && error.startsWith('__duplicado__') ? (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <span>⚠ Ya existe un cliente con la identificación <strong>"{error.replace('__duplicado__', '')}"</strong> en este sujeto obligado.</span>
          <button
            onClick={() => onBuscarDuplicado ? onBuscarDuplicado(error.replace('__duplicado__', '')) : onCancel()}
            className="shrink-0 px-3 py-1.5 bg-amber-700 text-white text-xs rounded-lg hover:bg-amber-800 transition-colors">
            🔍 Ir a buscar
          </button>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">⚠ {error}</div>
      ) : null}

      {/* Botones */}
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-200">
        <button onClick={onCancel} className="px-5 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        {tab !== TABS[TABS.length - 1].id ? (
          <button onClick={() => setTab(TABS[TABS.indexOf(TABS.find(t => t.id === tab)) + 1].id)}
            className="btn-primary px-6">
            Siguiente →
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving}
            className="btn-primary px-6 disabled:opacity-60">
            {saving ? 'Guardando...' : esEdicion ? '✓ Actualizar cliente' : '✓ Crear cliente'}
          </button>
        )}
      </div>
    </div>
  )
}
