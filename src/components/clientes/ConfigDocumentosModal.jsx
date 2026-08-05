/**
 * ConfigDocumentosModal.jsx
 * Editor del catálogo de documentos del sujeto obligado activo.
 *
 * Permite renombrar los documentos del catálogo estándar SUGEF 13-19, volverlos
 * obligatorios u opcionales, excluirlos del checklist y agregar requisitos
 * propios. Todo lo que quede activo entra en la calificación de cumplimiento de
 * TODOS los clientes del sujeto obligado, por eso el aviso es explícito.
 *
 * Solo se guardan las diferencias contra el estándar (tabla catalogo_documentos):
 * lo que no se toca sigue heredando la redacción normativa del catálogo base.
 */
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCatalogoDocumental } from '../../lib/CatalogoDocumentalContext'
import {
  CHECKLIST_DOCUMENTAL,
  GRUPOS_DOC,
  TITULOS_GRUPO,
  docIdDesdeLabel,
  esDocEstandar,
} from '../../lib/checklistDocumental'
import { clasificarError } from '../../lib/errorHandler'
import ErrorBanner from '../ui/ErrorBanner'

const AYUDA_GRUPO = {
  base: 'Se solicita a todos los clientes.',
  pj:   'Se solicita únicamente a los clientes que son persona jurídica.',
  pep:  'Se solicita únicamente a los clientes marcados como PEP.',
}

/** Estado editable de la pantalla: catálogo estándar + ajustes + docs propios. */
function construirFilas(personalizaciones) {
  const porId = new Map((personalizaciones || []).map(p => [p.doc_id, p]))
  const filas = []

  GRUPOS_DOC.forEach(grupo => {
    CHECKLIST_DOCUMENTAL[grupo].forEach(item => {
      const p = porId.get(item.id)
      filas.push({
        docId:        item.id,
        grupo,
        label:        (p?.label ?? '').trim() || item.label,
        required:     p?.required == null ? item.required : !!p.required,
        activo:       p?.activo !== false,
        ayuda:        p?.ayuda || '',
        estandar:     true,
        labelBase:    item.label,
        requiredBase: item.required,
        nuevo:        false,
      })
    })
  })

  ;(personalizaciones || [])
    .filter(p => !esDocEstandar(p.doc_id))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .forEach((p, i) => {
      filas.push({
        docId:    p.doc_id,
        grupo:    GRUPOS_DOC.includes(p.grupo) ? p.grupo : 'base',
        label:    p.label || '',
        required: p.required !== false,
        activo:   p.activo !== false,
        ayuda:    p.ayuda || '',
        estandar: false,
        orden:    p.orden ?? i,
        nuevo:    false,
      })
    })

  return filas
}

/** Fila que debe persistirse: la que difiere del estándar o es propia. */
function esPersonalizada(f) {
  if (!f.estandar) return true
  return f.label.trim() !== f.labelBase ||
         f.required !== f.requiredBase ||
         f.activo === false ||
         !!f.ayuda.trim()
}

export default function ConfigDocumentosModal({ onClose, onGuardado }) {
  const { loading } = useCatalogoDocumental()

  // El editor no se monta hasta tener el catálogo del sujeto obligado: su estado
  // inicial se construye una sola vez a partir de las personalizaciones cargadas.
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl px-8 py-6 text-sm text-gray-500 animate-pulse">
          Cargando catálogo de documentos…
        </div>
      </div>
    )
  }
  return <EditorCatalogo onClose={onClose} onGuardado={onGuardado} />
}

