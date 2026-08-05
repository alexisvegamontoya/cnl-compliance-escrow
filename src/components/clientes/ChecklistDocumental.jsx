/**
 * ChecklistDocumental.jsx
 * Tabla del checklist de documentación presentada por el cliente.
 * Se usa en el perfil del cliente, en el formulario de cliente y en el
 * asistente de Debida Diligencia — siempre sobre el mismo catálogo, por lo que
 * el estado es intercambiable. El catálogo es el del sujeto obligado activo
 * (estándar SUGEF 13-19 + sus ajustes); si no se recibe por props se toma del
 * contexto, de modo que ninguna pantalla se queda con el catálogo equivocado.
 */
import {
  gruposChecklist,
  itemsChecklist,
  estadoItem,
  notaItem,
  resumenChecklist,
  ESTADOS_CHECKLIST,
  ESTADO_LABEL,
} from '../../lib/checklistDocumental'
import { useCatalogoDocumental } from '../../lib/CatalogoDocumentalContext'

const CLASES_ESTADO = {
  disponible:    'border-green-300 bg-green-50 text-green-700',
  no_disponible: 'border-red-300 bg-red-50 text-red-700',
  no_aplica:     'border-gray-200 bg-gray-50 text-gray-500',
  pendiente:     'border-amber-200 bg-amber-50 text-amber-700',
}

const TEXTO_ESTADO = {
  disponible:    'text-green-700',
  no_disponible: 'text-red-700',
  no_aplica:     'text-gray-500',
  pendiente:     'text-amber-600',
}

export default function ChecklistDocumental({
  checklist = {},
  onChange,
  tipoPersona = 'fisica',
  esPEP = false,
  soloLectura = false,
  conNotas = true,
  catalogo,
}) {
  const { catalogo: catalogoTenant } = useCatalogoDocumental()
  const cat     = catalogo || catalogoTenant
  const ctx     = { tipoPersona, esPEP }
  const grupos  = gruposChecklist(ctx, cat)
  const resumen = resumenChecklist(checklist, itemsChecklist(ctx, cat))

  const setItem = (id, campo, valor) => {
    if (!onChange) return
    onChange({
      ...checklist,
      [id]: { estado: estadoItem(checklist, id), nota: notaItem(checklist, id), [campo]: valor },
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">
          Acuerdo SUGEF 13-19, Art. 21-28 · {resumen.ok}/{resumen.evaluables} documentos recibidos
          {resumen.noAplica > 0 && ` · ${resumen.noAplica} no aplica${resumen.noAplica !== 1 ? 'n' : ''}`}
        </p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          resumen.pct >= 80 ? 'bg-green-100 text-green-700'
            : resumen.pct >= 50 ? 'bg-yellow-100 text-yellow-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {Math.round(resumen.pct)}% completado
        </span>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Documento / Verificación</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-14">Req.</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-44">Estado</th>
              {conNotas && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Notas / Referencia</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grupos.flatMap((grupo, gi) => [
              <tr key={`h-${gi}`} className="bg-gray-50">
                <td colSpan={conNotas ? 5 : 4} className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {grupo.titulo}
                </td>
              </tr>,
              ...grupo.items.map((item, idx) => {
                const estado = estadoItem(checklist, item.id)
                const nota   = notaItem(checklist, item.id)
                const rowBg  = estado === 'disponible' ? 'bg-green-50' : estado === 'no_disponible' ? 'bg-red-50' : ''
                return (
                  <tr key={item.id} className={`${rowBg} transition-colors`}>
                    <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {item.label}
                      {item.estandar === false && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 align-middle"
                          title="Requisito propio de este sujeto obligado">
                          Propio
                        </span>
                      )}
                      {item.ayuda && <p className="text-xs text-gray-400 mt-0.5">{item.ayuda}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${item.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.required ? 'Obl' : 'Opt'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {soloLectura ? (
                        <span className={`text-xs font-semibold ${TEXTO_ESTADO[estado]}`}>{ESTADO_LABEL[estado]}</span>
                      ) : (
                        <select
                          value={estado}
                          onChange={e => setItem(item.id, 'estado', e.target.value)}
                          className={`w-full text-xs border rounded px-2 py-1.5 focus:outline-none ${CLASES_ESTADO[estado]}`}>
                          {ESTADOS_CHECKLIST.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                        </select>
                      )}
                    </td>
                    {conNotas && (
                      <td className="px-3 py-2">
                        {soloLectura ? (
                          <span className="text-xs text-gray-500">{nota || <span className="text-gray-300 italic">—</span>}</span>
                        ) : (
                          <input
                            type="text" value={nota} placeholder="Observaciones..."
                            onChange={e => setItem(item.id, 'nota', e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:border-brand-400" />
                        )}
                      </td>
                    )}
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}
