// ============================================================
// Nivel de Cumplimiento — por GRUPO de empresas
// Matriz: sujetos obligados del grupo (filas) × 8 ítems + total (columnas).
// La ven los usuarios asignados al grupo (y el superadmin, que elige cualquiera).
// Usa la misma función de cálculo que el módulo por-sujeto y el global
// (src/lib/nivelCumplimiento.js) → siempre consistentes.
// ============================================================
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase, esDeLaApp } from '../lib/supabase'
import { useCatalogoDocumental } from '../lib/CatalogoDocumentalContext'
import { calcularNivelCumplimiento, ITEMS_LABELS } from '../lib/nivelCumplimiento'
import * as XLSX from 'xlsx'

const CLIENTE_FIELDS = 'id,pep,tipo_persona,calificacion_riesgo,nivel_riesgo_actual,estado_calificacion,estado_dd,estado_listas,kyc_actualizado,legal_actualizado,ingresos_actualizados,fecha_ultima_calificacion,aparece_en_listas,fecha_termino_relacion,activo,nombre_cliente,primer_apellido,nombre_empresa,numero_identificacion,cedula_juridica,checklist_documental,tenant_id'

function colorFondo(p) {
  if (p >= 80) return { background: '#eaf6ef', color: '#1f6d45' }
  if (p >= 60) return { background: '#fdf8ec', color: '#8a6d12' }
  if (p >= 40) return { background: '#fdf3e6', color: '#a5561a' }
  return { background: '#fdecec', color: '#c31b26' }
}

function agrupar(filas, key) {
  const m = new Map()
  for (const r of filas || []) {
    if (!m.has(r[key])) m.set(r[key], [])
    m.get(r[key]).push(r)
  }
  return m
}

