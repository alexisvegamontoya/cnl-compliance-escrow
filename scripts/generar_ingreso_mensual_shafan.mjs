/**
 * generar_ingreso_mensual_shafan.mjs
 *
 * Consulta Supabase, calcula el promedio mensual de transacciones
 * del último año por cliente del tenant SHAFAN, y genera un Excel
 * listo para subir como carga masiva de clientes.
 *
 * Ejecutar desde PowerShell en la raíz del proyecto:
 *   node scripts/generar_ingreso_mensual_shafan.mjs
 *
 * Requiere: Node ≥18  (usa fetch nativo)
 * Usa: xlsx (ya instalada en el proyecto)
 */

import * as XLSX from 'xlsx'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ─── Credenciales ─────────────────────────────────────────────────────────────
// Lee automáticamente .env.local y .env del proyecto
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir   = path.resolve(__dirname, '..')

function leerEnv(nombre) {
  for (const archivo of ['.env.local', '.env']) {
    try {
      const contenido = readFileSync(path.join(rootDir, archivo), 'utf-8')
      const match = contenido.match(new RegExp(`^${nombre}=(.+)$`, 'm'))
      if (match) return match[1].trim()
    } catch {}
  }
  return null
}

const SUPABASE_URL      = leerEnv('VITE_SUPABASE_URL')
const SERVICE_ROLE_KEY  = leerEnv('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ No se encontraron VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env / .env.local')
  process.exit(1)
}

const HEADERS = {
  'apikey':        SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type':  'application/json',
}

