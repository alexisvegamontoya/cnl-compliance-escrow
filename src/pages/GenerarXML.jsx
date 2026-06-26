import XMLGenerator from '../components/module1/XMLGenerator'

export default function GenerarXML() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Generar XML SICVECA</h1>
        <p className="text-gray-500 text-sm mt-1">Exporta las transacciones del período en formato XML para SUGEF</p>
      </div>
      <XMLGenerator />
    </div>
  )
}
