// ============================================================
// Catálogos SUGEF / SICVECA — Módulo 1
// ============================================================

export const ACTIVIDADES_APNFD = [
  { nombre: 'Metales y Piedras Preciosas',    clase_dato: 40, archivo: 4001, monto_min_usd: 15000 },
  { nombre: 'Casas de Empeño',                clase_dato: 41, archivo: 4101, monto_min_usd: 10000 },
  { nombre: 'Organizaciones Sin Fines Lucro', clase_dato: 42, archivo: 4201, monto_min_usd: 1000  },
  { nombre: 'Casinos',                        clase_dato: 43, archivo: 4301, monto_min_usd: 3000  },
  { nombre: 'Administración de Dinero',       clase_dato: 44, archivo: 4401, monto_min_usd: 10000 },
  { nombre: 'Remesas y Transferencias',       clase_dato: 45, archivo: 4501, monto_min_usd: 1000  },
  { nombre: 'Emisión/Operación Tarjetas',     clase_dato: 46, archivo: 4601, monto_min_usd: 10000 },
  { nombre: 'Facilidades Crediticias',        clase_dato: 47, archivo: 4701, monto_min_usd: 10000 },
  { nombre: 'Servicios Fiduciarios',          clase_dato: 48, archivo: 4801, monto_min_usd: 10000 },
  { nombre: 'Bienes Inmuebles',               clase_dato: 49, archivo: 4901, monto_min_usd: 10000 },
]

export const TIPO_IDENTIFICACION = [
  { codigo: 1,  descripcion: 'Persona física nacional' },
  { codigo: 2,  descripcion: 'Persona jurídica nacional' },
  { codigo: 3,  descripcion: 'Extranjero residente (DIMEX)' },
  { codigo: 4,  descripcion: 'Entidad financiera extranjera' },
  { codigo: 5,  descripcion: 'Otra persona extranjera (pasaporte)' },
  { codigo: 6,  descripcion: 'Empresa extranjera no financiera' },
  { codigo: 13, descripcion: 'Fideicomiso' },
]

export const TIPO_REPORTE = [
  { codigo: 1, descripcion: 'Efectivo' },
  { codigo: 2, descripcion: 'APNFD (otros medios de pago)' },
  { codigo: 3, descripcion: 'Efectivo y otros medios de pago' },
]

export const TIPO_OPERACION = [
  { codigo: 1, descripcion: 'Operación única' },
  { codigo: 2, descripcion: 'Operación múltiple' },
]

export const TIPO_MOVIMIENTO = [
  { codigo: 1, descripcion: 'Ingreso (cliente paga a la entidad)' },
  { codigo: 2, descripcion: 'Salida (entidad desembolsa al cliente)' },
  { codigo: 3, descripcion: 'Ingreso/Salida (solo Casinos)' },
]

export const TIPO_MONEDA = [
  { codigo: 1, descripcion: 'Colón (CRC)', indicador: 'N' },
  { codigo: 2, descripcion: 'Dólar (USD)', indicador: 'E' },
  { codigo: 3, descripcion: 'Euro (EUR)',  indicador: 'E' },
  { codigo: 4, descripcion: 'Otra moneda', indicador: 'E' },
]

export const TIPO_CARGA = [
  { codigo: 1, descripcion: 'Carga nueva' },
  { codigo: 2, descripcion: 'Prórroga' },
  { codigo: 3, descripcion: 'Reenvío' },
  { codigo: 4, descripcion: 'Cambio' },
]

export const TIPO_SUJETO = [
  { tipo: 'I',   meses: 2, descripcion: 'Tipo I — Reporte cada 2 meses' },
  { tipo: 'II',  meses: 3, descripcion: 'Tipo II — Reporte cada 3 meses' },
  { tipo: 'III', meses: 4, descripcion: 'Tipo III — Reporte cada 4 meses' },
]