async function get(tabla, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?${params}`
  const res  = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Error ${res.status} en ${tabla}: ${await res.text()}`)
  return res.json()
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 Buscando tenant SHAFAN…')

  // 1. Tenant
  const tenants = await get('tenants', 'nombre=ilike.*SHAFAN*&select=id,nombre,cedula_juridica,actividad_apnfd')
  if (!tenants.length) {
    console.error('❌ No se encontró ningún tenant con nombre SHAFAN')
    process.exit(1)
  }
  const tenant = tenants[0]
  console.log(`✅ Tenant: ${tenant.nombre} (${tenant.id})`)

  // 2. Clientes
  console.log('👥 Cargando clientes…')
  const clientes = await get('clientes',
    `tenant_id=eq.${tenant.id}&activo=eq.true&select=id,numero_identificacion,tipo_identificacion,nombre_cliente,primer_apellido,segundo_apellido,nombre_empresa,nacionalidad,pais_ubicacion,actividad_economica,telefono,correo_electronico,fecha_vinculacion,pep,calificacion_riesgo,ingreso_mensual_est,notas&limit=5000`
  )
  console.log(`   → ${clientes.length} clientes encontrados`)

  // 3. Transacciones del último año
  const hace12Meses = new Date()
  hace12Meses.setFullYear(hace12Meses.getFullYear() - 1)
  const periodoDesde = hace12Meses.toISOString().substring(0, 7) + '-01'

  console.log(`📊 Cargando transacciones desde ${periodoDesde}…`)
  const txns = await get('transacciones',
    `tenant_id=eq.${tenant.id}&periodo=gte.${periodoDesde}&select=numero_identificacion,monto_movimiento,periodo&limit=50000`
  )
  console.log(`   → ${txns.length} transacciones encontradas`)

  // 4. Calcular promedio mensual por cliente
  // Estructura: { numero_identificacion: { YYYY-MM: total } }
  const porClienteMes = {}
  txns.forEach(t => {
    const id  = t.numero_identificacion
    const mes = String(t.periodo).substring(0, 7)   // YYYY-MM
    const monto = Number(t.monto_movimiento) || 0
    if (!porClienteMes[id]) porClienteMes[id] = {}
    porClienteMes[id][mes] = (porClienteMes[id][mes] || 0) + monto
  })

  // Promedio = suma de totales mensuales / número de meses con actividad
  // Redondear al siguiente múltiplo de 1000 para dar un margen razonable
  function calcularPromedio(id) {
    const meses = porClienteMes[id]
    if (!meses) return null
    const valores = Object.values(meses)
    const promedio = valores.reduce((s, v) => s + v, 0) / valores.length
    // Redondear al siguiente múltiplo de 1000 hacia arriba (+10% de margen)
    const conMargen = promedio * 1.10
    return Math.ceil(conMargen / 1000) * 1000
  }

  // 5. Construir filas para el Excel
  console.log('📝 Calculando promedios y construyendo Excel…')

  const filas = clientes.map(c => {
    const promEstimado = calcularPromedio(c.numero_identificacion)
    const mesesConActividad = porClienteMes[c.numero_identificacion]
      ? Object.keys(porClienteMes[c.numero_identificacion]).length
      : 0
    const totalTransado = porClienteMes[c.numero_identificacion]
      ? Object.values(porClienteMes[c.numero_identificacion]).reduce((s, v) => s + v, 0)
      : 0

    return {
      numero_identificacion: c.numero_identificacion,
      tipo_identificacion:   c.tipo_identificacion,
      nombre_cliente:        c.nombre_cliente || '',
      primer_apellido:       c.primer_apellido || '',
      segundo_apellido:      c.segundo_apellido || '',
      nombre_empresa:        c.nombre_empresa || '',
      nacionalidad:          c.nacionalidad || '',
      pais_ubicacion:        c.pais_ubicacion || '',
      actividad_economica:   c.actividad_economica || '',
      telefono:              c.telefono || '',
      correo_electronico:    c.correo_electronico || '',
      fecha_vinculacion:     c.fecha_vinculacion || '',
      pep:                   c.pep ? 'SI' : 'NO',
      calificacion_riesgo:   c.calificacion_riesgo || '',
      ingreso_mensual_est:   promEstimado ?? c.ingreso_mensual_est ?? '',
      notas:                 c.notas || '',
      // Columnas de análisis (solo info, no se suben)
      _meses_con_actividad:  mesesConActividad,
      _total_transado_año:   Math.round(totalTransado),
      _promedio_sin_margen:  mesesConActividad > 0
        ? Math.round(totalTransado / mesesConActividad)
        : 0,
    }
  })

  // Ordenar: primero los que tienen actividad, luego sin transacciones
  filas.sort((a, b) => (b._total_transado_año - a._total_transado_año))

  // 6. Generar Excel con dos hojas
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Plantilla lista para subir ─────────────────────────────────────
  const headersCarga = [
    'numero_identificacion','tipo_identificacion','nombre_cliente','primer_apellido',
    'segundo_apellido','nombre_empresa','nacionalidad','pais_ubicacion',
    'actividad_economica','telefono','correo_electronico','fecha_vinculacion',
    'pep','calificacion_riesgo','ingreso_mensual_est','notas'
  ]

  const instrucciones = [
    ['PLANTILLA ACTUALIZADA — INGRESO MENSUAL ESTIMADO — CNL Compliance App'],
    ['Generada automáticamente. ingreso_mensual_est = promedio mensual del último año +10% de margen, redondeado al millar.'],
    ['Tenant: ' + tenant.nombre + '  |  Período analizado: últimos 12 meses'],
    [''],
    ['INSTRUCCIONES: Revise la columna ingreso_mensual_est y ajuste si considera necesario. Luego suba este archivo en Clientes → Carga masiva.'],
    [''],
  ]

  const wsCargaData = [
    ...instrucciones,
    headersCarga,
    ...filas.map(f => headersCarga.map(h => f[h] ?? '')),
  ]
  const wsCarga = XLSX.utils.aoa_to_sheet(wsCargaData)
  wsCarga['!cols'] = headersCarga.map((h) => ({
    wch: h === 'nombre_empresa' || h === 'actividad_economica' ? 32 : 20
  }))

  // Estilo header (fila 7 = índice 6)
  const hrIdx = instrucciones.length
  for (let c = 0; c < headersCarga.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: hrIdx, c })
    if (!wsCarga[ref]) wsCarga[ref] = {}
    wsCarga[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: '0e0e6e' } } }
  }

  XLSX.utils.book_append_sheet(wb, wsCarga, 'Plantilla_Carga')

  // ── Hoja 2: Análisis completo con datos de respaldo ────────────────────────
  const headersAnalisis = [
    'numero_identificacion','nombre_empresa_o_cliente',
    'tipo_identificacion','calificacion_riesgo',
    'meses_con_actividad','total_transado_año_USD',
    'promedio_mensual_bruto_USD','ingreso_mensual_est_nuevo_USD',
    'ingreso_mensual_est_anterior_USD','variacion_vs_anterior'
  ]

  const filasAnalisis = filas.map(f => {
    const nombre = f.nombre_empresa || `${f.nombre_cliente} ${f.primer_apellido}`.trim()
    const anterior = clientes.find(c => c.numero_identificacion === f.numero_identificacion)?.ingreso_mensual_est
    const nuevo = f.ingreso_mensual_est
    const variacion = anterior && nuevo && Number(anterior) > 0
      ? `${((nuevo - Number(anterior)) / Number(anterior) * 100).toFixed(0)}%`
      : nuevo ? 'Nuevo' : 'Sin actividad'
    return [
      f.numero_identificacion,
      nombre,
      f.tipo_identificacion,
      f.calificacion_riesgo || '—',
      f._meses_con_actividad,
      f._total_transado_año,
      f._promedio_sin_margen,
      nuevo || '—',
      anterior ? Number(anterior) : '—',
      variacion,
    ]
  })

  const wsAnalisisData = [headersAnalisis, ...filasAnalisis]
  const wsAnalisis = XLSX.utils.aoa_to_sheet(wsAnalisisData)
  wsAnalisis['!cols'] = [20, 35, 10, 12, 12, 22, 22, 22, 22, 15].map(w => ({ wch: w }))

  XLSX.utils.book_append_sheet(wb, wsAnalisis, 'Análisis_Promedios')

  // 7. Guardar
  const outputPath = path.join(rootDir, 'scripts', 'Clientes_IngresoMensual_SHAFAN.xlsx')
  XLSX.writeFile(wb, outputPath)

  // 8. Resumen en consola
  const conActividad = filas.filter(f => f._meses_con_actividad > 0).length
  const sinActividad = filas.length - conActividad

  console.log('\n✅ Excel generado: scripts/Clientes_IngresoMensual_SHAFAN.xlsx')
  console.log('─'.repeat(60))
  console.log(`   Clientes totales:          ${filas.length}`)
  console.log(`   Con actividad últimos 12m: ${conActividad}`)
  console.log(`   Sin transacciones en año:  ${sinActividad}`)
  console.log('\n   Top 10 por volumen anual:')
  filas.slice(0, 10).forEach((f, i) => {
    const nombre = (f.nombre_empresa || `${f.nombre_cliente} ${f.primer_apellido}`).substring(0, 35)
    console.log(`   ${String(i+1).padStart(2)}. ${nombre.padEnd(36)} Prom/mes: USD ${String(f.ingreso_mensual_est || '—').padStart(10)}  (${f._meses_con_actividad} meses)`)
  })
  console.log('\n   ⬆ Suba la hoja "Plantilla_Carga" en Clientes → Carga masiva de clientes')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