function EditorCatalogo({ onClose, onGuardado }) {
  const { personalizaciones, disponible, tenantId, recargar } = useCatalogoDocumental()

  const [filas, setFilas]     = useState(() => construirFilas(personalizaciones))
  const [guardando, setGuard] = useState(false)
  const [error, setError]     = useState(null)
  const [nuevoEn, setNuevoEn] = useState(null)   // grupo con el formulario abierto
  const [nuevo, setNuevo]     = useState({ label: '', required: true, ayuda: '' })

  const activos = filas.filter(f => f.activo).length
  const propios = filas.filter(f => !f.estandar).length

  const porGrupo = useMemo(
    () => GRUPOS_DOC.map(g => ({ grupo: g, items: filas.filter(f => f.grupo === g) })),
    [filas]
  )

  function actualizar(docId, campo, valor) {
    setFilas(fs => fs.map(f => (f.docId === docId ? { ...f, [campo]: valor } : f)))
  }

  function restaurar(docId) {
    setFilas(fs => fs.map(f => (
      f.docId === docId
        ? { ...f, label: f.labelBase, required: f.requiredBase, activo: true, ayuda: '' }
        : f
    )))
  }

  function eliminarPropio(docId) {
    if (!confirm('¿Eliminar este requisito del catálogo?\n\nDejará de contar en la calificación de cumplimiento de los clientes. Lo que ya se haya marcado en cada cliente se conserva por si se vuelve a agregar.')) return
    setFilas(fs => fs.filter(f => f.docId !== docId))
  }

  function agregar(grupo) {
    const label = nuevo.label.trim()
    if (!label) { setError(clasificarError({ message: 'Escriba el nombre del documento.' })); return }
    if (filas.some(f => f.label.trim().toLowerCase() === label.toLowerCase())) {
      setError(clasificarError({ message: `Ya existe un documento llamado «${label}».` }))
      return
    }
    setError(null)
    const docId = docIdDesdeLabel(label, filas.map(f => f.docId))
    setFilas(fs => [...fs, {
      docId, grupo, label,
      required: nuevo.required,
      activo:   true,
      ayuda:    nuevo.ayuda.trim(),
      estandar: false,
      orden:    fs.filter(f => !f.estandar).length,
      nuevo:    true,
    }])
    setNuevo({ label: '', required: true, ayuda: '' })
    setNuevoEn(null)
  }

  async function guardar() {
    if (!tenantId) return
    const vacio = filas.find(f => !f.label.trim())
    if (vacio) { setError(clasificarError({ message: 'Hay un documento sin nombre. Complételo o elimínelo.' })); return }

    setGuard(true)
    setError(null)
    try {
      // Solo se persiste lo que difiere del estándar. En un documento estándar,
      // el campo que NO se tocó viaja en null para que siga heredando la
      // redacción normativa: si mañana cambia el catálogo base, este sujeto
      // obligado recibe la actualización aunque le haya ajustado otro campo.
      const payload = filas.filter(esPersonalizada).map((f, i) => ({
        doc_id:      f.docId,
        grupo:       f.grupo,
        label:       f.estandar && f.label.trim() === f.labelBase ? null : f.label.trim(),
        required:    f.estandar && f.required === f.requiredBase ? null : f.required,
        activo:      f.activo,
        ayuda:       f.ayuda.trim() || null,
        es_estandar: f.estandar,
        orden:       f.estandar ? null : (f.orden ?? i),
      }))

      // Un solo RPC transaccional: borra lo que dejó de diferir del estándar e
      // inserta/actualiza el resto. Hacerlo en dos llamadas dejaba al sujeto
      // obligado sin personalizaciones si la segunda fallaba.
      const { error: errRpc } = await supabase.rpc('guardar_catalogo_documentos', {
        p_tenant_id: tenantId,
        p_filas:     payload,
      })
      if (errRpc) {
        throw errRpc.code === 'PGRST202'
          ? new Error('Falta actualizar la base de datos: vuelva a ejecutar sql/add_catalogo_documentos_tenant.sql en Supabase.')
          : errRpc
      }

      await recargar()
      onGuardado?.()
      onClose()
    } catch (e) {
      setError(clasificarError(e))
    } finally {
      setGuard(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-6">

        {/* Encabezado */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <p className="text-lg font-bold text-gray-900">⚙️ Documentos requeridos por el sujeto obligado</p>
            <p className="text-xs text-gray-500 mt-1">
              {activos} documento{activos !== 1 ? 's' : ''} activo{activos !== 1 ? 's' : ''}
              {propios > 0 && ` · ${propios} propio${propios !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <ErrorBanner error={error} onClose={() => setError(null)} />

          {!disponible && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
              ⚠ La tabla <code>catalogo_documentos</code> todavía no existe en la base de datos.
              Ejecute <code>sql/add_catalogo_documentos_tenant.sql</code> en Supabase para poder guardar.
            </div>
          )}

          <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-xs text-gray-700 space-y-1">
            <p>
              Estos son los documentos que se solicitan en «Documentación presentada» y en la
              Debida Diligencia <strong>a los clientes de este sujeto obligado</strong>.
            </p>
            <p>
              Todo documento activo entra en la calificación de cumplimiento (60% del puntaje del
              cliente): al desactivarlo sale del cálculo y al agregar uno nuevo queda pendiente en
              todos los clientes hasta que se marque.
            </p>
            <p className="text-gray-500">
              Renombrar un documento conserva lo ya marcado en cada cliente. Los documentos del
              catálogo estándar SUGEF 13-19 que no se toquen se mantienen actualizados con la norma.
            </p>
          </div>

          {porGrupo.map(({ grupo, items }) => (
            <div key={grupo} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{TITULOS_GRUPO[grupo]}</p>
                <p className="text-xs text-gray-400 mt-0.5">{AYUDA_GRUPO[grupo]}</p>
              </div>

              <div className="divide-y divide-gray-100">
                {items.map(f => (
                  <div key={f.docId} className={`px-4 py-3 flex items-start gap-3 ${f.activo ? '' : 'bg-gray-50 opacity-70'}`}>
                    <input
                      type="checkbox"
                      checked={f.activo}
                      onChange={e => actualizar(f.docId, 'activo', e.target.checked)}
                      title={f.activo ? 'Se solicita a los clientes' : 'Excluido del checklist'}
                      className="mt-2 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        type="text"
                        value={f.label}
                        onChange={e => actualizar(f.docId, 'label', e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-800 focus:outline-none focus:border-brand-400"
                        placeholder="Nombre del documento"
                      />
                      <input
                        type="text"
                        value={f.ayuda}
                        onChange={e => actualizar(f.docId, 'ayuda', e.target.value)}
                        className="w-full text-xs border border-gray-100 rounded-lg px-2.5 py-1 text-gray-500 focus:outline-none focus:border-brand-300"
                        placeholder="Aclaración opcional que verá quien complete el checklist"
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          f.estandar ? 'bg-gray-100 text-gray-500' : 'bg-brand-100 text-brand-700'
                        }`}>
                          {f.estandar ? 'SUGEF 13-19' : 'Propio'}
                        </span>
                        {f.estandar && f.label.trim() !== f.labelBase && (
                          <span className="text-[10px] text-amber-600" title={f.labelBase}>renombrado</span>
                        )}
                        <label className="text-xs text-gray-600 flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={f.required}
                            onChange={e => actualizar(f.docId, 'required', e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          Obligatorio
                        </label>
                        {f.estandar
                          ? esPersonalizada(f) && (
                            <button
                              onClick={() => restaurar(f.docId)}
                              className="text-xs text-gray-400 hover:text-gray-700 underline">
                              restaurar original
                            </button>
                          )
                          : (
                            <button
                              onClick={() => eliminarPropio(f.docId)}
                              className="text-xs text-red-500 hover:text-red-700 underline">
                              eliminar
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Alta de un requisito propio */}
                {nuevoEn === grupo ? (
                  <div className="px-4 py-3 bg-brand-50/50 space-y-2">
                    <input
                      autoFocus
                      type="text"
                      value={nuevo.label}
                      onChange={e => setNuevo(n => ({ ...n, label: e.target.value }))}
                      placeholder="Nombre del documento o verificación que exige el sujeto obligado"
                      className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-400"
                    />
                    <input
                      type="text"
                      value={nuevo.ayuda}
                      onChange={e => setNuevo(n => ({ ...n, ayuda: e.target.value }))}
                      placeholder="Aclaración opcional (qué debe contener, vigencia, etc.)"
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1 text-gray-600 focus:outline-none focus:border-brand-400"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-xs text-gray-600 flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={nuevo.required}
                          onChange={e => setNuevo(n => ({ ...n, required: e.target.checked }))}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        Obligatorio
                      </label>
                      <button onClick={() => agregar(grupo)}
                        className="px-3 py-1 text-xs font-semibold bg-brand-700 text-white rounded-lg hover:bg-brand-800">
                        Agregar
                      </button>
                      <button onClick={() => { setNuevoEn(null); setNuevo({ label: '', required: true, ayuda: '' }) }}
                        className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNuevoEn(grupo); setNuevo({ label: '', required: true, ayuda: '' }); setError(null) }}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 text-left transition-colors">
                    + Agregar documento a «{TITULOS_GRUPO[grupo]}»
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pie */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <p className="text-xs text-gray-400">
            Al guardar se recalcula la calificación de cumplimiento de todos los clientes.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !disponible || !tenantId}
              className="px-4 py-2 text-sm font-semibold bg-brand-700 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50">
              {guardando ? 'Guardando…' : '💾 Guardar catálogo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
