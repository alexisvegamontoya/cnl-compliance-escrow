/**
 * Script de respaldo local — CNL Compliance
 * ==========================================
 * Exporta toda la información de Supabase a archivos Excel
 * en la carpeta de respaldos del usuario.
 *
 * USO MANUAL:
 *   node scripts/backup-local.js
 *
 * PROGRAMAR CON WINDOWS TASK SCHEDULER (respaldo automático):
 *   1. Abrir "Programador de tareas" en Windows
 *   2. Crear tarea básica → nombre: "Respaldo CNL Compliance"
 *   3. Desencadenador: Diariamente a las 22:00
 *   4. Acción: Iniciar un programa
 *      Programa: node
 *      Argumentos: "C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app\scripts\backup-local.js"
 *      Iniciar en: C:\Users\alexi\OneDrive\Cumplimiento\claude\Desarrollo de la app\cnl-compliance-app
 *
 * REQUISITOS:
 *   npm install xlsx node-fetch (solo la primera vez)
 *   La variable SUPABASE_SERVICE_ROLE_KEY debe estar en .env.local
 */

import { createWriteStream, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Leer .env.local si existe
function loadEnv() {
  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const [key, ...vals] = line.split('=')
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim()
  }
}
loadEnv()

const SUPABASE_URL  = 'https://akczzwsfggzcfqyytyho.supabase.co'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY no encontrada en .env.local')
  console.error('   Agrega: SUPABASE_SERVICE_ROLE_KEY=tu_clave en el archivo .env.local')
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
/** Errores acumulados: si hay alguno, el respaldo termina con código != 0. */
const fallos = []

/**
 * Trae la tabla completa, paginando.
 *
 * PostgREST corta en `max_rows` (1000 en este proyecto) y NO avisa: devuelve
 * 200 con las primeras mil filas. Pedir `limit=100000` no lo evita. Sin
 * paginar, el respaldo de transacciones guardaba 1000 de 3320 y el de
 * listas_sanciones 1000 de 20738, con cara de haber salido bien.
 */
async function fetchAll(table, filter = '') {
  const PAGINA = 1000
  const filas = []

  for (let desde = 0; ; desde += PAGINA) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filter}`
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${desde}-${desde + PAGINA - 1}`,
        'Range-Unit': 'items',
      },
    })

    if (!res.ok && res.status !== 206) {
      // Antes esto solo avisaba y devolvía []. La tabla quedaba registrada como
      // "(vacía)" y el respaldo terminaba en éxito: así estuvo semanas la tabla
      // ros_reportes, que ni siquiera existe (se llama reportes_ros).
      const detalle = await res.text().catch(() => '')
      fallos.push(`${table}: HTTP ${res.status} ${detalle.slice(0, 120)}`)
      console.error(`  ❌ No se pudo leer ${table}: ${res.status}`)
      return []
    }

    const lote = await res.json()
    filas.push(...lote)
    if (lote.length < PAGINA) return filas

    if (desde > 5_000_000) {          // red de seguridad ante un bucle infinito
      fallos.push(`${table}: se superó el máximo de páginas`)
      return filas
    }
  }
}

/**
 * Tablas a respaldar, leídas del propio esquema de la API.
 *
 * Se descubren en cada corrida en vez de mantenerse a mano: una lista fija se
 * desactualiza en silencio cuando se agrega una tabla, y nadie lo nota hasta
 * que hace falta el respaldo.
 */
async function descubrirTablas() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`No se pudo leer el esquema de la API: ${res.status}`)
  const esquema = await res.json()

  return Object.keys(esquema.definitions || {})
    .filter((t) => !EXCLUIDAS.has(t))
    .filter((t) => !/^(v_|vw_)/.test(t))   // las vistas se derivan de las tablas
    .sort()
}

/**
 * Fuera del respaldo por tamaño, y porque se regeneran desde su fuente
 * original: el padrón de la SUGEF (8,5 millones de filas, no entra en Excel) y
 * las listas de sanciones, que repone la función sync-listas.
 */
const EXCLUIDAS = new Set(['padron_sugef'])

