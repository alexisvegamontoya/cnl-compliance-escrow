/**
 * GestionClientes.jsx
 * Módulo completo de gestión de clientes (separado de SICVECA).
 * Vistas: lista | perfil | form
 */
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import ClienteFormCompleto from '../components/clientes/ClienteFormCompleto'
import CargaMasivaClientes from '../components/clientes/CargaMasivaClientes'
import { exportarExcel } from '../lib/exportExcel'
import { imprimirFichaCliente } from '../utils/imprimirFicha'

const InformeClienteCompleto = lazy(() => import('../components/clientes/InformeClienteCompleto'))

// ─── Helpers ────────────────────────────────────────────────────────────────
const NIVEL_COLORS = {
  bajo:     'bg-green-100 text-green-700',
  medio:    'bg-yellow-100 text-yellow-700',
  alto:     'bg-orange-100 text-orange-700',
  muy_alto: 'bg-red-100 text-red-700',
}
const ESTADO_DD_COLORS = {
  pendiente:   'bg-gray-100 text-gray-600',
  en_proceso:  'bg-blue-100 text-blue-700',
  completado:  'bg-green-100 text-green-700',
}
const TIPO_RELACION_LABELS = {
  representante_legal: 'Rep. Legal',
  junta_directiva:     'Junta Dir.',
  socio:               'Socio/Acc.',
  beneficiario_final:  'Ben. Final',
  apoderado:           'Apoderado',
  otro:                'Otro',
}

function Badge({ cls = '', children }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{children}</span>
}

function NivelBadge({ nivel }) {
  if (!nivel) return <Badge cls="bg-gray-100 text-gray-500">Sin calificar</Badge>
  return <Badge cls={NIVEL_COLORS[nivel] || 'bg-gray-100 text-gray-500'}>{nivel.replace('_', ' ')}</Badge>
}

function EstadoBadge({ estado, tipo = 'dd' }) {
  const map = tipo === 'dd' ? ESTADO_DD_COLORS : ESTADO_DD_COLORS
  return <Badge cls={map[estado] || 'bg-gray-100 text-gray-500'}>{estado || 'pendiente'}</Badge>
}

