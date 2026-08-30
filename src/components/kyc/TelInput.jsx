// Teléfono con código de país. Almacena un solo string con formato "(506) 8888-8888".
const CODIGOS = [
  ['506', '🇨🇷 +506'], ['507', '🇵🇦 +507'], ['505', '🇳🇮 +505'],
  ['502', '🇬🇹 +502'], ['503', '🇸🇻 +503'], ['504', '🇭🇳 +504'],
  ['1', '🇺🇸 +1'], ['52', '🇲🇽 +52'], ['57', '🇨🇴 +57'],
  ['58', '🇻🇪 +58'], ['51', '🇵🇪 +51'], ['56', '🇨🇱 +56'],
  ['54', '🇦🇷 +54'], ['34', '🇪🇸 +34'],
]

export default function TelInput({ value, onChange, cls }) {
  const m = /^\(\+?(\d+)\)\s*([\s\S]*)$/.exec(value || '')
  const code = m ? m[1] : '506'
  const num = m ? m[2] : (value || '')
  const emit = (c, n) => onChange(n ? `(${c}) ${n}` : '')
  return (
    <div className="flex gap-2">
      <select className={`${cls} w-24 flex-none`} value={code} onChange={e => emit(e.target.value, num)}>
        {CODIGOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input className={cls} value={num} onChange={e => emit(code, e.target.value)} placeholder="Número de teléfono" />
    </div>
  )
}