function hoy() {
  return new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
  // Importar xlsx dinámicamente
  const XLSX = await import('xlsx').then(m => m.default || m)

  const fecha = hoy()
  const carpeta = join(ROOT, '..', 'respaldos', `respaldo_${fecha}`)
  mkdirSync(carpeta, { recursive: true })

  console.log(`\n🔄 Iniciando respaldo CNL Compliance — ${fecha}`)
  console.log(`📁 Destino: ${carpeta}\n`)

  // Nombres legibles para las hojas del Excel. Las que no estén acá usan el
  // nombre de la tabla; la lista es cosmética y no decide qué se respalda.
  const HOJAS = {
    tenants: 'Sujetos Obligados',
    transacciones: 'Transacciones',
    clientes: 'Clientes',
    clientes_personas_relacionadas: 'Personas Relacionadas',
    periodos_declarados: 'Periodos Declarados',
    user_profiles: 'Usuarios',
    user_tenant_memberships: 'Membresías',
    user_app_access: 'Acceso por App',
    reportes_ros: 'ROS',
    reportes_ros_archivo: 'ROS Archivados',
    denuncias: 'Denuncias',
    denuncias_archivo: 'Denuncias Archivadas',
    audit_log: 'Auditoría',
    expedientes_dd: 'Debida Diligencia',
    calificaciones_riesgo: 'Calificaciones Riesgo',
    catalogo_documentos: 'Catálogo Documental',
    compliance_seguimiento: 'Seguimiento',
    informes_generados: 'Informes',
    consultas_listas: 'Consultas Listas',
    listas_sanciones: 'Listas Sanciones',
    listas_metadata: 'Listas Metadata',
    normativa: 'Normativa',
    alertas_noticias: 'Alertas Noticias',
    feed_items: 'Feed',
    notificaciones: 'Notificaciones',
    cuestionarios: 'Cuestionarios',
    respuestas_cuestionario: 'Respuestas Cuestionario',
    periodos_reporte: 'Periodos Reporte',
    seguimiento_mensual: 'Seguimiento Mensual',
    sync_listas_log: 'Log Sync Listas',
  }

  const tablas = (await descubrirTablas()).map((nombre) => ({
    nombre,
    hoja: HOJAS[nombre] || nombre,
  }))
  console.log(`  ${tablas.length} tablas descubiertas en la API\n`)

  // 1. Un Excel completo con todas las tablas, y un JSON por tabla.
  //    El Excel es para leerlo; el JSON es el que sirve para restaurar, porque
  //    conserva los tipos y no recorta filas ni columnas.
  const carpetaJson = join(carpeta, 'json')
  mkdirSync(carpetaJson, { recursive: true })

  const wb = XLSX.utils.book_new()
  let totalRegistros = 0
  const conteos = {}

  for (const t of tablas) {
    process.stdout.write(`  ⏳ Leyendo ${t.nombre}…`)
    const data = await fetchAll(t.nombre)
    conteos[t.nombre] = data.length
    writeFileSync(join(carpetaJson, `${t.nombre}.json`), JSON.stringify(data, null, 1))
    if (data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, t.hoja.substring(0, 31))
      totalRegistros += data.length
      console.log(` ✓ ${data.length} registros`)
    } else {
      console.log(' (sin filas)')
    }
  }

  // Hoja de metadatos
  const metaWs = XLSX.utils.json_to_sheet([{
    'Fecha del respaldo':  new Date().toLocaleString('es-CR'),
    'Total de registros':  totalRegistros,
    'Tablas respaldadas':  tablas.map(t => t.nombre).join(', '),
    'URL Supabase':        SUPABASE_URL,
  }])
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info Respaldo')

  const archivoCompleto = join(carpeta, `CNL_Compliance_Completo_${fecha}.xlsx`)
  XLSX.writeFile(wb, archivoCompleto)
  console.log(`\n✅ Excel completo: ${archivoCompleto}`)

  // 2. Un Excel por cada tenant (sujeto obligado)
  const tenants = await fetchAll('tenants')
  if (tenants.length > 0) {
    const carpetaTenants = join(carpeta, 'por_sujeto_obligado')
    mkdirSync(carpetaTenants, { recursive: true })

    for (const tenant of tenants) {
      const wbT = XLSX.utils.book_new()
      const nombreSeguro = tenant.nombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)

      XLSX.utils.book_append_sheet(wbT, XLSX.utils.json_to_sheet([tenant]), 'Info')

      const txns = await fetchAll('transacciones', `&tenant_id=eq.${tenant.id}`)
      if (txns.length) XLSX.utils.book_append_sheet(wbT, XLSX.utils.json_to_sheet(txns), 'Transacciones')

      const clis = await fetchAll('clientes', `&tenant_id=eq.${tenant.id}`)
      if (clis.length) XLSX.utils.book_append_sheet(wbT, XLSX.utils.json_to_sheet(clis), 'Clientes')

      const pers = await fetchAll('periodos_declarados', `&tenant_id=eq.${tenant.id}`)
      if (pers.length) XLSX.utils.book_append_sheet(wbT, XLSX.utils.json_to_sheet(pers), 'Periodos')

      const archivo = join(carpetaTenants, `${nombreSeguro}_${fecha}.xlsx`)
      XLSX.writeFile(wbT, archivo)
      console.log(`  📄 ${tenant.nombre}: ${txns.length} txns, ${clis.length} clientes`)
    }
  }

  // Manifiesto: deja por escrito qué se respaldó, para poder comprobarlo
  // después sin abrir los archivos uno por uno.
  writeFileSync(join(carpeta, 'manifiesto.json'), JSON.stringify({
    fecha: new Date().toISOString(),
    proyecto: SUPABASE_URL,
    tablas: conteos,
    total_registros: totalRegistros,
    excluidas: [...EXCLUIDAS],
    fallos,
  }, null, 1))

  if (fallos.length) {
    console.error(`\n❌ Respaldo INCOMPLETO — ${fallos.length} tabla(s) fallaron:`)
    fallos.forEach((f) => console.error(`   · ${f}`))
    console.error(`📁 Lo que sí se pudo guardar quedó en: ${carpeta}\n`)
    process.exit(1)
  }

  console.log(`\n✅ Respaldo completado — ${totalRegistros} registros en ${tablas.length} tablas`)
  console.log(`📁 Archivos guardados en: ${carpeta}\n`)
}

main().catch(err => {
  console.error('❌ Error en el respaldo:', err.message)
  process.exit(1)
})
