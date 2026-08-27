import { useState } from 'react'
import TransactionForm from '../components/module1/TransactionForm'
import TransactionList from '../components/module1/TransactionList'
import CargaMasivaTransacciones from '../components/carga/CargaMasivaTransacciones'
import CalendarioReportes from '../components/module1/CalendarioReportes'
import { useAuth } from '../lib/AuthContext'
import { supabase, traerTodo } from '../lib/supabase'
import { exportarExcel } from '../lib/exportExcel'
import { logAudit } from '../lib/auditLog'
import { useSoloLectura } from '../lib/useSoloLectura'
import AvisoSoloLectura from '../components/ui/AvisoSoloLectura'

export default function Transacciones() {
  const { tenant } = useAuth()
  const soloLectura = useSoloLectura()
  const [refresh, setRefresh]   = useState(0)
  const [editData, setEditData] = useState(null)
  const [showForm, setShowForm] = useState(false)

  function handleSaved() {
    setRefresh(r => r + 1)
    setEditData(null)
    setShowForm(false)
  }

  function handleEdit(row) {
    setEditData(row)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transacciones APNFD</h1>
          <p className="text-gray-500 text-sm mt-1">Registro de transacciones para reporte SUGEF / SICVECA</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!tenant?.id) { alert('Seleccione un sujeto obligado primero.'); return }
              const { data } = await traerTodo(() => supabase.from('transacciones').select('*')
                .eq('tenant_id', tenant.id)
                .order('fecha_transaccion', { ascending: false }).order('id'))
              if (!data || !data.length) { alert('No hay transacciones para exportar.'); return }
              exportarExcel({
                data: data.map(r => ({ ...r, enviado_sugef: r.enviado_sugef ? 'Si' : 'No' })),
                columnas: ['numero_identificacion','nombre_cliente','primer_apellido','nombre_empresa',
                  'tipo_movimiento','monto_movimiento','tipo_moneda_movimiento',
                  'fecha_transaccion','periodo','motivo_transaccion',
                  'pais_origen_recursos','pais_destino_recursos','enviado_sugef'],
                headers: {
                  numero_identificacion: 'N Identificacion', nombre_cliente: 'Nombre',
                  primer_apellido: 'Apellido', nombre_empresa: 'Empresa',
                  tipo_movimiento: 'Movimiento', monto_movimiento: 'Monto',
                  tipo_moneda_movimiento: 'Moneda', fecha_transaccion: 'Fecha',
                  periodo: 'Periodo', motivo_transaccion: 'Motivo',
                  pais_origen_recursos: 'Pais Origen', pais_destino_recursos: 'Pais Destino',
                  enviado_sugef: 'Enviado SUGEF',
                },
                nombreArchivo: 'transacciones_cnl',
                nombreHoja: 'Transacciones',
              })
              logAudit({ accion: 'exportar', tabla: 'transacciones', descripcion: 'Exportacion Excel' })
            }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            Exportar Excel
          </button>
          {!soloLectura && (
            <button className="btn-primary"
              onClick={() => { setEditData(null); setShowForm(s => !s) }}>
              {showForm && !editData ? 'Cancelar' : '+ Nueva transaccion'}
            </button>
          )}
        </div>
      </div>

      {soloLectura && <AvisoSoloLectura />}

      {(showForm || editData) && !soloLectura && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editData ? 'Editar transaccion' : 'Registrar nueva transaccion'}
          </h2>
          <TransactionForm editData={editData} onSaved={handleSaved}
            onCancel={() => { setEditData(null); setShowForm(false) }} />
        </div>
      )}

      {tenant?.id && (
        <CalendarioReportes tenantId={tenant.id} refreshTrigger={refresh} />
      )}

      {!soloLectura && (
        <CargaMasivaTransacciones onImportado={() => setRefresh(r => r + 1)} />
      )}

      <TransactionList refreshTrigger={refresh} onEdit={soloLectura ? undefined : handleEdit} soloLectura={soloLectura} />
    </div>
  )
}