function nombre_completo(c) {
  if (!c) return '—'
  if (c.tipo_persona === 'juridica') return c.nombre_empresa || c.nombre_cliente || '—'
  return [c.nombre_cliente, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ') || c.nombre_empresa || '—'
}

// ─── Lista de clientes ───────────────────────────────────────────────────────
function TablaClientes({ onSelect, onNuevo, onCargaMasiva, buscarInicial = '' }) {
  const { tenant, isSuperAdmin } = useAuth()

  const [clientes, setClientes]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [buscar, setBuscar]           = useState(buscarInicial)
  const [filtroTipo, setFiltroTipo]   = useState('')
  const [filtroRiesgo, setFiltroRiesgo] = useState('')
  const [filtroDd, setFiltroDd]       = useState('')
  const [filtroTenant, setFiltroTenant] = useState('')   // solo superadmin
  const [tenants, setTenants]         = useState([])     // solo superadmin

  // Cargar lista de tenants para superadmin
  useEffect(() => {
    if (!isSuperAdmin) return
    supabase.from('tenants').select('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
  }, [isSuperAdmin])

  const cargar = useCallback(async () => {
    if (!tenant?.id && !isSuperAdmin) return
    setLoading(true)
    let q = supabase.from('clientes').select('*').order('id', { ascending: false })
    // Superadmin: filtra por tenant seleccionado o muestra todos
    if (isSuperAdmin) {
      if (filtroTenant) q = q.eq('tenant_id', filtroTenant)
    } else {
      q = q.eq('tenant_id', tenant.id)
    }
    if (filtroTipo)   q = q.eq('tipo_persona', filtroTipo)
    if (filtroRiesgo) q = q.eq('nivel_riesgo_actual', filtroRiesgo)
    if (filtroDd)     q = q.eq('estado_dd', filtroDd)
    const { data, error } = await q
    if (error) console.error('Error cargando clientes:', error)
    setClientes(data || [])
    setLoading(false)
  }, [tenant?.id, isSuperAdmin, filtroTenant, filtroTipo, filtroRiesgo, filtroDd])

  useEffect(() => { cargar() }, [cargar])

  async function eliminar(e, id) {
    e.stopPropagation()
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return
    await supabase.from('clientes').delete().eq('id', id)
    cargar()
  }

  const filtrados = clientes.filter(c => {
    if (!buscar) return true
    const t = buscar.toLowerCase()
    return (
      nombre_completo(c).toLowerCase().includes(t) ||
      (c.numero_identificacion || '').includes(t) ||
      (c.cedula_juridica || '').includes(t) ||
      (c.correo_electronico || '').toLowerCase().includes(t)
    )
  })

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => exportarExcel({
              data: filtrados.map(c => ({
                ...c,
                pep:               c.pep               ? 'Sí' : 'No',
                aparece_en_listas: c.aparece_en_listas ? 'Sí' : 'No',
                kyc_actualizado:   c.kyc_actualizado   ? 'Sí' : 'No',
                legal_actualizado: c.legal_actualizado ? 'Sí' : 'No',
                ingresos_actualizados: c.ingresos_actualizados ? 'Sí' : 'No',
                activo:            c.activo            ? 'Sí' : 'No',
              })),
              columnas: [
                'numero_identificacion','cedula_juridica','tipo_identificacion',
                'nombre_cliente','primer_apellido','segundo_apellido','nombre_empresa',
                'nacionalidad','pais_ubicacion','pais_nacimiento',
                'fecha_nacimiento','fecha_constitucion',
                'profesion_nombre','actividad_eco_nombre',
                'telefono','correo_electronico',
                'fecha_vinculacion',
                'proposito_relacion',
                'pep','aparece_en_listas','estado_listas',
                'nivel_riesgo_actual','estado_calificacion',
                'estado_dd',
                'kyc_actualizado','legal_actualizado','ingresos_actualizados',
                'activo','notas',
              ],
              headers: {
                numero_identificacion: 'N° Identificación',
                cedula_juridica:       'Cédula Jurídica',
                tipo_identificacion:   'Tipo ID',
                nombre_cliente:        'Nombre',
                primer_apellido:       'Primer Apellido',
                segundo_apellido:      'Segundo Apellido',
                nombre_empresa:        'Razón Social',
                nacionalidad:          'Nacionalidad',
                pais_ubicacion:        'País Ubicación',
                pais_nacimiento:       'País Nacimiento',
                fecha_nacimiento:      'Fecha Nacimiento',
                fecha_constitucion:    'Fecha Constitución',
                profesion_nombre:      'Profesión',
                actividad_eco_nombre:  'Actividad Económica',
                telefono:              'Teléfono',
                correo_electronico:    'Correo',
                fecha_vinculacion:     'Fecha Vinculación',
                proposito_relacion:    'Propósito Relación',
                pep:                   'PEP',
                aparece_en_listas:     'Aparece en Listas',
                estado_listas:         'Estado Listas',
                nivel_riesgo_actual:   'Nivel Riesgo',
                estado_calificacion:   'Estado Calificación',
                estado_dd:             'Estado DD',
                kyc_actualizado:       'KYC Actualizado',
                legal_actualizado:     'Doc. Legal OK',
                ingresos_actualizados: 'Ingresos Actualizados',
                activo:                'Activo',
                notas:                 'Notas',
              },
              nombreArchivo: `clientes_${tenant?.nombre?.replace(/\s/g,'_') || 'cnl'}`,
              nombreHoja: 'Clientes',
            })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            📊 Exportar Excel
          </button>
          <button onClick={onCargaMasiva}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            📥 Carga masiva Excel
          </button>
          <button onClick={onNuevo} className="btn-primary flex items-center gap-2">
            <span className="text-lg leading-none">+</span> Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap gap-3 items-end">
        {isSuperAdmin && (
          <div className="w-full">
            <label className="label text-xs text-purple-700">🔐 Sujeto Obligado (superadmin)</label>
            <select className="input text-sm border-purple-300 focus:ring-purple-400"
              value={filtroTenant} onChange={e => setFiltroTenant(e.target.value)}>
              <option value="">— Todos los sujetos obligados —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className="label text-xs">Buscar</label>
          <input className="input text-sm" placeholder="Nombre, cédula, correo..."
            value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Tipo</label>
          <select className="input text-sm" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="fisica">Persona Física</option>
            <option value="juridica">Persona Jurídica</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Riesgo</label>
          <select className="input text-sm" value={filtroRiesgo} onChange={e => setFiltroRiesgo(e.target.value)}>
            <option value="">Todos</option>
            <option value="bajo">Bajo</option>
            <option value="medio">Medio</option>
            <option value="alto">Alto</option>
            <option value="muy_alto">Muy alto</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Estado DD</label>
          <select className="input text-sm" value={filtroDd} onChange={e => setFiltroDd(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En proceso</option>
            <option value="completado">Completado</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando clientes…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="font-medium">No hay clientes registrados</p>
          <button onClick={onNuevo} className="mt-4 btn-primary">Registrar primer cliente</button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Identificación</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Actividad</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Riesgo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">DD</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Listas</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(c => (
                <tr key={c.id} onClick={() => onSelect(c)}
                  className="hover:bg-brand-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{c.tipo_persona === 'juridica' ? '🏢' : '👤'}</span>
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{nombre_completo(c)}</p>
                        {c.correo_electronico && (
                          <p className="text-xs text-gray-400">{c.correo_electronico}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {c.cedula_juridica || c.numero_identificacion || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px] truncate">
                    {c.actividad_eco_nombre || c.profesion_nombre || c.actividad_economica || '—'}
                  </td>
                  <td className="px-4 py-3"><NivelBadge nivel={c.nivel_riesgo_actual} /></td>
                  <td className="px-4 py-3"><EstadoBadge estado={c.estado_dd} /></td>
                  <td className="px-4 py-3"><EstadoBadge estado={c.estado_listas} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button className="text-brand-600 hover:text-brand-800 text-xs font-medium">Ver →</button>
                      <button
                        onClick={e => eliminar(e, c.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Perfil del cliente ──────────────────────────────────────────────────────
function PerfilCliente({ cliente, onEditar, onVolver }) {
  const navigate = useNavigate()
  const { tenant, profile } = useAuth()
  const [tab, setTab] = useState('datos')
  const [personas, setPersonas] = useState([])
  const [histDD, setHistDD]     = useState([])
  const [histListas, setHistListas] = useState([])
  const [histCal, setHistCal]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [mostrarInforme, setMostrarInforme] = useState(false)

  const nombre = nombre_completo(cliente)

  useEffect(() => {
    if (!cliente?.id) return
    setLoading(true)
    Promise.all([
      supabase.from('clientes_personas_relacionadas').select('*')
        .eq('cliente_id', cliente.id).eq('activo', true).order('orden'),
      supabase.from('expedientes_dd').select('id, creado_en, estado, observaciones')
        .eq('cliente_id', cliente.id).order('creado_en', { ascending: false }).limit(5),
      supabase.from('calificaciones_riesgo').select('id, creado_en, nivel_riesgo, observaciones')
        .eq('cliente_id', cliente.id).order('creado_en', { ascending: false }).limit(5),
    ]).then(([{ data: p }, { data: dd }, { data: cal }]) => {
      setPersonas(p || [])
      setHistDD(dd || [])
      setHistCal(cal || [])
      setLoading(false)
    })
  }, [cliente?.id])

  const irAListas = () => navigate('/listas', {
    state: {
      prefill: {
        nombre: nombre,
        identificacion: cliente.cedula_juridica || cliente.numero_identificacion || '',
      }
    }
  })

  const irADD = () => navigate('/debida-diligencia', {
    state: { clienteId: cliente.id, nombreCliente: nombre }
  })

  const irACalificacion = () => navigate('/calificacion', {
    state: { clienteId: cliente.id, nombreCliente: nombre }
  })

  const TABS = [
    { id: 'datos',     label: '📋 Datos' },
    ...(cliente.tipo_persona === 'juridica' ? [{ id: 'estructura', label: '🏢 Estructura' }] : []),
    { id: 'historial', label: '📁 Historial' },
  ]

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      {mostrarInforme && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-gray-500 animate-pulse">Cargando expediente...</p>
            </div>
          </div>
        }>
          <InformeClienteCompleto
            cliente={cliente}
            onClose={() => setMostrarInforme(false)}
          />
        </Suspense>
      )}

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onVolver} className="mt-1 text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{cliente.tipo_persona === 'juridica' ? '🏢' : '👤'}</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{nombre}</h1>
              <p className="text-sm text-gray-500">
                {cliente.cedula_juridica || cliente.numero_identificacion || 'Sin identificación'} ·{' '}
                {cliente.tipo_persona === 'juridica' ? 'Persona jurídica' : 'Persona física'}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <NivelBadge nivel={cliente.nivel_riesgo_actual} />
              <button onClick={() => setMostrarInforme(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-700 text-white rounded-lg hover:bg-brand-800 transition-colors">
                📄 Generar expediente
              </button>
              <button
                onClick={() => {
                  // Normalizar campos para imprimirFichaCliente
                  const c = {
                    ...cliente,
                    numero_identificacion: cliente.numero_identificacion || cliente.cedula_juridica || '',
                    nombre_empresa: cliente.tipo_persona === 'juridica'
                      ? (cliente.nombre_empresa || cliente.nombre_cliente || '')
                      : undefined,
                  }
                  imprimirFichaCliente({ cliente: c, personas, tenant, profile })
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                🖨️ Imprimir ficha
              </button>
              <button onClick={onEditar} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                ✏ Editar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '🔎 Consultar en Listas', desc: 'PEP / Listas internacionales', fn: irAListas, color: 'border-blue-200 hover:bg-blue-50' },
          { label: '🛡 Debida Diligencia', desc: 'Verificación ampliada', fn: irADD, color: 'border-purple-200 hover:bg-purple-50' },
          { label: '🎯 Calificación de Riesgo', desc: 'Metodología SUGEF 13-19', fn: irACalificacion, color: 'border-orange-200 hover:bg-orange-50' },
        ].map(a => (
          <button key={a.label} onClick={a.fn}
            className={`card text-left border-2 ${a.color} transition-colors p-4 space-y-1`}>
            <p className="text-sm font-semibold text-gray-800">{a.label}</p>
            <p className="text-xs text-gray-500">{a.desc}</p>
          </button>
        ))}
      </div>

      {/* Estado badges */}
      <div className="card flex flex-wrap gap-4 text-sm py-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">Debida diligencia:</span>
          <EstadoBadge estado={cliente.estado_dd} />
          {cliente.ultima_revision_dd && <span className="text-xs text-gray-400">{cliente.ultima_revision_dd}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">Listas internacionales:</span>
          <EstadoBadge estado={cliente.estado_listas} />
          {cliente.ultima_consulta_listas && <span className="text-xs text-gray-400">{cliente.ultima_consulta_listas}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">Calificación:</span>
          <EstadoBadge estado={cliente.estado_calificacion} />
          {cliente.ultima_calificacion && <span className="text-xs text-gray-400">{cliente.ultima_calificacion}</span>}
        </div>
      </div>

      {/* Tabs */}
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

      {/* TAB: Datos */}
      {tab === 'datos' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">Identificación</p>
            <Row label="Tipo" v={cliente.tipo_persona === 'juridica' ? 'Persona Jurídica' : 'Persona Física'} />
            <Row label="Identificación" v={cliente.cedula_juridica || cliente.numero_identificacion} />
            {cliente.tipo_persona === 'fisica' && (
              <>
                <Row label="Nombre completo" v={nombre} />
                <Row label="Fecha nacimiento" v={cliente.fecha_nacimiento} />
                <Row label="Género" v={cliente.genero === 'M' ? 'Masculino' : cliente.genero === 'F' ? 'Femenino' : cliente.genero} />
                <Row label="Estado civil" v={cliente.estado_civil} />
                <Row label="Profesión" v={cliente.profesion_nombre || cliente.actividad_economica} />
              </>
            )}
            {cliente.tipo_persona === 'juridica' && (
              <>
                <Row label="Razón social" v={cliente.nombre_empresa} />
                <Row label="Fecha constitución" v={cliente.fecha_constitucion} />
                <Row label="País de constitución" v={cliente.pais_constitucion} />
                <Row label="Actividad económica" v={cliente.actividad_eco_nombre || cliente.actividad_economica} />
              </>
            )}
          </div>
          <div className="card space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">Ubicación y contacto</p>
            <Row label="País nacimiento" v={cliente.pais_nacimiento} />
            <Row label="País residencia" v={cliente.pais_ubicacion || cliente.pais_residencia} />
            <Row label="Provincia" v={cliente.provincia} />
            <Row label="Cantón" v={cliente.canton} />
            <Row label="Dirección" v={cliente.direccion_exacta} />
            <Row label="Teléfono" v={cliente.telefono} />
            <Row label="Correo" v={cliente.correo_electronico} />
            <Row label="Vinculación" v={cliente.fecha_vinculacion} />
          </div>
          <div className="card col-span-2 space-y-3">
            <p className="text-sm font-bold text-gray-700 border-b pb-2">Perfil financiero</p>
            <div className="grid grid-cols-3 gap-4">
              <Row label="Propósito de relación" v={cliente.proposito_relacion} />
              <Row label="Origen de fondos" v={cliente.origen_fondos} />
              <Row label="Ingreso mensual est." v={cliente.ingreso_mensual_est ? `USD ${Number(cliente.ingreso_mensual_est).toLocaleString()}` : null} />
            </div>
            {cliente.notas && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">{cliente.notas}</div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Estructura empresarial */}
      {tab === 'estructura' && (
        <div className="card space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Cargando estructura…</p>
          ) : personas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No hay personas relacionadas registradas.</p>
              <button onClick={onEditar} className="mt-3 btn-primary text-sm">Agregar estructura →</button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Representantes */}
              <SeccionPersonas titulo="Representantes Legales" emoji="⚖️"
                items={personas.filter(p => p.tipo_relacion === 'representante_legal')} />
              {/* Junta */}
              <SeccionPersonas titulo="Junta Directiva" emoji="🏛"
                items={personas.filter(p => p.tipo_relacion === 'junta_directiva')} />
              {/* Socios */}
              <SeccionPersonas titulo="Socios / Accionistas" emoji="📊"
                items={personas.filter(p => p.tipo_relacion === 'socio')} />
            </div>
          )}
        </div>
      )}

      {/* TAB: Historial */}
      {tab === 'historial' && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-sm font-bold text-gray-700 border-b pb-2 mb-3">📁 Debida Diligencia</p>
            {histDD.length === 0 ? (
              <p className="text-sm text-gray-400">Sin registros de debida diligencia.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr><th className="text-left pb-2">Fecha</th><th className="text-left pb-2">Estado</th><th className="text-left pb-2">Observaciones</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {histDD.map(d => (
                    <tr key={d.id}>
                      <td className="py-2 text-gray-500">{d.creado_en?.slice(0, 10)}</td>
                      <td className="py-2"><EstadoBadge estado={d.estado} /></td>
                      <td className="py-2 text-gray-600 max-w-xs truncate">{d.observaciones || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <p className="text-sm font-bold text-gray-700 border-b pb-2 mb-3">🎯 Calificaciones de Riesgo</p>
            {histCal.length === 0 ? (
              <p className="text-sm text-gray-400">Sin calificaciones registradas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr><th className="text-left pb-2">Fecha</th><th className="text-left pb-2">Nivel</th><th className="text-left pb-2">Observaciones</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {histCal.map(c => (
                    <tr key={c.id}>
                      <td className="py-2 text-gray-500">{c.creado_en?.slice(0, 10)}</td>
                      <td className="py-2"><NivelBadge nivel={c.nivel_riesgo} /></td>
                      <td className="py-2 text-gray-600 max-w-xs truncate">{c.observaciones || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Fila de dato
function Row({ label, v }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{v || <span className="text-gray-400 font-normal">—</span>}</p>
    </div>
  )
}

// Sección de personas en perfil (vista de solo lectura)
function SeccionPersonas({ titulo, emoji, items }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">{emoji} {titulo}</p>
      <div className="space-y-2">
        {items.map((p, i) => (
          <PersonaCard key={p.id || i} persona={p} nivel={0} />
        ))}
      </div>
    </div>
  )
}

function PersonaCard({ persona, nivel }) {
  const [abierto, setAbierto] = useState(false)
  const subs = persona.sub_personas || []
  return (
    <div className={`border rounded-lg p-3 ${nivel === 0 ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 ml-4'}`}>
      <div className="flex items-center gap-2">
        <span>{persona.tipo_entidad === 'persona_juridica' ? '🏢' : '👤'}</span>
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900">{persona.nombre}</span>
          {persona.identificacion && <span className="text-xs text-gray-400 ml-2">({persona.identificacion})</span>}
          {persona.cargo && <span className="text-xs text-gray-500 ml-2">· {persona.cargo}</span>}
          {persona.porcentaje_participacion != null && (
            <span className="text-xs text-blue-600 ml-2">{persona.porcentaje_participacion}%</span>
          )}
          {persona.es_beneficiario_final && (
            <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">BF</span>
          )}
        </div>
        <Badge cls="bg-gray-100 text-gray-600 text-xs">{TIPO_RELACION_LABELS[persona.tipo_relacion] || persona.tipo_relacion}</Badge>
        {subs.length > 0 && (
          <button onClick={() => setAbierto(!abierto)} className="text-xs text-brand-600 ml-1">
            {abierto ? '▲' : `▼ ${subs.length}`}
          </button>
        )}
      </div>
      {abierto && subs.length > 0 && (
        <div className="mt-2 space-y-1">
          {subs.map((s, i) => <PersonaCard key={i} persona={s} nivel={nivel + 1} />)}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function GestionClientes() {
  const [vista, setVista]         = useState('lista') // lista | perfil | form
  const [clienteActual, setClienteActual] = useState(null)
  const [modoForm, setModoForm]   = useState('crear')  // crear | editar
  const [mostrarCargaMasiva, setMostrarCargaMasiva] = useState(false)
  const [buscarInicial, setBuscarInicial] = useState('')
  const location = useLocation()

  // Si llegamos desde otro módulo con clienteId para mostrar perfil
  useEffect(() => {
    if (location.state?.clienteId) {
      supabase.from('clientes').select('*').eq('id', location.state.clienteId).single().then(({ data }) => {
        if (data) { setClienteActual(data); setVista('perfil') }
      })
    }
  }, [location.state?.clienteId])

  const handleSelect = (cliente) => { setClienteActual(cliente); setVista('perfil') }
  const handleNuevo  = ()         => { setClienteActual(null); setModoForm('crear'); setVista('form') }
  const handleEditar = ()         => { setModoForm('editar'); setVista('form') }
  const handleVolver = ()         => { setVista(clienteActual ? 'perfil' : 'lista') }

  // Cuando hay un duplicado: vuelve a la lista con la cédula ya buscada
  const handleBuscarDuplicado = (identificacion) => {
    setBuscarInicial(identificacion)
    setClienteActual(null)
    setVista('lista')
  }

  const handleSave = async (clienteId) => {
    const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).single()
    if (data) setClienteActual(data)
    setVista('perfil')
  }

  return (
    <div className="min-h-full">
      {mostrarCargaMasiva && (
        <CargaMasivaClientes
          onClose={() => setMostrarCargaMasiva(false)}
          onCargaCompleta={() => { setMostrarCargaMasiva(false); setVista('lista') }}
        />
      )}
      {vista === 'lista' && (
        <TablaClientes
          onSelect={handleSelect}
          onNuevo={handleNuevo}
          onCargaMasiva={() => setMostrarCargaMasiva(true)}
          buscarInicial={buscarInicial}
        />
      )}
      {vista === 'perfil' && clienteActual && (
        <PerfilCliente
          cliente