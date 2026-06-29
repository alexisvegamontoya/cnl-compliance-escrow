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

import { createWriteStream, mkdirSync, existsSync } from 'fs'
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
async function fetchAll(table, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filter}&limit=100000`
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })
  if (!res.ok) {
    console.warn(`  ⚠ No se pudo leer ${table}: ${res.status}`)
    return []
  }
  return await res.json()
}

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

  // Tablas a respaldar
  const tablas = [
    { nombre: 'tenants',               hoja: 'Sujetos Obligados' },
    { nombre: 'transacciones',         hoja: 'Transacciones' },
    { nombre: 'clientes',              hoja: 'Clientes' },
    { nombre: 'periodos_declarados',   hoja: 'Periodos Declarados' },
    { nombre: 'user_profiles',         hoja: 'Usuarios' },
    { nombre: 'user_tenant_memberships', hoja: 'Membresías' },
    { nombre: 'ros_reportes',          hoja: 'ROS' },
    { nombre: 'denuncias',             hoja: 'Denuncias' },
    { nombre: 'audit_log',             hoja: 'Auditoría' },
  ]

  // 1. Un Excel completo con todas las tablas
  const wb = XLSX.utils.book_new()
  let totalRegistros = 0

  for (const t of tablas) {
    process.stdout.write(`  ⏳ Leyendo ${t.nombre}…`)
    const data = await fetchAll(t.nombre)
    if (data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, t.hoja.substring(0, 31))
      totalRegistros += data.length
      console.log(` ✓ ${data.length} registros`)
    } else {
      console.log(' (vacía)')
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

  console.log(`\n✅ Respaldo completado — ${totalRegistros} registros en total`)
  console.log(`📁 Archivos guardados en: ${carpeta}\n`)
}

main().catch(err => {
  console.error('❌ Error en el respaldo:', err.message)
  process.exit(1)
})
