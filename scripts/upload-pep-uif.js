/**
 * Carga Lista PEP UIF/ICD 2026 → Supabase
 * ==========================================
 * Ejecutar desde la carpeta del proyecto:
 *   node scripts/upload-pep-uif.js
 *
 * No requiere Python ni pip. Lee el JSON pre-generado.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL     = 'https://akczzwsfggzcfqyytyho.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY3p6d3NmZ2d6Y2ZxeXl0eWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMwNzczMCwiZXhwIjoyMDk3ODgzNzMwfQ.sIbLzj6OYKRRQGaorNMoTjaBC4ypoZyKqIq22GVimUg'

const supabase  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const BATCH     = 200
const JSON_FILE = path.join(__dirname, 'data', 'pep-uif-2026.json')

async function main() {
  // 1. Leer JSON
  console.log('Leyendo pep-uif-2026.json...')
  const records = JSON.parse(readFileSync(JSON_FILE, 'utf-8'))
  console.log(`  → ${records.length} registros`)

  // 2. Borrar ICD_CR_PEP anteriores
  console.log('\nEliminando registros anteriores ICD_CR_PEP...')
  const { error: delErr } = await supabase
    .from('listas_sanciones')
    .delete()
    .eq('fuente', 'ICD_CR_PEP')
  if (delErr) console.warn('  ⚠ Error al borrar:', delErr.message)
  else        console.log('  → Eliminados correctamente')

  // 3. Insertar en lotes
  console.log(`\nInsertando ${records.length} registros en lotes de ${BATCH}...`)
  let ok = 0, err = 0
  const total = Math.ceil(records.length / BATCH)

  for (let i = 0; i < records.length; i += BATCH) {
    const batch  = records.slice(i, i + BATCH)
    const lote   = Math.floor(i / BATCH) + 1
    const pct    = Math.round((i + batch.length) / records.length * 100)

    const { error: insErr } = await supabase
      .from('listas_sanciones')
      .insert(batch)

    if (insErr) {
      err += batch.length
      console.error(`  [ERR] Lote ${lote}/${total}: ${insErr.message}`)
    } else {
      ok += batch.length
      console.log(`  [${String(pct).padStart(3)}%] Lote ${lote}/${total} — ${batch.length} registros OK`)
    }
  }

  console.log(`\n✅ Completado: ${ok} insertados, ${err} con error.`)
  if (err === 0) console.log('   La lista PEP UIF/ICD 2026 está activa en la aplicación.')
}

main().catch(e => { console.error('Error inesperado:', e); process.exit(1) })
