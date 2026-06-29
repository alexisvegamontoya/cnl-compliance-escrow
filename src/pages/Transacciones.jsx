import { useState, useEffect } from 'react'
import TransactionForm from '../components/module1/TransactionForm'
import TransactionList from '../components/module1/TransactionList'
import CargaMasivaTransacciones from '../components/carga/CargaMasivaTransacciones'
import CalendarioReportes from '../components/module1/CalendarioReportes'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { exportarExcel } from '../lib/exportExcel'
import { logAudit } from '../lib/auditLog'

export default function Transacciones() {
  const { tenant, isSuperAdmin } = useAuth()
  const [refresh, setRefresh]       = useState(0)
  const [editData, setEditData]     = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [tenants, setTenants]       = useState([])
  const [tenantVista, setTenantVista] = useState('')  // para superadmin en calendario

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('tenants').select('id, nombre, actividad_apnfd, clase_dato').order('nombre')
        .then(({ data }) => setTenants(data || []))
    }
  }, [isSuperAdmin])

  // tenantId activo para el calendario
  const tenantIdCalendario = isSuperAdmin ? tenantVista : tenant?.id

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transacciones APNFD</h1>
          <p className="text-gray-500 text-sm mt-1">Registro de transacciones para reporte SUGEF / SICVECA</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const { data } = await supabase.from('transacciones').select('*').order('fecha_transaccion', { ascending: false })
              if (!data) return
              exportarExcel({
                data,
                columnas: ['fecha_transaccion','tipo_transaccion','monto','moneda','nombre_cliente','numero_identificacion','descripcion','medio_pago','pais_origen','pais_destino'],
                headers: {
                  fecha_transaccion: 'Fecha', tipo_transaccion: 'Tipo', monto: 'Monto', moneda: 'Moneda',
                  nombre_cliente: 'Cliente', numero_identificacion: 'N° ID', descripcion: 'Descripción',
                  medio_pago: 'Medio de Pago', pais_origen: 'País Origen', pais_destino: 'País Destino',
                },
                nombreArchivo: 'transacciones_cnl',
                nombreHoja: 'Transacciones',
              })
              logAudit({ accion: 'exportar', tabla: 'transacciones', descripcion: `Exportación Excel de ${data.length} transacciones` })
            }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            📥 Exportar Excel
          </button>
          <button
            className="btn-primary"
            onClick={() => { setEditData(null); setShowForm(s => !s) }}
          >
            {showForm && !editData ? '✕ Cancelar' : '+ Nueva transacción'}
          </button>
        </div>
      </div>

      {/* Formulario nueva / editar */}
      {(showForm || editData) && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editData ? 'Editar transacción' : 'Registrar nueva transacción'}
          </h2>
          <TransactionForm
            editData={editData}
            onSaved={handleSaved}
            onCancel={() => { setEditData(null); setShowForm(false) }}
          />
        </div>
      )}

      {/* Selector sujeto obligado para superadmin (calendario) */}
      {isSuperAdmin && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-sm font-medium text-amber-700 flex-shrink-0">🏢 Ver calendario de:</span>
          <select
            className="input-field text-sm"
            value={tenantVista}
            onChange={e => setTenantVista(e.target.value)}
          >
            <option value="">— Seleccione sujeto obligado —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      )}

      {/* Calendario de períodos reportados */}
      {tenantIdCalendario && (
        <CalendarioReportes
          tenantId={tenantIdCalendario}
          refreshTrigger={refresh}
        />
      )}

      {/* Carga masiva */}
      <CargaMasivaTransacciones
        tenants={tenants}
        onImportado={() => setRefresh(r => r + 1)}
      />

      <TransactionList refreshTrigger={refresh} onEdit={handleEdit} tenants={tenants} />
    </div>
  )
}
