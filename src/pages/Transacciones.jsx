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
              const tid = isSuperAdmin ? tenantVista : tenant?.id
              if (!tid) { alert('Seleccione un sujeto obligado primero.'); return }
              const { data } = await supabase
                .from('transacciones')
                .select('*')
                .eq('tenant_id', tid)
                .order('fecha_transaccion', { ascending: false })
              if (!data || !data.length) { alert('No hay transacciones para exportar.'); return }
              exportarExcel({
                data: data.map(r => ({
                  ...r,
                  enviado_sugef: r.enviado_sugef ? 'Sí' : 'No',
                })),
                columnas: ['numero_identificacion','nombre_cliente','primer_apellido','nombre_empresa',
                  'tipo_movimiento','monto_movimiento','tipo_moneda_movimiento',
                  'fecha_transaccion','periodo','motivo_transaccion',
                  'pais_origen_recursos','pais_destino_recursos','enviado_sugef'],
                headers: {
                  numero_identificacion: 'N° Identificación',
                  nombre_cliente: 'Nombre', primer_apellido: 'Apellido', nombre_empresa: 'Empresa',
                  tipo_movimiento: 'Movimiento', monto_movimiento: 'Monto',
                  tipo_moneda_movimiento: 'Moneda', fecha_transaccion: 'Fecha Transacción',
                  periodo: 'Período', motivo_transaccion: 'Motivo',
                  pais_origen_recursos: 'País Origen', pais_destino_recursos: 'País Destino',
                  enviado_sugef: 'Enviado SUGEF',
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
   