import { useState, useEffect } from 'react'
import { supabase, tenantsDeLaApp } from '../lib/supabase'
import { apiFetch } from '../lib/apiFetch'
import { useAuth } from '../lib/AuthContext'
import { logAudit } from '../lib/auditLog'
import { normalizarChecklist, itemsChecklist } from '../lib/checklistDocumental'
import { useCatalogoDeTenant } from '../lib/CatalogoDocumentalContext'
import ChecklistDocumental from '../components/clientes/ChecklistDocumental'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ['Representante Legal', 'Socio/Accionista', 'Beneficiario Final', 'Apoderado', 'Junta Directiva']

const NIVELES = {
  bajo:     { label: '🟢 BAJO',     desc: 'DDC estándar — riesgo bajo', color: 'green',  years: 3 },
  medio:    { label: '🟡 MEDIO',    desc: 'DDC estándar + seguimiento', color: 'yellow', years: 2 },
  alto:     { label: '🟠 ALTO',     desc: 'DDC ampliada — Art. 23-24',  color: 'orange', years: 1 },
  muy_alto: { label: '🔴 MUY ALTO', desc: 'DDC ampliada + alta gerencia', color: 'red', years: 1 },
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBCOMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

function Stepper({ paso }) {
  const pasos = ['Datos', 'Listas', 'Perfil IA', 'Checklist', 'Expediente']
  return (
    <div className="flex items-center gap-0 mb-6">
      {pasos.map((p, i) => {
        const n = i + 1
        const active = n === paso
        const done   = n < paso
        return (
          <div key={p} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              active ? 'bg-brand-700 text-white' :
              done   ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                active ? 'bg-brand-900 text-white' :
                done   ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
              }`}>{done ? '✓' : n}</span>
              <span className="hidden sm:block truncate">{p}</span>
            </div>
            {i < 4 && <div className={`flex-1 h-0.5 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}

function NivelBadge({ nivel }) {
  if (!nivel || !NIVELES[nivel]) return null
  const n = NIVELES[nivel]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white ${
      nivel === 'bajo' ? 'bg-green-600' : nivel === 'medio' ? 'bg-yellow-500' :
      nivel === 'alto' ? 'bg-orange-600' : 'bg-red-700'
    }`}>{n.label}</span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE PDF
// ─────────────────────────────────────────────────────────────────────────────

function ReporteDD({ tipo, datos, participantes, resultadosListas, perfil, nivelFinal, checklist, catalogo, onClose }) {
  const { tenant, profile } = useAuth()
  const nombre = tipo === 'F' ? datos.nombre : datos.razon_social

  // Documentos exigidos por este sujeto obligado (estándar SUGEF + sus ajustes)
  const todosItems = itemsChecklist(
    {
      tipoPersona: tipo === 'J' ? 'juridica' : 'fisica',
      esPEP:       Object.values(resultadosListas).some(r => r.esPEP),
    },
    catalogo
  )
  const getEstado = (id) => typeof checklist[id] === 'object' ? checklist[id]?.estado : (checklist[id] ? 'disponible' : 'pendiente')
  const getNota   = (id) => typeof checklist[id] === 'object' ? checklist[id]?.nota || '' : ''
  const itemsOk  = todosItems.filter(it => getEstado(it.id) === 'disponible').length
  const itemsTot = todosItems.length

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-auto" id="reporte-dd">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center justify-between print:hidden">
        <p className="text-sm font-medium text-gray-700">Vista previa — Ctrl+P para imprimir o guardar como PDF</p>
        <div className="flex gap-2">
          <button onClick={() => window.print()}
            className="bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-800">
            🖨️ Imprimir / PDF
          </button>
          <button onClick={onClose}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-300">
            ✕ Cerrar
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 space-y-6 print:p-4 print:max-w-none">

        {/* Encabezado */}
        <div className="border-2 border-brand-900 rounded-xl overflow-hidden">
          <div className="bg-brand-900 text-white px-8 py-5 flex items-center gap-6">
            <img src="/logo-blanco.png" alt="CNL" className="h-14 w-auto" />
            <div className="flex-1">
              <p className="text-lg font-bold">CNL CRANILEY COMPLIANCE SERVICES SRL</p>
              <p className="text-brand-300 text-sm">Consultoría en Cumplimiento ALA/CFT — Costa Rica</p>
            </div>
            <div className="text-right text-sm text-brand-200">
              <p className="font-bold text-white text-base">NOTA DE DEBIDA DILIGENCIA</p>
              <p className="text-xs">Ref: CNL-DD-{new Date().getFullYear()}-{Math.floor(Math.random()*90000)+10000}</p>
            </div>
          </div>
          <div className="bg-brand-50 px-8 py-2 flex justify-between text-xs text-brand-800">
            <span>Acuerdo SUGEF 13-19, Art. 21-28 — Debida Diligencia del Cliente</span>
            <span>{new Date().toLocaleString('es-CR')}</span>
          </div>
        </div>

        {/* Datos del cliente + reporte */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1 mb-3">Datos del Cliente</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Nombre:</span><span className="font-semibold">{nombre}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Tipo:</span><span>{tipo === 'F' ? 'Persona Física' : 'Persona Jurídica'}</span></div>
              {tipo === 'F' && <>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Identificación:</span><span>{datos.identificacion}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Nacionalidad:</span><span>{datos.nacionalidad}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">País residencia:</span><span>{datos.pais_residencia}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Fecha nacimiento:</span><span>{datos.fecha_nacimiento}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Ocupación:</span><span>{datos.ocupacion}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Propósito:</span><span>{datos.proposito}</span></div>
              </>}
              {tipo === 'J' && <>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Cédula jurídica:</span><span>{datos.cedula_juridica}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">País constitución:</span><span>{datos.pais_constitucion}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Actividad:</span><span>{datos.actividad_ciiu}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Propósito:</span><span>{datos.proposito_pj}</span></div>
              </>}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1 mb-3">Datos del Reporte</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Elaborado por:</span><span className="font-semibold">{profile?.nombre || profile?.email}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Sujeto Obligado:</span><span>{tenant?.nombre}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Fecha:</span><span>{new Date().toLocaleString('es-CR')}</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Nivel de riesgo:</span><NivelBadge nivel={nivelFinal} /></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Documentos:</span><span>{itemsOk}/{itemsTot} recopilados</span></div>
              <div className="flex gap-2"><span className="text-gray-500 w-32 flex-shrink-0">Personas consultadas:</span><span>{Object.keys(resultadosListas).length}</span></div>
            </div>
          </div>
        </div>

        {/* Participantes (solo PJ) */}
        {tipo === 'J' && participantes.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 border-b">
              <p className="font-bold text-sm text-gray-700">👥 Participantes de la Sociedad</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Nombre', 'Rol', 'Identificación', 'Nacionalidad', 'Participación'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participantes.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{p.nombre}</td>
                    <td className="px-4 py-2 text-gray-600">{p.rol}</td>
                    <td className="px-4 py-2 text-gray-600">{p.identificacion || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{p.nacionalidad || '—'}</td>
                    <td className="px-4 py-2">{p.participacion ? `${p.participacion}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resultados de listas */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-800 text-white px-5 py-3">
            <p className="font-bold text-sm">🔍 Consulta de Listas Internacionales — Resultado por Persona</p>
          </div>
          {Object.entries(resultadosListas).length === 0 ? (
            <div className="px-5 py-3 text-sm text-gray-500 italic">Consulta de listas no realizada.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {Object.entries(resultadosListas).map(([nom, res]) => (
                <div key={nom} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{nom}</span>
                    {res.hits?.length > 0 && (
                      <span className="text-xs text-gray-400 ml-2">· {res.hits.length} coincidencia(s) relevante(s)</span>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    res.nivel === 'ALERTA'  ? 'bg-red-100 text-red-700' :
                    res.nivel === 'REVISAR' ? 'bg-orange-100 text-orange-700' :
                    res.esPEP              ? 'bg-amber-100 text-amber-700' :
                                             'bg-green-100 text-green-700'
                  }`}>
                    {res.nivel === 'ALERTA'  ? '🔴 ALERTA' :
                     res.nivel === 'REVISAR' ? '⚠️ REVISAR' :
                     res.esPEP              ? '🏛️ PEP IDENTIFICADO' :
                                              '✅ SIN HALLAZGOS'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="px-5 py-2 bg-gray-50 text-xs text-gray-500 border-t">
            Consulta realizada: {new Date().toLocaleString('es-CR')} — Listas consultadas: OFAC SDN, ONU, INTERPOL, GAFI, UK OFSI, ICD Costa Rica PEP, GAFILAT
          </div>
        </div>

        {/* Perfil IA */}
        {perfil && (
          <div className="border border-blue-200 rounded-xl overflow-hidden">
            <div className="bg-blue-700 text-white px-5 py-3">
              <p className="font-bold text-sm">🤖 Perfil IA — Investigación del Cliente</p>
              <p className="text-blue-200 text-xs">Generado por Claude AI con búsqueda web — apoyo analítico para el expediente</p>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-line leading-relaxed">{perfil}</div>
          </div>
        )}

        {/* Checklist */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b">
            <p className="font-bold text-sm text-gray-700">📋 Checklist de Debida Diligencia — SUGEF 13-19 — {itemsOk}/{itemsTot} completados</p>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Documento / Verificación</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-14">Req.</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-36">Estado</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Notas / Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todosItems.map((item, idx) => {
                const est = getEstado(item.id)
                const nota = getNota(item.id)
                const rowBg = est === 'disponible' ? 'bg-green-50' : est === 'no_disponible' ? 'bg-red-50' : ''
                const estLabel = est === 'disponible' ? '✅ Disponible' : est === 'no_disponible' ? '❌ No disponible' : est === 'no_aplica' ? '➖ No aplica' : '⏳ Pendiente'
                const estColor = est === 'disponible' ? 'text-green-700' : est === 'no_disponible' ? 'text-red-700' : est === 'no_aplica' ? 'text-gray-500' : 'text-amber-600'
                return (
                  <tr key={item.id} className={rowBg}>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-700">{item.label}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.required ? 'Obl' : 'Opt'}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-xs font-semibold ${estColor}`}>{estLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{nota || <span className="text-gray-300 italic">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Firma */}
        <div className="border border-gray-300 rounded-xl p-6 grid grid-cols-2 gap-10">
          <div>
            <p className="text-xs text-gray-400 mb-10">Firma del Oficial de Cumplimiento</p>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-semibold text-gray-800">{profile?.nombre || profile?.email}</p>
              <p className="text-xs text-gray-500">{tenant?.nombre}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-10">Fecha y lugar</p>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm text-gray-800">
                {new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-gray-500">San José, Costa Rica</p>
            </div>
          </div>
        </div>

        {/* Pie legal */}
        <div className="border-t-2 border-brand-900 pt-4">
          <div className="bg-brand-900 text-brand-300 text-xs rounded-lg px-4 py-2.5 text-center">
            Este expediente constituye evidencia de la debida diligencia aplicada conforme a la Ley N.° 7786 y el Acuerdo SUGEF 13-19.
            Debe conservarse por un mínimo de cinco (5) años desde el cierre de la relación comercial (Ley 7786, Art. 24).
            Plataforma: app.cnl-cr.com — CNL Craniley Compliance Services SRL.
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { margin: 0; }
          #reporte-dd { position: static; overflow: visible; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function DebilidaDiligencia() {
  const { session, tenant, profile, isSuperAdmin } = useAuth()
  const [paso, setPaso]   = useState(1)
  const [tipo, setTipo]   = useState('F')
  const [error, setError] = useState('')
  const [showPDF, setShowPDF]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)

  // ── Superadmin: selector de sujeto obligado ────────────────────────────────
  const [tenants, setTenants]         = useState([])
  const [tenantVista, setTenantVista] = useState(null)
  const tenantEfectivoId = isSuperAdmin ? (tenantVista?.id || null) : tenant?.id

  // Catálogo de documentos exigido por el sujeto obligado en curso
  const catalogoDoc = useCatalogoDeTenant(tenantEfectivoId)

  useEffect(() => {
    if (isSuperAdmin) {
      tenantsDeLaApp('id, nombre').order('nombre').then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // ── Selector de cliente desde DB ───────────────────────────────────────────
  const [clientesDB, setClientesDB]         = useState([])
  const [clienteSelId, setClienteSelId]     = useState('')
  const [cargandoDesdeDB, setCargandoDesdeDB] = useState(false)

  useEffect(() => {
    if (!tenantEfectivoId) { setClientesDB([]); return }
    supabase.from('clientes')
      .select('id, nombre_cliente, primer_apellido, segundo_apellido, nombre_empresa, numero_identificacion, cedula_juridica, tipo_identificacion, nacionalidad, pais_ubicacion, pais_nacimiento, pais_constitucion, fecha_nacimiento, fecha_constitucion, profesion_nombre, actividad_eco_nombre, actividad_economica, proposito_relacion, pep, sugef_estado, checklist_documental')
      .eq('tenant_id', tenantEfectivoId)
      .eq('activo', true)
      .order('nombre_cliente', { nullsFirst: false })
      .then(({ data }) => setClientesDB(data || []))
  }, [tenantEfectivoId])

  const cargarDesdeDB = async () => {
    if (!clienteSelId) return
    setCargandoDesdeDB(true)
    try {
      const c = clientesDB.find(x => x.id === clienteSelId)
      if (!c) return

      const tipoId = Number(c.tipo_identificacion)
      const esFisica = [1, 3, 4, 5].includes(tipoId) // 1=cédula CR, 3=DIMEX, 4=pasaporte, 5=NITE físico

      setTipo(esFisica ? 'F' : 'J')

      if (esFisica) {
        const nombreCompleto = [c.nombre_cliente, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')
        setDatos(d => ({
          ...d,
          nombre:           nombreCompleto,
          identificacion:   c.numero_identificacion || '',
          nacionalidad:     c.nacionalidad || 'Costarricense',
          pais_residencia:  c.pais_ubicacion || c.pais_nacimiento || 'Costa Rica',
          fecha_nacimiento: c.fecha_nacimiento || '',
          ocupacion:        c.profesion_nombre || c.actividad_eco_nombre || c.actividad_economica || '',
          proposito:        c.proposito_relacion || '',
        }))
      } else {
        setDatos(d => ({
          ...d,
          razon_social:      c.nombre_empresa || c.nombre_cliente || '',
          cedula_juridica:   c.cedula_juridica || c.numero_identificacion || '',
          pais_constitucion: c.pais_constitucion || 'Costa Rica',
          actividad_ciiu:    c.actividad_eco_nombre || c.actividad_economica || '',
          fecha_constitucion: c.fecha_constitucion || '',
          proposito_pj:      c.proposito_relacion || '',
        }))
      }

      // Precargar el checklist documental que ya tenga registrado el cliente,
      // de modo que la debida diligencia lo actualice en vez de empezar en blanco
      setChecklist(normalizarChecklist(c.checklist_documental))

      // Cargar personas relacionadas como participantes
      const { data: personas } = await supabase
        .from('clientes_personas_relacionadas')
        .select('*')
        .eq('cliente_id', clienteSelId)
        .eq('activo', true)
        .order('orden')

      if (personas?.length) {
        setParticipantes(personas.map(p => ({
          rol:           p.tipo_relacion?.replace(/_/g, ' ') || 'Representante Legal',
          nombre:        p.nombre || '',
          identificacion: p.identificacion || '',
          nacionalidad:  p.nacionalidad || '',
          participacion: p.porcentaje_participacion ? String(p.porcentaje_participacion) : '',
        })))
      }
    } catch (e) {
      setError('Error al cargar datos: ' + e.message)
    } finally {
      setCargandoDesdeDB(false)
    }
  }

  // ── Paso 1: Datos del cliente ──────────────────────────────────────────────
  const [datos, setDatos] = useState({
    nombre: '', identificacion: '', nacionalidad: 'Costarricense',
    pais_residencia: 'Costa Rica', fecha_nacimiento: '', ocupacion: '', proposito: '',
    razon_social: '', cedula_juridica: '', pais_constitucion: 'Costa Rica',
    actividad_ciiu: '', fecha_constitucion: '', proposito_pj: '',
  })
  const [participantes, setParticipantes] = useState([])
  const [nuevoP, setNuevoP] = useState({
    rol: 'Representante Legal', nombre: '', identificacion: '', nacionalidad: '', participacion: '',
  })

  // ── Paso 2: Listas ─────────────────────────────────────────────────────────
  const [resultadosListas, setResultadosListas] = useState({})
  const [cargandoListas, setCargandoListas]     = useState(false)

  // ── Paso 3: Perfil IA ──────────────────────────────────────────────────────
  const [perfil, setPerfil]     = useState('')
  const [nivelIA, setNivelIA]   = useState('')
  const [cargandoIA, setCargandoIA] = useState(false)
  const [errorIA, setErrorIA]   = useState('')

  // ── Paso 4: Checklist + riesgo ─────────────────────────────────────────────
  const [checklist, setChecklist]     = useState({})
  const [nivelFinal, setNivelFinal]   = useState('medio')
  const [justificacion, setJustificacion] = useState('')

  // Detectar PEP en resultados
  const hayPEP = Object.values(resultadosListas).some(r => r.esPEP)

  // ── Auto-consultar listas al entrar al Paso 2 ──────────────────────────────
  useEffect(() => {
    if (paso === 2 && Object.keys(resultadosListas).length === 0) {
      ejecutarConsultaListas()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  // ── Funciones ──────────────────────────────────────────────────────────────

  const buscarPersona = async (nombre, identificacion) => {
    const { data, error: err } = await supabase.rpc('buscar_en_listas', {
      p_nombre:         nombre,
      p_identificacion: identificacion || null,
      p_pais:           null,
      p_limite:         50,
    })
    if (err) throw err
    const resultados = data || []
    const maxSim = resultados.length > 0 ? Math.max(...resultados.map(r => r.similitud || 0)) : 0
    const esPEP  = resultados.some(
      r => (r.fuente === 'ICD_CR_PEP' || r.tipo_lista === 'pep') && (r.similitud || 0) >= 0.65
    )
    return {
      nivel:          maxSim >= 0.85 ? 'ALERTA' : maxSim >= 0.65 ? 'REVISAR' : 'SIN_HALLAZGOS',
      hits:           resultados.filter(r => (r.similitud || 0) >= 0.65),
      esPEP,
      totalResultados: resultados.length,
    }
  }

  const ejecutarConsultaListas = async () => {
    setCargandoListas(true)
    setError('')
    const nuevos = {}
    try {
      const nombrePrincipal = tipo === 'F' ? datos.nombre : datos.razon_social
      const idPrincipal     = tipo === 'F' ? datos.identificacion : datos.cedula_juridica
      if (nombrePrincipal?.trim()) {
        nuevos[nombrePrincipal] = await buscarPersona(nombrePrincipal, idPrincipal)
      }
      for (const p of participantes) {
        if (p.nombre?.trim()) {
          nuevos[p.nombre] = await buscarPersona(p.nombre, p.identificacion)
        }
      }
      setResultadosListas(nuevos)

      // Sugerir nivel de riesgo automático según resultados
      const hayAlerta  = Object.values(nuevos).some(r => r.nivel === 'ALERTA')
      const hayRevisar = Object.values(nuevos).some(r => r.nivel === 'REVISAR' || r.esPEP)
      setNivelFinal(hayAlerta ? 'muy_alto' : hayRevisar ? 'alto' : nivelFinal)
    } catch (e) {
      setError('Error al consultar listas: ' + e.message)
    } finally {
      setCargandoListas(false)
    }
  }

  const generarPerfilIA = async () => {
    setCargandoIA(true)
    setErrorIA('')
    setPerfil('')
    try {
      const nombreEntidad = tipo === 'F' ? datos.nombre : datos.razon_social
      const actividad     = tipo === 'F' ? datos.ocupacion : datos.actividad_ciiu
      const paisEntidad   = tipo === 'F' ? datos.pais_residencia : datos.pais_constitucion

      const res = await apiFetch('/api/dd-profile', {
        method: 'POST',
        body: JSON.stringify({
          tipo, nombre: nombreEntidad, actividad, pais: paisEntidad,
          participantes: participantes.map(p => ({ nombre: p.nombre, rol: p.rol })),
          resultados_listas: resultadosListas,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar perfil')
      setPerfil(data.perfil)
      setNivelIA((data.nivel_sugerido || 'MEDIO').toLowerCase().replace('muy_alto', 'muy_alto'))
      // Actualizar sugerencia si no hay alerta previa
      if (data.nivel_sugerido) {
        const n = data.nivel_sugerido.toLowerCase()
        if (!['muy_alto', 'alto'].includes(nivelFinal)) setNivelFinal(n)
      }
    } catch (e) {
      setErrorIA(e.message)
    } finally {
      setCargandoIA(false)
    }
  }

  const guardarExpediente = async () => {
    setGuardando(true)
    setError('')
    try {
      const { error: err } = await supabase.from('expedientes_dd').insert({
        tenant_id:           tenantEfectivoId || tenant?.id,
        tipo,
        datos_cliente:       datos,
        participantes,
        resultados_listas:   resultadosListas,
        perfil_ia:           perfil,
        nivel_riesgo_ia:     nivelIA,
        nivel_riesgo_final:  nivelFinal,
        justificacion_manual: justificacion,
        checklist,
        estado:              'completado',
        created_by:          session?.user?.id,
      })
      if (err) throw err

      // Actualizar ficha del cliente si se seleccionó uno desde la BD
      if (clienteSelId) {
        const hayAlerta = Object.values(resultadosListas).some(r => r.nivel === 'ALERTA')
        const hayRevisar = Object.values(resultadosListas).some(r => r.nivel === 'REVISAR')
        const hayPEPResult = Object.values(resultadosListas).some(r => r.esPEP)
        const hoy = new Date().toISOString().substring(0, 10)
        await supabase.from('clientes').update({
          estado_dd:              'completado',
          pep:                    hayPEPResult,
          aparece_en_listas:      hayAlerta,
          estado_listas:          hayAlerta ? 'alerta' : hayRevisar ? 'revisar' : 'verificado',
          fecha_debida_diligencia: hoy,
          // El checklist de la DD es el mismo del expediente del cliente:
          // se refleja en «Documentación presentada» al consultar el cliente
          checklist_documental:     normalizarChecklist(checklist),
          checklist_actualizado_en: hoy,
        }).eq('id', clienteSelId)
      }

      await logAudit({
        accion:      'crear',
        tabla:       'expedientes_dd',
        descripcion: `Expediente DD: ${tipo === 'F' ? datos.nombre : datos.razon_social} — Riesgo: ${nivelFinal}`,
      })
      setGuardadoOk(true)
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const validarPaso1 = () => {
    if (tipo === 'F') {
      if (!datos.nombre.trim())         { setError('El nombre completo es obligatorio.'); return false }
      if (!datos.identificacion.trim()) { setError('La identificación es obligatoria.'); return false }
    } else {
      if (!datos.razon_social.trim())   { setError('La razón social es obligatoria.'); return false }
      if (!datos.cedula_juridica.trim()){ setError('La cédula jurídica es obligatoria.'); return false }
    }
    return true
  }

  const avanzar = () => {
    setError('')
    if (paso === 1) {
      if (!validarPaso1()) return
    }
    if (paso < 5) setPaso(p => p + 1)
  }

  const retroceder = () => { setError(''); setPaso(p => Math.max(1, p - 1)) }

  const agregarParticipante = () => {
    if (!nuevoP.nombre.trim()) return
    setParticipantes(ps => [...ps, { ...nuevoP }])
    setNuevoP({ rol: 'Representante Legal', nombre: '', identificacion: '', nacionalidad: '', participacion: '' })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PDF
  // ─────────────────────────────────────────────────────────────────────────

  if (showPDF) {
    return (
      <ReporteDD
        tipo={tipo} datos={datos} participantes={participantes}
        resultadosListas={resultadosListas} perfil={perfil}
        nivelFinal={nivelFinal} checklist={checklist} catalogo={catalogoDoc}
        onClose={() => setShowPDF(false)}
      />
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asistente de Debida Diligencia</h1>
          <p className="text-gray-500 text-sm mt-1">
            Flujo guiado ALA/CFT — Ley 7786, Art. 15 bis · Acuerdo SUGEF 13-19, Art. 21-28
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <span className="text-amber-600 text-sm font-semibold whitespace-nowrap">🏢 Sujeto obligado:</span>
            <select
              className="input-field text-sm"
              value={tenantVista?.id || ''}
              onChange={e => {
                const t = tenants.find(t => t.id === e.target.value) || null
                setTenantVista(t)
                setClienteSelId('')
              }}
            >
              <option value="">— Seleccione —</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {isSuperAdmin && !tenantVista && (
        <div className="card bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium text-center py-6">
          Seleccione un sujeto obligado para iniciar una debida diligencia
        </div>
      )}

      {(!isSuperAdmin || tenantVista) && <Stepper paso={paso} />}

      {/* ════════════════ PASO 1 — DATOS ════════════════ */}
      {paso === 1 && (!isSuperAdmin || tenantVista) && (
        <div className="space-y-4">

          {/* ── Cargar desde base de datos ── */}
          <div className="card border-2 border-brand-200 bg-brand-50 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-brand-700 text-lg">🗄️</span>
              <div>
                <p className="text-sm font-bold text-brand-800">Cargar cliente desde base de datos</p>
                <p className="text-xs text-brand-600">Seleccione un cliente registrado para pre-llenar el formulario automáticamente</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <select
                  className="input text-sm"
                  value={clienteSelId}
                  onChange={e => setClienteSelId(e.target.value)}>
                  <option value="">— Seleccione un cliente —</option>
                  {clientesDB.map(c => {
                    const nombre = c.nombre_empresa
                      || [c.nombre_cliente, c.primer_apellido].filter(Boolean).join(' ')
                    return (
                      <option key={c.id} value={c.id}>
                        {nombre} — {c.numero_identificacion || c.cedula_juridica || ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <button
                onClick={cargarDesdeDB}
                disabled={!clienteSelId || cargandoDesdeDB}
                className="px-4 py-2 bg-brand-700 text-white text-sm font-bold rounded-lg hover:bg-brand-800 disabled:opacity-40 transition-colors flex items-center gap-2">
                {cargandoDesdeDB
                  ? <><span className="animate-spin">⏳</span> Cargando…</>
                  : '📥 Cargar datos'}
              </button>
            </div>
            {clienteSelId && !cargandoDesdeDB && (
              <p className="text-xs text-brand-600">Puede editar los datos cargados antes de continuar</p>
            )}
          </div>

          {/* Banner SUGEF pendiente */}
          {clienteSelId && clientesDB.find(c => c.id === clienteSelId)?.sugef_estado === 'pendiente' && (
            <div className="border-2 border-red-500 bg-red-50 rounded-xl p-4 space-y-2">
              <p className="font-bold text-red-700 text-base">NO SE RECOMIENDA ACEPTAR ESTE CLIENTE</p>
              <p className="text-sm text-red-600">
                Este cliente tiene <strong>inscripcion pendiente ante SUGEF</strong> como sujeto obligado (Ley 7786).
                De conformidad con las buenas practicas ALA/CFT y el Acuerdo SUGEF 13-19, no se recomienda
                establecer relacion comercial con entidades que no hayan regularizado su situacion ante el ente supervisor.
              </p>
              <p className="text-xs text-red-500 font-medium">
                Accion recomendada: Solicite evidencia de inscripcion ante SUGEF antes de continuar.
                Si persiste la situacion, considere el rechazo de la relacion comercial.
              </p>
            </div>
          )}

          {/* Selector tipo */}
          <div className="card flex gap-4 items-center flex-wrap">
            <p className="text-sm font-semibold text-gray-700">Tipo de cliente:</p>
            {[{ v: 'F', label: '👤 Persona Física' }, { v: 'J', label: '🏢 Persona Jurídica' }].map(opt => (
              <button key={opt.v} type="button" onClick={() => setTipo(opt.v)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  tipo === opt.v
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'border-gray-300 text-gray-600 hover:border-brand-400'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* ── Persona Física ── */}
          {tipo === 'F' && (
            <div className="card space-y-4">
              <p className="text-sm font-bold text-gray-700 border-b pb-2">Datos de la Persona Física</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre completo *</label>
                  <input className="input" placeholder="Nombre y apellidos"
                    value={datos.nombre} onChange={e => setDatos(d => ({ ...d, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Cédula / Pasaporte / DIMEX *</label>
                  <input className="input" placeholder="Número de identificación"
                    value={datos.identificacion} onChange={e => setDatos(d => ({ ...d, identificacion: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Nacionalidad</label>
                  <input className="input" placeholder="Ej: Costarricense"
                    value={datos.nacionalidad} onChange={e => setDatos(d => ({ ...d, nacionalidad: e.target.value }))} />
                </div>
                <div>
                  <label className="label">País de residencia</label>
                  <input className="input" placeholder="Ej: Costa Rica"
                    value={datos.pais_residencia} onChange={e => setDatos(d => ({ ...d, pais_residencia: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Fecha de nacimiento</label>
                  <input className="input" type="date"
                    value={datos.fecha_nacimiento} onChange={e => setDatos(d => ({ ...d, fecha_nacimiento: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Ocupación / Actividad económica</label>
                  <input className="input" placeholder="Ej: Empresario, Abogado, Comerciante..."
                    value={datos.ocupacion} onChange={e => setDatos(d => ({ ...d, ocupacion: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Propósito de la relación comercial</label>
                  <textarea className="input" rows={2}
                    placeholder="Describa el propósito de la relación comercial (Art. 29, Acuerdo SUGEF 13-19)..."
                    value={datos.proposito} onChange={e => setDatos(d => ({ ...d, proposito: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {/* ── Persona Jurídica ── */}
          {tipo === 'J' && (
            <>
              <div className="card space-y-4">
                <p className="text-sm font-bold text-gray-700 border-b pb-2">Datos de la Persona Jurídica</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Razón social *</label>
                    <input className="input" placeholder="Nombre completo de la empresa"
                      value={datos.razon_social} onChange={e => setDatos(d => ({ ...d, razon_social: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Cédula jurídica *</label>
                    <input className="input" placeholder="Ej: 3-101-XXXXXX"
                      value={datos.cedula_juridica} onChange={e => setDatos(d => ({ ...d, cedula_juridica: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">País de constitución</label>
                    <input className="input" placeholder="Ej: Costa Rica"
                      value={datos.pais_constitucion} onChange={e => setDatos(d => ({ ...d, pais_constitucion: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Actividad económica (CIIU)</label>
                    <input className="input" placeholder="Ej: 6810 — Actividades inmobiliarias propias o arrendadas"
                      value={datos.actividad_ciiu} onChange={e => setDatos(d => ({ ...d, actividad_ciiu: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Fecha de constitución</label>
                    <input className="input" type="date"
                      value={datos.fecha_constitucion} onChange={e => setDatos(d => ({ ...d, fecha_constitucion: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Propósito de la relación comercial</label>
                    <input className="input" placeholder="Propósito de la relación..."
                      value={datos.proposito_pj} onChange={e => setDatos(d => ({ ...d, proposito_pj: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Participantes de la sociedad */}
              <div className="card space-y-3">
                <div>
                  <p className="text-sm font-bold text-gray-700">👥 Participantes de la Sociedad</p>
                  <p className="text-xs text-gray-500 mt-0.5">Representante legal, socios/accionistas, beneficiarios finales y apoderados. Art. 27-28, Acuerdo SUGEF 13-19.</p>
                </div>

                {/* Participantes agregados */}
                {participantes.length > 0 && (
                  <div className="space-y-2">
                    {participantes.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-brand-700 bg-brand-50 rounded px-1.5 py-0.5 mr-2">{p.rol}</span>
                          <span className="text-sm font-semibold text-gray-900">{p.nombre}</span>
                          {p.identificacion && <span className="text-xs text-gray-500 ml-2">· {p.identificacion}</span>}
                          {p.nacionalidad  && <span className="text-xs text-gray-500 ml-2">· {p.nacionalidad}</span>}
                          {p.participacion && <span className="text-xs text-gray-500 ml-2">· {p.participacion}%</span>}
                        </div>
                        <button onClick={() => setParticipantes(ps => ps.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulario agregar */}
                <div className="border border-dashed border-brand-300 rounded-xl p-4 space-y-3 bg-brand-50/30">
                  <p className="text-xs font-semibold text-brand-700">+ Agregar participante</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">Rol</label>
                      <select className="input text-sm"
                        value={nuevoP.rol} onChange={e => setNuevoP(p => ({ ...p, rol: e.target.value }))}>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Nombre completo</label>
                      <input className="input text-sm" placeholder="Nombre..."
                        value={nuevoP.nombre} onChange={e => setNuevoP(p => ({ ...p, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">Cédula / Pasaporte</label>
                      <input className="input text-sm" placeholder="Identificación..."
                        value={nuevoP.identificacion} onChange={e => setNuevoP(p => ({ ...p, identificacion: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">Nacionalidad</label>
                      <input className="input text-sm" placeholder="Ej: Costarricense"
                        value={nuevoP.nacionalidad} onChange={e => setNuevoP(p => ({ ...p, nacionalidad: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label text-xs">% Participación</label>
                      <input className="input text-sm" type="number" min="0" max="100" placeholder="Ej: 25"
                        value={nuevoP.participacion} onChange={e => setNuevoP(p => ({ ...p, participacion: e.target.value }))} />
                    </div>
                    <div className="flex items-end">
                      <button onClick={agregarParticipante} type="button"
                        className="w-full btn-primary text-sm py-2">
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════ PASO 2 — LISTAS ════════════════ */}
      {paso === 2 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Consulta de Listas Internacionales</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  OFAC · ONU · INTERPOL · GAFI · UK OFSI · ICD CR PEP · GAFILAT
                </p>
              </div>
              <button onClick={ejecutarConsultaListas} disabled={cargandoListas}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
                {cargandoListas
                  ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Consultando…</>
                  : '🔄 Re-consultar'}
              </button>
            </div>

            {cargandoListas && (
              <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-sm">Consultando listas para todas las personas ingresadas…</p>
              </div>
            )}

            {!cargandoListas && Object.entries(resultadosListas).map(([nom, res]) => (
              <div key={nom} className={`border rounded-xl p-4 ${
                res.nivel === 'ALERTA'  ? 'border-red-300 bg-red-50' :
                res.nivel === 'REVISAR' ? 'border-orange-300 bg-orange-50' :
                                         'border-green-300 bg-green-50'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{nom}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {res.totalResultados} resultado(s) · {res.hits?.length || 0} con similitud ≥ 65%
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full text-white ${
                      res.nivel === 'ALERTA'  ? 'bg-red-600' :
                      res.nivel === 'REVISAR' ? 'bg-orange-500' : 'bg-green-600'
                    }`}>
                      {res.nivel === 'ALERTA'  ? '🔴 ALERTA' :
                       res.nivel === 'REVISAR' ? '⚠️ REVISAR' : '✅ SIN HALLAZGOS'}
                    </span>
                    {res.esPEP && <p className="text-xs font-bold text-amber-700 mt-1">🏛️ PEP — Lista ICD CR</p>}
                  </div>
                </div>

                {res.hits?.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {res.hits.slice(0, 3).map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                        <span className="font-medium text-gray-800">{h.nombre_completo}</span>
                        <span className="text-gray-500">{h.fuente} · {Math.round((h.similitud || 0) * 100)}%</span>
                      </div>
                    ))}
                    {res.hits.length > 3 && (
                      <p className="text-xs text-gray-400 pl-2">…y {res.hits.length - 3} más</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {hayPEP && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex gap-3">
                <span className="text-xl flex-shrink-0">🏛️</span>
                <div>
                  <p className="text-sm font-bold text-amber-800">PEP identificado — Se requiere DDC Ampliada</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Acuerdo SUGEF 13-19, Art. 38: obtenga aprobación de alta gerencia, información sobre origen de fondos y active monitoreo reforzado.
                  </p>
                </div>
              </div>
            )}

            {!cargandoListas && Object.keys(resultadosListas).length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 pt-1 border-t border-gray-100">
                <span>⏱️ Consulta realizada: {new Date().toLocaleString('es-CR')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ PASO 3 — PERFIL IA ════════════════ */}
      {paso === 3 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-gray-900">Investigación IA del Cliente</p>
                <p className="text-xs text-gray-500 mt-0.5">Claude AI + Tavily web search · genera perfil narrativo para el expediente</p>
              </div>
              <button onClick={generarPerfilIA} disabled={cargandoIA}
                className="btn-primary flex items-center gap-2 disabled:opacity-60">
                {cargandoIA
                  ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Investigando…</>
                  : perfil ? '🔄 Regenerar' : '🤖 Generar perfil IA'}
              </button>
            </div>

            {errorIA && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">⚠️ {errorIA}</div>
            )}

            {!perfil && !cargandoIA && (
              <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-3xl mb-2">🔎</p>
                <p className="text-sm font-medium">Haga clic en "Generar perfil IA" para iniciar la investigación</p>
                <p className="text-xs mt-1 text-gray-300">Requiere TAVILY_API_KEY en Vercel · Puede omitirse y continuar</p>
              </div>
            )}

            {cargandoIA && (
              <div className="text-center py-12 bg-blue-50 rounded-xl border border-blue-100">
                <div className="text-3xl mb-2">🤖</div>
                <p className="text-sm font-medium text-blue-800">Buscando en internet y analizando datos…</p>
                <p className="text-xs text-blue-400 mt-1">Esto puede tomar 15-30 segundos</p>
              </div>
            )}

            {perfil && !cargandoIA && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-200">
                  <span className="text-sm text-gray-600">Nivel de riesgo sugerido por IA:</span>
                  <NivelBadge nivel={nivelIA} />
                </div>
                <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Perfil Narrativo del Cliente</p>
                  <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{perfil}</div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            Este perfil es un apoyo analítico. El Oficial de Cumplimiento es responsable de la decisión final sobre el nivel de riesgo.
          </p>
        </div>
      )}

      {/* ════════════════ PASO 4 — CHECKLIST ════════════════ */}
      {paso === 4 && (
        <div className="space-y-4">

          {/* Checklist tabla — mismo catálogo que «Documentación presentada» del cliente */}
          <div className="card space-y-3">
            <div>
              <p className="font-semibold text-gray-900">📋 Checklist de Debida Diligencia — SUGEF 13-19</p>
              {clienteSelId && (
                <p className="text-xs text-brand-600 mt-0.5">
                  Al guardar el expediente, este checklist se actualiza en la ficha del cliente
                  («Documentación presentada») y recalcula su calificación de cumplimiento.
                </p>
              )}
            </div>
            <ChecklistDocumental
              checklist={checklist}
              onChange={setChecklist}
              tipoPersona={tipo === 'J' ? 'juridica' : 'fisica'}
              esPEP={hayPEP}
              catalogo={catalogoDoc}
            />
          </div>

          {/* Notas al checklist */}
          <div className="card space-y-2">
            <label className="label text-xs">Observaciones adicionales (opcional — quedará en el expediente)</label>
            <textarea className="input text-sm" rows={3}
              placeholder="Anote cualquier observación relevante sobre los documentos o el expediente…"
              value={justificacion} onChange={e => setJustificacion(e.target.value)} />
          </div>
        </div>
      )}

      {/* ════════════════ PASO 5 — EXPEDIENTE ════════════════ */}
      {paso === 5 && (
        <div className="space-y-4">
          <div className="card text-center space-y-4">
            <div className="text-5xl">📄</div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Expediente listo</p>
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-2 justify-center flex-wrap">
                <span>{tipo === 'F' ? datos.nombre : datos.razon_social}</span>
                <NivelBadge nivel={nivelFinal} />
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
              <div>
                <p className="text-2xl font-bold text-brand-700">{Object.keys(resultadosListas).length}</p>
                <p className="text-xs text-gray-500">Personas consultadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-700">
                  {Object.values(checklist).filter(v => v?.estado === 'disponible' || v === true).length}/
                  {itemsChecklist({ tipoPersona: tipo === 'J' ? 'juridica' : 'fisica', esPEP: hayPEP }, catalogoDoc).length}
                </p>
                <p className="text-xs text-gray-500">Documentos marcados</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-brand-700">{perfil ? '✓' : '—'}</p>
                <p className="text-xs text-gray-500">Perfil IA generado</p>
              </div>
            </div>

            {guardadoOk && (
              <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-2 text-sm text-green-800 font-medium">
                ✅ Expediente guardado correctamente en Supabase
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => setShowPDF(true)}
                className="btn-primary flex items-center gap-2 justify-center">
                📄 Ver y descargar PDF
              </button>
              {!guardadoOk && (
                <button onClick={guardarExpediente} disabled={guardando}
                  className="border-2 border-brand-700 text-brand-700 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-brand-50 transition-colors flex items-center gap-2 justify-center disabled:opacity-60">
                  {guardando ? '⏳ Guardando…' : '💾 Guardar en base de datos'}
                </button>
              )}
              <button onClick={() => {
                setPaso(1); setDatos({ nombre:'', identificacion:'', nacionalidad:'Costarricense',
                  pais_residencia:'Costa Rica', fecha_nacimiento:'', ocupacion:'', proposito:'',
                  razon_social:'', cedula_juridica:'', pais_constitucion:'Costa Rica',
                  actividad_ciiu:'', fecha_constitucion:'', proposito_pj:'',
                }); setParticipantes([]); setResultadosListas({}); setPerfil(''); setNivelIA('');
                setChecklist({}); setNivelFinal('medio'); setJustificacion(''); setGuardadoOk(false);
              }} className="border border-gray-300 text-gray-600 px-5 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
                + Nuevo expediente
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">📌 Recordatorio legal</p>
            <p className="text-xs leading-relaxed">
              Este expediente debe conservarse <strong>5 años mínimo</strong> desde el cierre de la relación comercial (Ley 7786, Art. 24).
              Frecuencia de actualización según nivel de riesgo: Bajo = 3 años · Medio = 2 años · Alto/Muy Alto = 1 año (Acuerdo SUGEF 13-19, Art. 26).
              {hayPEP && ' El cliente fue identificado como PEP — aplique monitoreo reforzado y revisión anual obligatoria (Art. 38).'}
            </p>
          </div>
        </div>
      )}

      {/* ── Navegación ────────────────────────────────────────────────────── */}
      {error && <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>}

      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
        <button onClick={retroceder} disabled={paso === 1}
          className="px-5 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors">
          ← Anterior
        </button>
        {paso < 5 ? (
          <button onClick={avanzar} className="btn-primary px-6 py-2">
            {paso === 1 ? 'Continuar — Consultar listas →' : 'Siguiente →'}
          </button>
        ) : (
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">✓ Expediente completado</span>
        )}
      </div>
    </div>
  )
}