// Tipos de Ingreso por ClaseDato
export const TIPOS_INGRESO = [
  { codigo: 0,  descripcion: 'No aplica',                         clases: [0,1,2,3,4,5,6,7,8,9,10] },
  { codigo: 1,  descripcion: 'Ventas',                             clases: [1] },
  { codigo: 2,  descripcion: 'Exportación',                        clases: [1] },
  { codigo: 3,  descripcion: 'Venta de artículos',                 clases: [2] },
  { codigo: 4,  descripcion: 'Venta de joyas',                     clases: [2] },
  { codigo: 5,  descripcion: 'Interés',                            clases: [2] },
  { codigo: 6,  descripcion: 'Cancelación de contrato de empeño',  clases: [2] },
  { codigo: 7,  descripcion: 'Abono',                              clases: [2] },
  { codigo: 8,  descripcion: 'Educación',                          clases: [3] },
  { codigo: 9,  descripcion: 'Vivienda',                           clases: [3] },
  { codigo: 10, descripcion: 'Emprendedurismo',                    clases: [3] },
  { codigo: 11, descripcion: 'Salud',                              clases: [3] },
  { codigo: 12, descripcion: 'Religioso',                          clases: [3] },
  { codigo: 13, descripcion: 'Político',                           clases: [3] },
  { codigo: 14, descripcion: 'Deportes',                           clases: [3] },
  { codigo: 15, descripcion: 'Desarrollo urbano',                  clases: [3] },
  { codigo: 16, descripcion: 'Alimentación',                       clases: [3] },
  { codigo: 22, descripcion: 'Venta de fichas',                    clases: [4] },
  { codigo: 23, descripcion: 'Ingreso en máquinas (efectivo)',     clases: [4] },
  { codigo: 24, descripcion: 'Monto administrado',                 clases: [5] },
  { codigo: 25, descripcion: 'Comisiones por administración',      clases: [5] },
  { codigo: 26, descripcion: 'Inversión',                          clases: [5] },
  { codigo: 27, descripcion: 'Remesa recibida',                    clases: [6] },
  { codigo: 28, descripcion: 'Op. sistemática y sustancial recibida', clases: [6] },
  { codigo: 29, descripcion: 'Venta',                              clases: [7] },
  { codigo: 30, descripcion: 'Contrato de administración',         clases: [7] },
  { codigo: 31, descripcion: 'Ingreso por emisión',                clases: [7] },
  { codigo: 32, descripcion: 'Pago de contado cliente',            clases: [7] },
  { codigo: 33, descripcion: 'Pago mínimo cliente',                clases: [7] },
  { codigo: 34, descripcion: 'Ingreso por procesamiento',          clases: [7] },
  { codigo: 35, descripcion: 'Comisión por servicios',             clases: [7] },
  { codigo: 36, descripcion: 'Pago otro monto',                    clases: [7] },
  { codigo: 37, descripcion: 'Pago intereses',                     clases: [8] },
  { codigo: 38, descripcion: 'Pago cuota',                         clases: [8] },
  { codigo: 39, descripcion: 'Pago de principal',                  clases: [8] },
  { codigo: 40, descripcion: 'Cancelación anticipada',             clases: [8] },
  { codigo: 41, descripcion: 'Abono extraordinario',               clases: [8] },
  { codigo: 42, descripcion: 'Gastos de formalización',            clases: [8] },
  { codigo: 43, descripcion: 'Comisión de formalización',          clases: [8] },
  { codigo: 44, descripcion: 'Fideicomiso',                        clases: [9] },
  { codigo: 45, descripcion: 'Aporte inicial al fideicomiso',      clases: [9] },
  { codigo: 46, descripcion: 'Aporte extraordinario',              clases: [9] },
  { codigo: 47, descripcion: 'Comisiones',                         clases: [9] },
  { codigo: 48, descripcion: 'Venta',                              clases: [10] },
  { codigo: 49, descripcion: 'Comisión',                           clases: [10] },
  { codigo: 50, descripcion: 'Pago de prima',                      clases: [10] },
  { codigo: 51, descripcion: 'Pago parcial',                       clases: [10] },
  { codigo: 52, descripcion: 'Pago total',                         clases: [10] },
  { codigo: 56, descripcion: 'Prima',                              clases: [8] },
]

