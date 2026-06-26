/**
 * Script de carga del Padrón SUGEF y Lista PEP ICD
 * ====================================================
 * Ejecutar DESDE la carpeta del proyecto:
 *   node scripts/upload-padron.js juridicas
 *   node scripts/upload-padron.js fisicas
 *   node scripts/upload-padron.js pep
 *   node scripts/upload-padron.js all
 *
 * Requiere:
 *   npm install @supabase/supabase-js csv-parse xlrd (ya instalados en el proyecto)
 *   Los archivos CSV generados en la carpeta scripts/data/
 */

import { createClient } from '@supabase/supabase-js'
import { createReadStream, existsSync } from 'fs'
import { parse } from 'csv-parse'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Configuración ──────────────────────────────────────────────────────────────
// IMPORTANTE: Reemplazar SERVICE_ROLE_KEY (solo para scripts internos, nunca en frontend)
const SUPABASE_URL      = 'https://akczzwsfggzcfqyytyho.supabase.co'
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY3p6d3NmZ2d6Y2ZxeXl0eWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMwNzczMCwiZXhwIjoyMDk3ODgzNzMwfQ.sIbLzj6OYKRRQGaorNMoTjaBC4ypoZyKqIq22GVimUg'  // Dashboard → Settings → API

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const BATCH_SIZE = 1000

// ── Helper: insertar en lotes ──────────────────────────────────────────────────
async function batchInsert(tabla, rows, conflictCol = 'identificacion') {
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from(tabla)
      .upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: false })
    if (error) {
      console.error(`Error en lote ${i}-${i+BATCH_SIZE}:`, error.message)
    } else {
      total += chunk.length
    }
    if (total % 10000 === 0) process.stdout.write(`\r  Insertados: ${total.toLocaleString()}`)
  }
  console.log(`\n  Total insertados: ${total.toLocaleString()}`)
  return total
}

// ── Cargar CSV del Padrón ──────────────────────────────────────────────────────
async function cargarPadron(csvPath, tipo) {
  if (!existsSync(csvPath)) {
    console.error(`❌ Archivo no encontrado: ${csvPath}`)
    console.log(`   Ejecute primero: python scripts/extract-padron.py`)
    return
  }

  console.log(`\n📂 Cargando padrón ${tipo} desde: ${csvPath}`)
  const rows = []

  await new Promise((resolve, reject) => {
    createReadStream(csvPath, { encoding: 'utf-8' })
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row) => {
        if (row.identificacion && row.nombre_completo) {
          rows.push({
            identificacion: row.identificacion.trim(),
            nombre_completo: row.nombre_completo.trim().toUpperCase(),
            tipo: row.tipo || tipo[0].toUpperCase(),
            pais: row.pais || 'CR',
          })
        }
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`  Registros leídos: ${rows.length.toLocaleString()}`)
  await batchInsert('padron_sugef', rows)
}

// ── Cargar Lista PEP ICD ───────────────────────────────────────────────────────
async function cargarPEP() {
  const csvPath = path.join(__dirname, 'data', 'pep_icd.csv')
  if (!existsSync(csvPath)) {
    console.error(`❌ Archivo no encontrado: ${csvPath}`)
    console.log(`   Ejecute primero: python scripts/extract-pep.py`)
    return
  }

  console.log(`\n📂 Cargando lista PEP ICD desde: ${csvPath}`)
  const rows = []

  await new Promise((resolve, reject) => {
    createReadStream(csvPath, { encoding: 'utf-8' })
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row) => {
        if (!row.nombre || !row.identificacion) return
        rows.push({
          fuente:           'ICD_CR_PEP',
          tipo_lista:       'pep',
          nombre_completo:  row.nombre.trim().toUpperCase(),
          aliases:          [],
          tipo_entidad:     'individual',
          programa:         row.puesto || '',
          motivo:           row.institucion ? `${row.puesto} — ${row.institucion}` : row.puesto,
          nivel_riesgo:     'alto',
          referencia_id:    `ICD_PEP_${row.identificacion.trim()}`,
          activo:           row.es_pep_vigente?.toLowerCase() === 'sí' || row.es_pep_vigente?.toLowerCase() === 'si',
          datos_originales: JSON.stringify(row),
        })
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`  Registros PEP leídos: ${rows.length.toLocaleString()}`)

  // Deduplicar por referencia_id (puede haber cédulas repetidas en el XLS)
  const unique = Object.values(
    rows.reduce((acc, r) => { acc[r.referencia_id] = r; return acc }, {})
  )
  console.log(`  Registros únicos: ${unique.length.toLocaleString()}`)
  await batchInsert('listas_sanciones', unique, 'fuente,referencia_id')

  // Registrar en metadata
  await supabase.from('listas_metadata').upsert({
    fuente: 'ICD_CR_PEP',
    nombre_display: 'ICD Costa Rica — Lista PEP',
    descripcion: 'Personas Expuestas Políticamente — Instituto Costarricense sobre Drogas',
    url_fuente: 'https://www.icd.go.cr',
    ultima_sync: new Date().toISOString(),
    total_registros: rows.length,
    activa: true,
  }, { onConflict: 'fuente' })

  // Crear recordatorio anual en notificaciones (para superadmins)
  const proximoAno = new Date()
  proximoAno.setFullYear(proximoAno.getFullYear() + 1)
  console.log(`\n  ✅ Recordatorio de actualización programado para: ${proximoAno.toLocaleDateString('es-CR')}`)
  console.log(`     (Agregue esta fecha al calendario del Oficial de Cumplimiento)`)
}

// ── Main ───────────────────────────────────────────────────────────────────────
const arg = process.argv[2] || 'all'

if (SERVICE_ROLE_KEY === 'PEGAR_AQUI_SERVICE_ROLE_KEY') {
  console.error('❌ Debe reemplazar SERVICE_ROLE_KEY con la clave real.')
  console.error('   Supabase Dashboard → Settings → API → service_role key')
  process.exit(1)
}

console.log('🚀 CNL Compliance — Carga de Padrón SUGEF + Lista PEP ICD')
console.log('='.repeat(55))

const dataDir = path.join(__dirname, 'data')

if (arg === 'juridicas' || arg === 'all') {
  await cargarPadron(path.join(dataDir, 'padron_juridicas.csv'), 'J')
}

if (arg === 'fisicas' || arg === 'all') {
  await cargarPadron(path.join(dataDir, 'padron_fisicas.csv'), 'F')
}

if (arg === 'pep' || arg === 'all') {
  await cargarPEP()
}

console.log('\n✅ Carga completada.')