export default function CumplimientoPorGrupo() {
  const { isSuperAdmin, misGrupos } = useAuth()
  const { catalogoDeTenant } = useCatalogoDocumental()

  const [grupos, setGrupos]     = useState([])   // grupos disponibles para elegir
  const [grupoSel, setGrupoSel] = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [filas, setFilas]       = useState([])

  // ── Grupos disponibles: superadmin ve todos; el usuario ve los suyos ──
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from('grupos_empresas').select('id, nombre').eq('activo', true).order('nombre')
        if (!vivo) return
        if (error) { setError(error.message); setLoading(false); return }
        setGrupos(data || [])
        setGrupoSel(g => g || (data?.[0]?.id ?? ''))
      } else {
        const lista = (misGrupos || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        setGrupos(lista)
        setGrupoSel(g => g || (lista[0]?.id ?? ''))
        if (lista.length === 0) setLoading(false)
      }
    })().catch(e => { if (vivo) { setError(e.message); setLoading(false) } })
    return () => { vivo = false }
  }, [isSuperAdmin, misGrupos])

  // ── Cargar y calcular el grupo seleccionado ──
  useEffect(() => {
    if (!grupoSel) return
    let vivo = true
    ;(async () => {
      setLoading(true); setError(null)
      const { data: tenants, error: eT } = await supabase
        .from('tenants').select('*').eq('grupo_id', grupoSel)
      if (eT) { if (vivo) { setError(eT.message); setLoading(false) } return }
      const dela = (tenants || []).filter(esDeLaApp)
      const ids = dela.map(t => t.id)
      if (!ids.length) { if (vivo) { setFilas([]); setLoading(false) } return }

      const [cls, norm, txns, infs, segs] = await Promise.all([
        supabase.from('clientes').select(CLIENTE_FIELDS).in('tenant_id', ids),
        supabase.from('normativa').select('id,fecha_aprobacion_jd,fecha_vigencia,tipo,nombre,tenant_id').in('tenant_id', ids).eq('activo', true),
        supabase.from('transacciones').select('tenant_id,periodo').in('tenant_id', ids).order('periodo', { ascending: false }),
        supabase.from('informes_generados').select('tenant_id,fecha_generacion').in('tenant_id', ids).order('fecha_generacion', { ascending: false }),
        supabase.from('compliance_seguimiento').select('*').in('tenant_id', ids),
      ])
      const primerFallo = [cls, norm, txns, infs, segs].find(r => r.error && r.error.code !== 'PGRST116')
      if (primerFallo) { if (vivo) { setError(primerFallo.error.message); setLoading(false) } return }

      const gCls = agrupar(cls.data, 'tenant_id')
      const gNorm = agrupar(norm.data, 'tenant_id')
      const gTxn = agrupar(txns.data, 'tenant_id')
      const gInf = agrupar(infs.data, 'tenant_id')
      const segMap = new Map((segs.data || []).map(s => [s.tenant_id, s]))

      const res = dela.map(t => {
        const r = calcularNivelCumplimiento({
          tenant: t,
          clientes: gCls.get(t.id) || [],
          normativa: gNorm.get(t.id) || [],
          transacciones: gTxn.get(t.id) || [],
          informes: gInf.get(t.id) || [],
          seguimiento: segMap.get(t.id) || null,
          catalogoDoc: catalogoDeTenant(t.id),
        })
        return { tenant: t, items: r.items, scoreGlobal: r.scoreGlobal, etiqueta: r.etiqueta }
      })
      res.sort((a, b) => a.scoreGlobal - b.scoreGlobal) // peores primero
      if (vivo) { setFilas(res); setLoading(false) }
    })().catch(e => { if (vivo) { setError(e.message); setLoading(false) } })
    return () => { vivo = false }
  }, [grupoSel, catalogoDeTenant])

  function exportarExcel() {
    const nombreGrupo = grupos.find(g => g.id === grupoSel)?.nombre || 'grupo'
    const encabezado = ['Sujeto obligado', ...ITEMS_LABELS.map((l, i) => `${i + 1}. ${l}`), 'Total', 'Estatus']
    const cuerpo = filas.map(f => [
      f.tenant.nombre,
      ...f.items.map(it => Math.round(it.score)),
      Math.round(f.scoreGlobal),
      f.etiqueta,
    ])
    const ws = XLSX.utils.aoa_to_sheet([encabezado, ...cuerpo])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nivel de cumplimiento')
    XLSX.writeFile(wb, `nivel-cumplimiento-${nombreGrupo.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (!isSuperAdmin && (misGrupos || []).length === 0) {
    return <div className="p-6 text-gray-500">No pertenece a ningún grupo de empresas.</div>
  }

  // Promedios por ítem
  const promedios = ITEMS_LABELS.map((_, i) => {
    if (!filas.length) return 0
    return Math.round(filas.reduce((s, f) => s + f.items[i].score, 0) / filas.length)
  })
  const promGlobal = filas.length ? Math.round(filas.reduce((s, f) => s + f.scoreGlobal, 0) / filas.length) : 0
  const dist = {
    alto:    filas.filter(f => f.scoreGlobal >= 80).length,
    mod:     filas.filter(f => f.scoreGlobal >= 60 && f.scoreGlobal < 80).length,
    bajo:    filas.filter(f => f.scoreGlobal >= 40 && f.scoreGlobal < 60).length,
    critico: filas.filter(f => f.scoreGlobal < 40).length,
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nivel de Cumplimiento — por Grupo</h1>
          <p className="text-sm text-gray-500">Estatus de los sujetos obligados del grupo, punto por punto.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {grupos.length > 1 && (
            <select
              value={grupoSel}
              onChange={e => setGrupoSel(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          )}
          {grupos.length === 1 && (
            <span className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700">
              {grupos[0].nombre}
            </span>
          )}
          <button onClick={exportarExcel} disabled={!filas.length}
            className="btn-secondary text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            ⬇ Exportar a Excel
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">Error al cargar: {error}</div>}
      {loading ? (
        <div className="p-6 text-gray-500">Calculando el nivel de cumplimiento del grupo…</div>
      ) : filas.length === 0 ? (
        <div className="p-6 text-gray-500">Este grupo no tiene sujetos obligados asignados todavía.</div>
      ) : (
        <>
          {/* Distribución */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'Alto (≥80)', n: dist.alto, c: '#1f6d45' },
              { l: 'Moderado (60-79)', n: dist.mod, c: '#8a6d12' },
              { l: 'Bajo (40-59)', n: dist.bajo, c: '#a5561a' },
              { l: 'Crítico (<40)', n: dist.critico, c: '#c31b26' },
            ].map(x => (
              <div key={x.l} className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: x.c }}>{x.n}</div>
                <div className="text-xs text-gray-500">{x.l}</div>
              </div>
            ))}
          </div>

          {/* Matriz */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="text-sm border-collapse min-w-full">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold border-b border-gray-200 min-w-[220px]">Sujeto obligado</th>
                  {ITEMS_LABELS.map((l, i) => (
                    <th key={i} className="px-2 py-2 text-center font-semibold border-b border-gray-200 min-w-[64px]" title={l}>
                      <div className="text-xs">{i + 1}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold border-b border-gray-200 bg-gray-100">Total</th>
                  <th className="px-3 py-2 text-center font-semibold border-b border-gray-200">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => (
                  <tr key={f.tenant.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-gray-800 border-r border-gray-100">{f.tenant.nombre}</td>
                    {f.items.map((it, i) => {
                      const s = Math.round(it.score)
                      const st = colorFondo(s)
                      return (
                        <td key={i} className="px-2 py-1.5 text-center font-semibold" style={st} title={`${it.num}. ${it.label}: ${s}%`}>{s}</td>
                      )
                    })}
                    <td className="px-3 py-1.5 text-center font-bold" style={colorFondo(Math.round(f.scoreGlobal))}>{Math.round(f.scoreGlobal)}</td>
                    <td className="px-3 py-1.5 text-center text-xs" style={{ color: colorFondo(Math.round(f.scoreGlobal)).color }}>{f.etiqueta}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 border-t-2 border-gray-200">Promedio</td>
                  {promedios.map((p, i) => (
                    <td key={i} className="px-2 py-2 text-center border-t-2 border-gray-200" style={{ color: colorFondo(p).color }}>{p}</td>
                  ))}
                  <td className="px-3 py-2 text-center border-t-2 border-gray-200" style={colorFondo(promGlobal)}>{promGlobal}</td>
                  <td className="border-t-2 border-gray-200" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Referencia de ítems */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">Referencia de ítems</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
              {ITEMS_LABELS.map((l, i) => <div key={i}><strong>{i + 1}.</strong> {l}</div>)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