// Tipos de Salida por ClaseDato
export const TIPOS_SALIDA = [
  { codigo: 0,  descripcion: 'No aplica',                               clases: [0,1,2,3,4,5,6,7,8,9,10] },
  { codigo: 1,  descripcion: 'Importación',                             clases: [1] },
  { codigo: 2,  descripcion: 'Compra de insumos',                       clases: [1] },
  { codigo: 3,  descripcion: 'Compra de artículos',                     clases: [2] },
  { codigo: 4,  descripcion: 'Compra de joyas',                         clases: [2] },
  { codigo: 5,  descripcion: 'Educación',                               clases: [3] },
  { codigo: 6,  descripcion: 'Vivienda',                                clases: [3] },
  { codigo: 7,  descripcion: 'Emprendedurismo',                         clases: [3] },
  { codigo: 8,  descripcion: 'Salud',                                   clases: [3] },
  { codigo: 9,  descripcion: 'Religioso',                               clases: [3] },
  { codigo: 10, descripcion: 'Político',                                clases: [3] },
  { codigo: 11, descripcion: 'Deportes',                                clases: [3] },
  { codigo: 12, descripcion: 'Desarrollo urbano',                       clases: [3] },
  { codigo: 13, descripcion: 'Alimentación',                            clases: [3] },
  { codigo: 14, descripcion: 'Ambiental',                               clases: [3] },
  { codigo: 15, descripcion: 'Vida silvestre',                          clases: [3] },
  { codigo: 16, descripcion: 'Niñez y adolescencia',                    clases: [3] },
  { codigo: 17, descripcion: 'Farmacodependencias',                     clases: [3] },
  { codigo: 18, descripcion: 'Adulto mayor',                            clases: [3] },
  { codigo: 19, descripcion: 'Canje de fichas',                         clases: [4] },
  { codigo: 20, descripcion: 'Pago Premio Máquinas',                    clases: [4] },
  { codigo: 21, descripcion: 'Pago Premio Mesas',                       clases: [4] },
  { codigo: 22, descripcion: 'Devolución de fondos',                    clases: [5] },
  { codigo: 23, descripcion: 'Inversión',                               clases: [5] },
  { codigo: 24, descripcion: 'Liquidación de contrato parcial',         clases: [5] },
  { codigo: 25, descripcion: 'Liquidación de contrato total',           clases: [5] },
  { codigo: 26, descripcion: 'Remesa pagada exterior',                  clases: [6] },
  { codigo: 27, descripcion: 'Remesa pagada local',                     clases: [6] },
  { codigo: 28, descripcion: 'Op. sistemática y sustancial pagada ext', clases: [6] },
  { codigo: 29, descripcion: 'Op. sistemática y sustancial pagada loc', clases: [6] },
  { codigo: 30, descripcion: 'Adelanto efectivo',                       clases: [7] },
  { codigo: 31, descripcion: 'Retiro cajero automático',                clases: [7] },
  { codigo: 32, descripcion: 'Devolución saldo a favor',                clases: [7] },
  { codigo: 33, descripcion: 'Desembolso crédito',                      clases: [8] },
  { codigo: 34, descripcion: 'Reintegro por saldo a favor del cliente', clases: [8] },
  { codigo: 35, descripcion: 'Retiros',                                 clases: [9] },
  { codigo: 36, descripcion: 'Cancelación o liquidación fideicomiso',   clases: [9] },
  { codigo: 37, descripcion: 'Reintegro o devolución',                  clases: [9] },
  { codigo: 38, descripcion: 'Compras',                                 clases: [10] },
  { codigo: 39, descripcion: 'Pago prima',                              clases: [10] },
  { codigo: 40, descripcion: 'Pago parcial',                            clases: [10] },
  { codigo: 41, descripcion: 'Pago comisión',                           clases: [10] },
  { codigo: 42, descripcion: 'Pago total',                              clases: [10] },
  { codigo: 43, descripcion: 'Canje de tiquetes',                       clases: [4] },
  { codigo: 44, descripcion: 'Empeño',                                  clases: [2] },
]

export const MOTIVO_CREDITO = [
  { codigo: 0, descripcion: 'N/A' },
  { codigo: 1, descripcion: 'Crédito personal' },
  { codigo: 2, descripcion: 'Crédito vivienda' },
  { codigo: 3, descripcion: 'Crédito consumo' },
  { codigo: 4, descripcion: 'Crédito vehículo' },
  { codigo: 5, descripcion: 'Crédito salud' },
  { codigo: 6, descripcion: 'Otros' },
  { codigo: 7, descripcion: 'Crédito empresarial' },
  { codigo: 8, descripcion: 'Servicios exequiales' },
]

// Obtener tipos de ingreso filtrados por clase de actividad (0-indexed, clase_dato - 40)
// Etiqueta para "clientes" según actividad del sujeto obligado
// clase_dato 42 = Organizaciones Sin Fines de Lucro → donantes/beneficiarios
export function getEtiquetaCliente(tenant, plural = true) {
  if (!tenant) return plural ? 'clientes' : 'cliente'
  const clase = Number(tenant.clase_dato)
  if (clase === 42) return plural ? 'donantes / beneficiarios' : 'donante / beneficiario'
  return plural ? 'clientes' : 'cliente'
}

export function getTiposIngreso(claseDato) {
  const claseIdx = claseDato - 39 // convierte a índice 1-10
  return TIPOS_INGRESO.filter(t => t.clases.includes(0) || t.clases.includes(claseIdx))
}

export function getTiposSalida(claseDato) {
  const claseIdx = claseDato - 39
  return TIPOS_SALIDA.filter(t => t.clases.includes(0) || t.clases.includes(claseIdx))
}
