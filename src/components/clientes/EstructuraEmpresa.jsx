/**
 * EstructuraEmpresa.jsx
 * Editor de estructura empresarial: representantes legales, junta directiva,
 * socios/accionistas (con cadena recursiva empresa→empresa→persona física).
 */
import { useState } from 'react'
import { PAISES_RIESGO } from '../../lib/metodologiaRiesgo'

const PAISES = PAISES_RIESGO.map(p => p.pais).sort()
const ROLES_JUNTA = ['Presidente', 'Vicepresidente', 'Secretario', 'Tesorero', 'Vocal', 'Fiscal', 'Otro']
const TIPOS_ID = ['Cédula', 'DIMEX', 'Pasaporte', 'Cédula Jurídica', 'Otro']

function PersonaTag({ persona, onRemove, onClick }) {
  const isEmpresa = persona.tipo_entidad === 'persona_juridica'
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer hover:shadow-sm transition-all ${
        isEmpresa ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <span className="text-base">{isEmpresa ? '🏢' : '👤'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{persona.nombre}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          {persona.tipo_relacion && (
            <span className="px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded capitalize">
              {persona.tipo_relacion.replace('_', ' ')}
            </span>
          )}
          {persona.cargo && <span>{persona.cargo}</span>}
          {persona.identificacion && <span>· {persona.identificacion}</span>}
          {persona.porcentaje_participacion != null && (
            <span className="font-medium text-brand-700">{persona.porcentaje_participacion}%</span>
          )}
          {isEmpresa && persona.sub_personas?.length > 0 && (
            <span className="text-blue-600">· {persona.sub_personas.length} relacionado(s)</span>
          )}
        </div>
        {(persona.direccion || persona.telefono || persona.correo) && (
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap mt-0.5">
            {persona.direccion && <span>📍 {persona.direccion}</span>}
            {persona.telefono && <span>📞 {persona.telefono}</span>}
            {persona.correo && <span>✉️ {persona.correo}</span>}
          </div>
        )}
      </div>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-red-400 hover:text-red-600 text-lg leading-none flex-shrink-0">×</button>
      )}
    </div>
  )
}

