// Estructura de la empresa para el portal KYC (persona jurídica):
// representantes legales (con datos completos, uno o varios), junta directiva,
// socios (≥10%) y socios que son empresas.
import { PAISES_RIESGO } from '../../lib/metodologiaRiesgo'

const PAISES = PAISES_RIESGO.map(p => p.pais).sort((a, b) => a.localeCompare(b, 'es'))
const TIPO_ID = [['cedula', 'Cédula de identidad'], ['dimex', 'DIMEX'], ['pasaporte', 'Pasaporte']]
const SEXO = [['M', 'Masculino'], ['F', 'Femenino'], ['otro', 'Otro']]
const SI_NO = [['no', 'No'], ['si', 'Sí']]

const REP_VACIO = {
  nombre: '', tipo_id: 'cedula', num_id: '', venc_id: '', nacionalidad: 'Costa Rica',
  fecha_nac: '', pais_nac: 'Costa Rica', ocupacion: '', estado_civil: '', sexo: '',
  direccion: '', telefono: '', correo: '', es_pep: 'no',
}

const inp = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500'

export default function EstructuraKyc({ datos, set }) {
  const arr = (k) => (Array.isArray(datos[k]) ? datos[k] : [])
  const upd = (k, i, f, v) => set(k, arr(k).map((it, j) => (j === i ? { ...it, [f]: v } : it)))
  const add = (k, tpl) => set(k, [...arr(k), tpl])
  const del = (k, i) => set(k, arr(k).filter((_, j) => j !== i))

  const Sel = ({ v, onChange, opts, ph = '—' }) => (
    <select className={inp} value={v || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{ph}</option>
      {opts.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
    </select>
  )
  const Pais = ({ v, onChange }) => (
    <select className={inp} value={v || ''} onChange={e => onChange(e.target.value)}>
      <option value="">— País —</option>
      {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  )
  const L = ({ children }) => <label className="block text-[11px] font-medium text-gray-500 mb-0.5">{children}</label>

  return (
    <div className="space-y-5">
      {/* Representantes legales */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">Representante(s) legal(es) *</h3>
          <button type="button" onClick={() => add('representantes', { ...REP_VACIO })} className="text-xs font-semibold text-brand-600 hover:underline">+ Agregar representante</button>
        </div>
        {arr('representantes').length === 0 && <p className="text-xs text-gray-400 mt-1">Agregue al menos un representante legal.</p>}
        {arr('representantes').map((r, i) => (
          <div key={i} className="mt-2 rounded-lg border border-gray-200 p-3 bg-gray-50/50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-gray-500">Representante {i + 1}</span>
              <button type="button" onClick={() => del('representantes', i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-3"><L>Nombre completo</L><input className={inp} value={r.nombre} onChange={e => upd('representantes', i, 'nombre', e.target.value)} /></div>
              <div><L>Tipo de identificación</L><Sel v={r.tipo_id} onChange={v => upd('representantes', i, 'tipo_id', v)} opts={TIPO_ID} /></div>
              <div><L>Número de identificación</L><input className={inp} value={r.num_id} onChange={e => upd('representantes', i, 'num_id', e.target.value)} /></div>
              <div><L>Vencimiento del documento</L><input type="date" className={inp} value={r.venc_id} onChange={e => upd('representantes', i, 'venc_id', e.target.value)} /></div>
              <div><L>Nacionalidad</L><Pais v={r.nacionalidad} onChange={v => upd('representantes', i, 'nacionalidad', v)} /></div>
              <div><L>Fecha de nacimiento</L><input type="date" className={inp} value={r.fecha_nac} onChange={e => upd('representantes', i, 'fecha_nac', e.target.value)} /></div>
              <div><L>País de nacimiento</L><Pais v={r.pais_nac} onChange={v => upd('representantes', i, 'pais_nac', v)} /></div>
              <div><L>Ocupación</L><input className={inp} value={r.ocupacion} onChange={e => upd('representantes', i, 'ocupacion', e.target.value)} /></div>
              <div><L>Estado civil</L><input className={inp} value={r.estado_civil} onChange={e => upd('representantes', i, 'estado_civil', e.target.value)} /></div>
              <div><L>Sexo</L><Sel v={r.sexo} onChange={v => upd('representantes', i, 'sexo', v)} opts={SEXO} /></div>
              <div className="sm:col-span-2"><L>Dirección</L><input className={inp} value={r.direccion} onChange={e => upd('representantes', i, 'direccion', e.target.value)} /></div>
              <div><L>Teléfono</L><input className={inp} value={r.telefono} onChange={e => upd('representantes', i, 'telefono', e.target.value)} /></div>
              <div><L>Correo</L><input type="email" className={inp} value={r.correo} onChange={e => upd('representantes', i, 'correo', e.target.value)} /></div>
              <div><L>¿Es PEP?</L><Sel v={r.es_pep} onChange={v => upd('representantes', i, 'es_pep', v)} opts={SI_NO} /></div>
            </div>
          </div>
        ))}
      </section>

      {/* Junta directiva */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">Miembros de la junta directiva</h3>
          <button type="button" onClick={() => add('junta', { nombre: '', cedula: '', cargo: '' })} className="text-xs font-semibold text-brand-600 hover:underline">+ Agregar</button>
        </div>
        {arr('junta').map((m, i) => (
          <div key={i} className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
            <div><L>Nombre</L><input className={inp} value={m.nombre} onChange={e => upd('junta', i, 'nombre', e.target.value)} /></div>
            <div><L>Cédula</L><input className={inp} value={m.cedula} onChange={e => upd('junta', i, 'cedula', e.target.value)} /></div>
            <div><L>Cargo</L><input className={inp} value={m.cargo} onChange={e => upd('junta', i, 'cargo', e.target.value)} /></div>
            <button type="button" onClick={() => del('junta', i)} className="text-red-400 hover:text-red-600 text-lg leading-none pb-1.5">×</button>
          </div>
        ))}
      </section>

      {/* Socios (personas físicas) */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">Socios / accionistas (≥ 10%)</h3>
          <button type="button" onClick={() => add('socios', { nombre: '', identificacion: '', participacion: '' })} className="text-xs font-semibold text-brand-600 hover:underline">+ Agregar</button>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">Indique los nombres de los principales socios de la empresa y su porcentaje de participación accionaria. Solamente se deben incluir aquellos socios que posean 10% o más de participación en el capital social de la empresa.</p>
        {arr('socios').map((s, i) => (
          <div key={i} className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
            <div><L>Nombre</L><input className={inp} value={s.nombre} onChange={e => upd('socios', i, 'nombre', e.target.value)} /></div>
            <div><L>Identificación</L><input className={inp} value={s.identificacion} onChange={e => upd('socios', i, 'identificacion', e.target.value)} /></div>
            <div><L>% Participación</L><input type="number" min="0" max="100" className={inp} value={s.participacion} onChange={e => upd('socios', i, 'participacion', e.target.value)} /></div>
            <button type="button" onClick={() => del('socios', i)} className="text-red-400 hover:text-red-600 text-lg leading-none pb-1.5">×</button>
          </div>
        ))}
      </section>

      {/* Socios que son empresas */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">Socios que son empresas</h3>
          <button type="button" onClick={() => add('socios_empresas', { nombre: '', identificacion: '', participacion: '', rep_nombre: '', socios: '' })} className="text-xs font-semibold text-brand-600 hover:underline">+ Agregar empresa socia</button>
        </div>
        {arr('socios_empresas').map((s, i) => (
          <div key={i} className="mt-2 rounded-lg border border-gray-200 p-3 bg-gray-50/50">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-gray-500">Empresa socia {i + 1}</span>
              <button type="button" onClick={() => del('socios_empresas', i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2"><L>Nombre de la empresa</L><input className={inp} value={s.nombre} onChange={e => upd('socios_empresas', i, 'nombre', e.target.value)} /></div>
              <div><L>Cédula jurídica</L><input className={inp} value={s.identificacion} onChange={e => upd('socios_empresas', i, 'identificacion', e.target.value)} /></div>
              <div><L>% Participación</L><input type="number" min="0" max="100" className={inp} value={s.participacion} onChange={e => upd('socios_empresas', i, 'participacion', e.target.value)} /></div>
              <div className="sm:col-span-2"><L>Representante legal de la empresa socia</L><input className={inp} value={s.rep_nombre} onChange={e => upd('socios_empresas', i, 'rep_nombre', e.target.value)} /></div>
              <div className="sm:col-span-3"><L>Socios de la empresa socia (nombres e identificación)</L><textarea className={inp} rows={2} value={s.socios} onChange={e => upd('socios_empresas', i, 'socios', e.target.value)} /></div>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
