/**
 * Carga Padrón SUGEF — Personas FÍSICAS (8M registros)
 * ======================================================
 * Lee directamente el XML (no requiere Python ni CSV intermedio).
 * Usa streaming con regex — maneja 2.6 GB sin problemas de memoria.
 *
 * Ejecutar desde la carpeta del proyecto:
 *   node scripts/upload-padron-fisicas.js
 *
 * Tiempo estimado: 15–25 minutos según velocidad de conexión.
 */

import { createReadStream } from 'fs'
import { createClient }     from '@supabase/supabase-js'
import path                 from 'path'
import { fileURLToPath }    from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Configuración ──────────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://akczzwsfggzcfqyytyho.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrY3p6d3NmZ2d6Y2ZxeXl0eWhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjMwNzczMCwiZXhwIjoyMDk3ODgzNzMwfQ.sIbLzj6OYKRRQGaorNMoTjaBC4ypoZyKqIq22GVimUg'

const XML_PATH   = path.join(__dirname, '..', 'Pep y padron sugef', 'SUGEF-PadronInternoPersonasFisicas.xml')
const BATCH_SIZE = 500   // registros por llamada a Supabase
const LOG_CADA   = 50000 // imprimir progreso cada N registros

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Extrae el texto de un tag XML ──────────────────────────────────────────────
function getTag(fragment, tag) {
  const open  = `<${tag}>`
  const close = `</${tag}>`
  const s = fragment.indexOf(open)
  if (s === -1) return ''
  const e = fragment.indexOf(close, s)
  if (e === -1) return ''
  return fragment.slice(s + open.length, e).trim()
}

// ── Sube un lote a Supabase (upsert por identificacion) ───────────────────────
async function subirLote(lote) {
  const { error } = await supabase
    .from('padron_sugef')
    .upsert(lote, { onConflict: 'identificacion', ignoreDuplicates: true })
  if (error) {
    // Si falla el lote completo, intentar de a uno para no perder todo
    console.error(`\n  ⚠ Error en lote (${lote.length} reg): ${error.message}`)
  }
}

// ── Lectura streaming del XML ──────────────────────────────────────────────────
async function procesar() {
  console.log('🚀 CNL Compliance — Carga Padrón SUGEF Personas Físicas')
  console.log('='.repeat(55))
  console.log(`📂 Archivo: ${XML_PATH}`)
  console.log(`📦 Lote: ${BATCH_SIZE} registros | Log cada: ${LOG_CADA.toLocaleString()}`)
  console.log('')

  const inicio = Date.now()
  let buffer   = ''
  let lote     = []
  let total    = 0
  let errores  = 0

  const promesa = new Promise((resolve, reject) => {
    const stream = createReadStream(XML_PATH, {
      encoding:       'utf8',
      highWaterMark:  128 * 1024, // 128 KB por chunk
    })

    stream.on('data', async (chunk) => {
      stream.pause()
      buffer += chunk

      // Extraer todos los <Registro>...</Registro> completos del buffer
      const TAG_OPEN  = '<Registro>'
      const TAG_CLOSE = '</Registro>'
      let pos = 0

      while (true) {
        const start = buffer.indexOf(TAG_OPEN, pos)
        if (start === -1) break
        const end = buffer.indexOf(TAG_CLOSE, start)
        if (end === -1) break

        const fragment = buffer.slice(start + TAG_OPEN.length, end)
        pos = end + TAG_CLOSE.length

        // Parsear campos
        const ident  = getTag(fragment, 'Identificacion')
        const nombre = getTag(fragment, 'Nombre')
        const ap1    = getTag(fragment, 'PrimerApellido')
        const ap2    = getTag(fragment, 'SegundoApellido')
        const pais   = getTag(fragment, 'PaisNacimiento') || 'CR'

        if (!ident) continue
        const nombreCompleto = [nombre, ap1, ap2].filter(Boolean).join(' ').toUpperCase()
        if (!nombreCompleto) continue

        lote.push({ identificacion: ident, nombre_completo: nombreCompleto, tipo: 'F', pais })
        total++

        // Subir cuando el lote llega al tamaño definido
        if (lote.length >= BATCH_SIZE) {
          await subirLote(lote)
          lote = []
        }

        // Log de progreso
        if (total % LOG_CADA === 0) {
          const elapsed = ((Date.now() - inicio) / 1000).toFixed(0)
          const rate    = Math.round(total / ((Date.now() - inicio) / 1000))
          process.stdout.write(`\r  ⏳ ${total.toLocaleString()} registros | ${elapsed}s | ~${rate.toLocaleString()} reg/s`)
        }
      }

      // Conservar el buffer restante (puede tener un registro a medias)
      buffer = buffer.slice(pos)
      stream.resume()
    })

    stream.on('end', resolve)
    stream.on('error', reject)
  })

  await promesa

  // Subir lo que quedó en el último lote
  if (lote.length > 0) {
    await subirLote(lote)
  }

  const elapsed = ((Date.now() - inicio) / 1000 / 60).toFixed(1)
  console.log(`\n\n✅ Completado: ${total.toLocaleString()} registros en ${elapsed} minutos`)
  console.log('   El padrón de personas físicas ya está disponible en la app.')
  console.log('   El autocomplete de cédulas físicas en Clientes ya funcionará.')
}

procesar().catch(e => {
  console.error('\n❌ Error inesperado:', e.message)
  process.exit(1)
})