function FormPersona({ tipoRelacion, onSave, onCancel, clientesBusqueda = [] }) {
  const [tipo, setTipo] = useState('persona_fisica')
  const [nombre, setNombre] = useState('')
  const [id_, setId] = useState('')
  const [tipoId, setTipoId] = useState('Cédula')
  const [nacionalidad, setNacionalidad] = useState('Costa Rica')
  const [paisResidencia, setPaisResidencia] = useState('Costa Rica')
  const [cargo, setCargo] = useState(tipoRelacion === 'junta_directiva' ? 'Vocal' : '')
  const [porcentaje, setPorcentaje] = useState('')
  const [esBeneficiarioFinal, setEsBeneficiarioFinal] = useState(false)
  const [notas, setNotas] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')

  const esSocio = tipoRelacion === 'socio'
  const esJunta = tipoRelacion === 'junta_directiva'
  const esRep   = tipoRelacion === 'representante_legal'
  const esEmpresa = tipo === 'persona_juridica'

  const handleSave = () => {
    if (!nombre.trim()) return
    onSave({
      tipo_relacion: tipoRelacion,
      tipo_entidad: tipo,
      nombre: nombre.trim(),
      identificacion: id_.trim(),
      tipo_id: tipoId,
      nacionalidad,
      pais_residencia: paisResidencia,
      cargo,
      porcentaje_participacion: esSocio ? parseFloat(porcentaje) || null : null,
      es_beneficiario_final: esSocio && !esEmpresa ? esBeneficiarioFinal : false,
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      correo: correo.trim(),
      sub_personas: [],
      notas,
    })
  }

  return (
    <div className="border border-brand-300 rounded-xl p-4 bg-brand-50/30 space-y-3">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wide">
        + Nueva persona / empresa ({tipoRelacion.replace(/_/g, ' ')})
      </p>

      {/* Tipo entidad */}
      <div className="flex gap-2">
        {[
          { v: 'persona_fisica',    label: '👤 Persona Física' },
          { v: 'persona_juridica',  label: '🏢 Persona Jurídica / Empresa' },
        ].map(opt => (
          <button key={opt.v} type="button" onClick={() => { setTipo(opt.v); if (opt.v === 'persona_juridica') { setTipoId('Cédula Jurídica') } else { setTipoId('Cédula') } }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
              tipo === opt.v ? 'bg-brand-700 text-white border-brand-700' : 'border-gray-300 text-gray-600 hover:border-brand-400'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label text-xs">{esEmpresa ? 'Razón social *' : 'Nombre completo *'}</label>
          <input className="input text-sm" value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder={esEmpresa ? 'Nombre de la empresa...' : 'Nombre y apellidos...'} />
        </div>
        <div>
          <label className="label text-xs">Tipo identificación</label>
          <select className="input text-sm" value={tipoId} onChange={e => setTipoId(e.target.value)}>
            {TIPOS_ID.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">N° Identificación</label>
          <input className="input text-sm" value={id_} onChange={e => setId(e.target.value)}
            placeholder="Número..." />
        </div>
        {!esEmpresa && (
          <>
            <div>
              <label className="label text-xs">Nacionalidad</label>
              <select className="input text-sm" value={nacionalidad} onChange={e => setNacionalidad(e.target.value)}>
                {PAISES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">País residencia</label>
              <select className="input text-sm" value={paisResidencia} onChange={e => setPaisResidencia(e.target.value)}>
                {PAISES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </>
        )}
        {esJunta && (
          <div>
            <label className="label text-xs">Cargo en Junta</label>
            <select className="input text-sm" value={cargo} onChange={e => setCargo(e.target.value)}>
              {ROLES_JUNTA.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        )}
        {esSocio && (
          <div>
            <label className="label text-xs">% Participación</label>
            <input className="input text-sm" type="number" min="0" max="100" step="0.01"
              value={porcentaje} onChange={e => setPorcentaje(e.target.value)} placeholder="Ej: 50.00" />
          </div>
        )}
        {esSocio && !esEmpresa && (
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={esBeneficiarioFinal}
                onChange={e => setEsBeneficiarioFinal(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-700" />
              <span className="text-sm text-gray-700">Es Beneficiario Final (persona física última en la cadena)</span>
            </label>
          </div>
        )}
        {esEmpresa && esSocio && (
          <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
            💡 Después de agregar esta empresa, podrá expandirla para agregar sus propios representantes, junta directiva y socios.
          </div>
        )}

        {/* Datos de contacto — representante legal */}
        {esRep && (
          <>
            <div className="col-span-2">
              <label className="label text-xs">Dirección</label>
              <input className="input text-sm" value={direccion} onChange={e => setDireccion(e.target.value)}
                placeholder="Dirección exacta del representante legal..." />
            </div>
            <div>
              <label className="label text-xs">Teléfono</label>
              <input className="input text-sm" value={telefono} onChange={e => setTelefono(e.target.value)}
                placeholder="Número de teléfono..." />
            </div>
            <div>
              <label className="label text-xs">Correo electrónico</label>
              <input className="input text-sm" type="email" value={correo} onChange={e => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com" />
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="text-sm px-4 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={!nombre.trim()}
          className="btn-primary text-sm py-1.5 disabled:opacity-50">
          ✓ Agregar
        </button>
      </div>
    </div>
  )
}

// ── SubEstructura recursiva ───────────────────────────────────────────────────
function SubEstructuraEmpresa({ empresa, onUpdate, nivel = 1 }) {
  const [expandida, setExpandida] = useState(false)
  const [addingType, setAddingType] = useState(null)

  const subPersonas = empresa.sub_personas || []

  const agregarSubPersona = (p) => {
    const nuevas = [...subPersonas, { ...p, id: crypto.randomUUID() }]
    onUpdate({ ...empresa, sub_personas: nuevas })
    setAddingType(null)
  }

  const eliminarSubPersona = (idx) => {
    const nuevas = subPersonas.filter((_, i) => i !== idx)
    onUpdate({ ...empresa, sub_personas: nuevas })
  }

  const actualizarSubPersona = (idx, updated) => {
    const nuevas = subPersonas.map((p, i) => i === idx ? updated : p)
    onUpdate({ ...empresa, sub_personas: nuevas })
  }

  const indent = nivel * 16

  return (
    <div style={{ marginLeft: `${indent}px` }}
      className="border-l-2 border-blue-200 pl-3 mt-2 space-y-2">
      <button onClick={() => setExpandida(e => !e)}
        className="flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900 py-1">
        {expandida ? '▼' : '▶'} {empresa.nombre} — {empresa.porcentaje_participacion ? `${empresa.porcentaje_participacion}%` : 'empresa'}
        {subPersonas.length > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 rounded-full">{subPersonas.length}</span>}
      </button>

      {expandida && (
        <div className="space-y-2">
          {/* Representante Legal */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Representantes Legales</p>
            {subPersonas.filter(p => p.tipo_relacion === 'representante_legal').map((p, i) => (
              <PersonaTag key={p.id || i} persona={p} onRemove={() => eliminarSubPersona(subPersonas.indexOf(p))} />
            ))}
            {addingType === `rep_${empresa.id}` ? (
              <FormPersona tipoRelacion="representante_legal"
                onSave={agregarSubPersona} onCancel={() => setAddingType(null)} />
            ) : (
              <button onClick={() => setAddingType(`rep_${empresa.id}`)}
                className="text-xs text-blue-600 hover:text-blue-800 py-1">+ Representante legal</button>
            )}
          </div>

          {/* Socios */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Socios / Accionistas</p>
            {subPersonas.filter(p => p.tipo_relacion === 'socio').map((p, origIdx) => {
              const idx = subPersonas.indexOf(p)
              return (
                <div key={p.id || origIdx}>
                  <PersonaTag persona={p} onRemove={() => eliminarSubPersona(idx)} />
                  {p.tipo_entidad === 'persona_juridica' && nivel < 5 && (
                    <SubEstructuraEmpresa
                      empresa={p}
                      nivel={nivel + 1}
                      onUpdate={(updated) => actualizarSubPersona(idx, updated)}
                    />
                  )}
                </div>
              )
            })}
            {addingType === `soc_${empresa.id}` ? (
              <FormPersona tipoRelacion="socio"
                onSave={agregarSubPersona} onCancel={() => setAddingType(null)} />
            ) : (
              <button onClick={() => setAddingType(`soc_${empresa.id}`)}
                className="text-xs text-blue-600 hover:text-blue-800 py-1">+ Socio / Accionista</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function EstructuraEmpresa({ personas, onChange }) {
  const [addingType, setAddingType] = useState(null) // null | 'representante_legal' | 'junta_directiva' | 'socio'

  const agregar = (persona) => {
    onChange([...personas, { ...persona, id: crypto.randomUUID() }])
    setAddingType(null)
  }

  const eliminar = (idx) => {
    onChange(personas.filter((_, i) => i !== idx))
  }

  const actualizar = (idx, updated) => {
    onChange(personas.map((p, i) => i === idx ? updated : p))
  }

  const representantes = personas.filter(p => p.tipo_relacion === 'representante_legal')
  const junta          = personas.filter(p => p.tipo_relacion === 'junta_directiva')
  const socios         = personas.filter(p => p.tipo_relacion === 'socio')

  const totalParticipacion = socios.reduce((s, p) => s + (Number(p.porcentaje_participacion) || 0), 0)

  return (
    <div className="space-y-5">

      {/* ── Representantes Legales ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between border-b pb-1.5">
          <div>
            <p className="text-sm font-bold text-gray-800">⚖️ Representantes Legales</p>
            <p className="text-xs text-gray-400">Art. 27-28, Acuerdo SUGEF 13-19 — Identificar a todos los representantes</p>
          </div>
          {addingType !== 'representante_legal' && (
            <button onClick={() => setAddingType('representante_legal')}
              className="btn-secondary text-xs py-1">+ Agregar</button>
          )}
        </div>
        {representantes.length === 0 && addingType !== 'representante_legal' && (
          <p className="text-xs text-gray-400 italic">Sin representantes legales registrados</p>
        )}
        {representantes.map((p) => {
          const idx = personas.indexOf(p)
          return <PersonaTag key={p.id || idx} persona={p} onRemove={() => eliminar(idx)} />
        })}
        {addingType === 'representante_legal' && (
          <FormPersona tipoRelacion="representante_legal"
            onSave={agregar} onCancel={() => setAddingType(null)} />
        )}
      </section>

      {/* ── Junta Directiva ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between border-b pb-1.5">
          <div>
            <p className="text-sm font-bold text-gray-800">🏛️ Junta Directiva</p>
            <p className="text-xs text-gray-400">Identificar miembros y cargos — Acuerdo SUGEF 13-19, Art. 30</p>
          </div>
          {addingType !== 'junta_directiva' && (
            <button onClick={() => setAddingType('junta_directiva')}
              className="btn-secondary text-xs py-1">+ Agregar</button>
          )}
        </div>
        {junta.length === 0 && addingType !== 'junta_directiva' && (
          <p className="text-xs text-gray-400 italic">Sin miembros de junta directiva registrados</p>
        )}
        {junta.map((p) => {
          const idx = personas.indexOf(p)
          return <PersonaTag key={p.id || idx} persona={p} onRemove={() => eliminar(idx)} />
        })}
        {addingType === 'junta_directiva' && (
          <FormPersona tipoRelacion="junta_directiva"
            onSave={agregar} onCancel={() => setAddingType(null)} />
        )}
      </section>

      {/* ── Socios / Accionistas ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between border-b pb-1.5">
          <div>
            <p className="text-sm font-bold text-gray-800">📊 Socios / Accionistas</p>
            <p className="text-xs text-gray-400">
              Incluir todos los socios ≥15% de participación · Beneficiario Final hasta persona física
            </p>
          </div>
          {addingType !== 'socio' && (
            <button onClick={() => setAddingType('socio')}
              className="btn-secondary text-xs py-1">+ Agregar</button>
          )}
        </div>
        {/* Barra de participación total */}
        {socios.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full ${
                totalParticipacion > 100 ? 'bg-red-500' :
                totalParticipacion === 100 ? 'bg-green-500' : 'bg-yellow-400'
              }`} style={{ width: `${Math.min(totalParticipacion, 100)}%` }} />
            </div>
            <span className={`font-bold w-14 text-right ${
              totalParticipacion > 100 ? 'text-red-600' :
              totalParticipacion === 100 ? 'text-green-600' : 'text-yellow-600'
            }`}>{totalParticipacion.toFixed(1)}%</span>
          </div>
        )}
        {socios.length === 0 && addingType !== 'socio' && (
          <p className="text-xs text-gray-400 italic">Sin socios / accionistas registrados</p>
        )}
        {socios.map((p) => {
          const idx = personas.indexOf(p)
          return (
            <div key={p.id || idx}>
              <PersonaTag
                persona={p}
                onRemove={() => eliminar(idx)}
                onClick={() => {}} // future: expand details
              />
              {/* Si es empresa: mostrar sub-estructura recursiva */}
              {p.tipo_entidad === 'persona_juridica' && (
                <SubEstructuraEmpresa
                  empresa={p}
                  nivel={1}
                  onUpdate={(updated) => actualizar(idx, updated)}
                />
              )}
            </div>
          )
        })}
        {addingType === 'socio' && (
          <FormPersona tipoRelacion="socio"
            onSave={agregar} onCancel={() => setAddingType(null)} />
        )}
      </section>

      {/* Resumen beneficiarios finales */}
      {socios.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-bold">📋 Beneficiarios Finales identificados</p>
          {(() => {
            const beneficiarios = []
            const recolectar = (lista) => {
              lista.forEach(p => {
                if (p.es_beneficiario_final) beneficiarios.push(p.nombre)
                if (p.sub_personas?.length > 0) recolectar(p.sub_personas)
              })
            }
            recolectar(socios)
            return beneficiarios.length > 0
              ? beneficiarios.map(b => <p key={b}>✓ {b}</p>)
              : <p className="text-amber-600 italic">No se han marcado beneficiarios finales todavía. Expanda las empresas socias para identificar la persona física final.</p>
          })()}
        </div>
      )}
    </div>
  )
}
