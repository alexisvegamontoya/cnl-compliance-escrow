// Aviso de modo consulta para las pantallas donde el rol solo puede ver.
export default function AvisoSoloLectura({ className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ${className}`}>
      <span className="text-base leading-none">👁️</span>
      <span><strong>Modo consulta.</strong> Tu rol puede ver esta sección, pero no modificarla.</span>
    </div>
  )
}
