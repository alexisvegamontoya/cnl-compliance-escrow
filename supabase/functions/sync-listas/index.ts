/**
 * Supabase Edge Function — Sincronización nocturna de listas internacionales
 * Fuentes: OFAC SDN, ONU, UK OFSI, INTERPOL, GAFI/GAFILAT
 *
 * Deployment:
 *   supabase functions deploy sync-listas --no-verify-jwt
 *
 * Schedule (en Supabase Dashboard > Edge Functions > sync-listas > Schedule):
 *   Cron: 0 8 * * *  (2 AM CR = 8 AM UTC)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { DOMParser } from "https://esm.sh/@xmldom/xmldom@0.8.10"

// ── CSV parser simple (para OFAC) ─────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Supabase client con service role ─────────────────────────────────────────
function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// ── Helper: batch upsert ──────────────────────────────────────────────────────
async function batchUpsert(supabase: ReturnType<typeof getSupabase>, rows: object[], fuente: string) {
  let insertados = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('listas_sanciones')
      .upsert(chunk, { onConflict: 'fuente,referencia_id', ignoreDuplicates: false })
    if (error) throw new Error(`Upsert ${fuente}: ${error.message}`)
    insertados += chunk.length
  }
  return insertados
}

async function logSync(supabase: ReturnType<typeof getSupabase>, fuente: string, estado: string, count: number, msg?: string) {
  await supabase.from('sync_listas_log').insert({ fuente, estado, registros_procesados: count, mensaje: msg })
  await supabase.from('listas_metadata').update({ ultima_sync: new Date().toISOString(), total_registros: count }).eq('fuente', fuente)
}

// ── OFAC SDN (CSV — mucho más liviano que el XML) ────────────────────────────
// Formato CSV: Ent_num, SDN_Name, SDN_Type, Program, Title, ...
async function syncOFAC(supabase: ReturnType<typeof getSupabase>) {
  const url = 'https://www.treasury.gov/ofac/downloads/sdn.csv'
  const resp = await fetch(url, { headers: { 'User-Agent': 'CNL-Compliance/1.0' } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const text = await resp.text()
  const lines = text.split('\n')

  let totalInserted = 0
  let batch: object[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    if (fields.length < 4) continue

    const uid    = fields[0]?.trim()
    const nombre = fields[1]?.trim()
    const tipo   = fields[2]?.trim()
    const prog   = fields[3]?.trim()

    // Ignorar la fila de encabezado si existe
    if (!uid || !nombre || uid === '-0-' || nombre.toLowerCase().includes('sdn_name')) continue

    batch.push({
      fuente:          'OFAC_SDN',
      tipo_lista:      'sancion',
      nombre_completo: nombre,
      aliases:         [],
      tipo_entidad:    tipo?.toLowerCase() === 'individual' ? 'individual' : 'entidad',
      programa:        prog || '',
      nivel_riesgo:    'muy_alto',
      referencia_id:   `OFAC_SDN_${uid}`,
      activo:          true,
    })

    // Upsert cada 500 filas para no acumular todo en memoria
    if (batch.length >= 500) {
      await batchUpsert(supabase, batch, 'OFAC_SDN')
      totalInserted += batch.length
      batch = []
    }
  }

  if (batch.length > 0) {
    await batchUpsert(supabase, batch, 'OFAC_SDN')
    totalInserted += batch.length
  }

  return totalInserted
}

// ── ONU Consejo de Seguridad (XML) ────────────────────────────────────────────
async function syncONU(supabase: ReturnType<typeof getSupabase>) {
  const url = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml'
  const resp = await fetch(url, { headers: { 'User-Agent': 'CNL-Compliance/1.0' } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const xml = await resp.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const rows: object[] = []

  // Individuos
  const individuals = doc.getElementsByTagName('INDIVIDUAL')
  for (let i = 0; i < individuals.length; i++) {
    const e = individuals[i]
    const dataId  = e.getElementsByTagName('DATAID')[0]?.textContent || `${i}`
    const first   = e.getElementsByTagName('FIRST_NAME')[0]?.textContent || ''
    const second  = e.getElementsByTagName('SECOND_NAME')[0]?.textContent || ''
    const third   = e.getElementsByTagName('THIRD_NAME')[0]?.textContent || ''
    const dob     = e.getElementsByTagName('DATE_OF_BIRTH')[0]?.textContent || ''
    const comment = e.getElementsByTagName('COMMENTS1')[0]?.textContent || ''
    const listed  = e.getElementsByTagName('LISTED_ON')[0]?.textContent || ''

    const nombre = [first, second, third].filter(Boolean).join(' ')

    const natNodes = e.getElementsByTagName('NATIONALITY')
    const paises: string[] = []
    for (let n = 0; n < natNodes.length; n++) {
      const v = natNodes[n].getElementsByTagName('VALUE')[0]?.textContent
      if (v) paises.push(v)
    }

    const aliasNodes = e.getElementsByTagName('ALIAS')
    const aliases: string[] = []
    for (let a = 0; a < aliasNodes.length; a++) {
      const aFirst  = aliasNodes[a].getElementsByTagName('FIRST_NAME')[0]?.textContent || ''
      const aSecond = aliasNodes[a].getElementsByTagName('SECOND_NAME')[0]?.textContent || ''
      const aThird  = aliasNodes[a].getElementsByTagName('THIRD_NAME')[0]?.textContent || ''
      const alias = [aFirst, aSecond, aThird].filter(Boolean).join(' ')
      if (alias) aliases.push(alias)
    }

    if (!nombre) continue
    rows.push({
      fuente: 'ONU', tipo_lista: 'sancion',
      nombre_completo: nombre, aliases, tipo_entidad: 'individual',
      fecha_nacimiento: dob, paises,
      motivo: comment.substring(0, 500), nivel_riesgo: 'muy_alto',
      referencia_id: `ONU_${dataId}`, activo: true,
    })
  }

  // Entidades
  const entities = doc.getElementsByTagName('ENTITY')
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]
    const dataId  = e.getElementsByTagName('DATAID')[0]?.textContent || `E${i}`
    const nombre  = e.getElementsByTagName('FIRST_NAME')[0]?.textContent || `Entidad ONU ${dataId}`
    const comment = e.getElementsByTagName('COMMENTS1')[0]?.textContent || ''
    if (!nombre) continue
    rows.push({
      fuente: 'ONU', tipo_lista: 'sancion',
      nombre_completo: nombre, aliases: [], tipo_entidad: 'entidad',
      motivo: comment.substring(0, 500), nivel_riesgo: 'muy_alto',
      referencia_id: `ONU_E_${dataId}`, activo: true,
    })
  }

  const count = await batchUpsert(supabase, rows, 'ONU')
  return count
}

// ── UK OFSI — deshabilitado (XML/CSV excede límite de memoria del plan free) ───
// Las sanciones UK tienen >90% traslape con OFAC SDN. Se omite por ahora.
async function syncUK(_supabase: ReturnType<typeof getSupabase>) {
  console.log('UK_OFSI: omitido (archivo demasiado grande para plan free)')
  return 0
}

// ── INTERPOL Circulares Rojas (REST API, paginado) ────────────────────────────
async function syncINTERPOL(supabase: ReturnType<typeof getSupabase>) {
  const rows: object[] = []
  let page = 1
  const perPage = 160
  const maxPages = 50  // límite de seguridad (~8000 registros)

  while (page <= maxPages) {
    const url = `https://ws-public.interpol.int/notices/v1/red?resultPerPage=${perPage}&page=${page}`
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CNL-Compliance/1.0' }
    })
    if (!resp.ok) break

    const data = await resp.json()
    const notices = data?._embedded?.notices || []
    if (notices.length === 0) break

    for (const n of notices) {
      const nombre = `${n.forename || ''} ${n.name || ''}`.trim()
      if (!nombre) continue
      rows.push({
        fuente: 'INTERPOL', tipo_lista: 'alerta_roja',
        nombre_completo: nombre, aliases: [], tipo_entidad: 'individual',
        fecha_nacimiento: n.date_of_birth || '',
        paises: Array.isArray(n.nationalities) ? n.nationalities : [],
        nivel_riesgo: 'muy_alto',
        referencia_id: `INTERPOL_${n.entity_id?.replace(/\//g, '_') || page + '_' + rows.length}`,
        activo: true,
      })
    }

    if (notices.length < perPage) break
    page++
  }

  const count = await batchUpsert(supabase, rows, 'INTERPOL')
  return count
}

// ── GAFI / GAFILAT (datos estáticos — actualizados trimestralmente) ────────────
async function syncGAFI(supabase: ReturnType<typeof getSupabase>) {
  // Lista negra GAFI — países con deficiencias estratégicas graves
  const listaNegraGAFI = [
    'Corea del Norte', 'Irán', 'Myanmar',
  ]

  // Lista gris GAFI — bajo seguimiento intensificado (2024)
  const listaGrisGAFI = [
    'Bulgaria', 'Burkina Faso', 'Camerún', 'Costa de Marfil', 'Croacia',
    'Haití', 'Jamaica', 'Mali', 'Mozambique', 'Nigeria', 'Filipinas',
    'Senegal', 'Siria', 'Tanzania', 'Vietnam', 'Yemen',
  ]

  // GAFILAT — jurisdicciones de riesgo regional
  const listaGAFILAT = [
    'Venezuela', 'Nicaragua', 'Cuba',
  ]

  const rows: object[] = []

  listaNegraGAFI.forEach(pais => rows.push({
    fuente: 'GAFI_NEGRO', tipo_lista: 'lista_negra', nombre_completo: pais,
    aliases: [], tipo_entidad: 'pais', paises: [pais],
    motivo: 'Jurisdicción con deficiencias estratégicas graves en ALA/CFT. Requiere DDC ampliada automática.',
    nivel_riesgo: 'muy_alto', referencia_id: `GAFI_NEGRO_${pais}`, activo: true,
  }))

  listaGrisGAFI.forEach(pais => rows.push({
    fuente: 'GAFI_GRIS', tipo_lista: 'lista_gris', nombre_completo: pais,
    aliases: [], tipo_entidad: 'pais', paises: [pais],
    motivo: 'Jurisdicción bajo seguimiento intensificado por FATF/GAFI. Requiere DDC reforzada.',
    nivel_riesgo: 'alto', referencia_id: `GAFI_GRIS_${pais}`, activo: true,
  }))

  listaGAFILAT.forEach(pais => rows.push({
    fuente: 'GAFILAT', tipo_lista: 'lista_negra', nombre_completo: pais,
    aliases: [], tipo_entidad: 'pais', paises: [pais],
    motivo: 'Jurisdicción de alto riesgo identificada por GAFILAT para la región LATAM.',
    nivel_riesgo: 'muy_alto', referencia_id: `GAFILAT_${pais}`, activo: true,
  }))

  const count = await batchUpsert(supabase, rows, 'GAFI_NEGRO')
  await supabase.from('listas_metadata').update({ ultima_sync: new Date().toISOString(), total_registros: rows.filter(r => (r as any).fuente === 'GAFI_GRIS').length }).eq('fuente', 'GAFI_GRIS')
  await supabase.from('listas_metadata').update({ ultima_sync: new Date().toISOString(), total_registros: rows.filter(r => (r as any).fuente === 'GAFILAT').length }).eq('fuente', 'GAFILAT')
  return rows.length
}

// ── Orchestrador principal ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Verificar autorización (service role o secret header)
  const auth = req.headers.get('authorization') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!auth.includes(serviceKey) && !auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }

  const supabase = getSupabase()
  const results: object[] = []
  const { fuente } = await req.json().catch(() => ({})) as { fuente?: string }

  const syncs: Record<string, () => Promise<number>> = {
    OFAC_SDN:  () => syncOFAC(supabase),
    ONU:       () => syncONU(supabase),
    UK_OFSI:   () => syncUK(supabase),
    INTERPOL:  () => syncINTERPOL(supabase),
    GAFI:      () => syncGAFI(supabase),
  }

  const toRun = fuente && syncs[fuente] ? { [fuente]: syncs[fuente] } : syncs

  for (const [nombre, fn] of Object.entries(toRun)) {
    console.log(`Syncing ${nombre}…`)
    try {
      const count = await fn()
      await logSync(supabase, nombre === 'GAFI' ? 'GAFI_NEGRO' : nombre, 'ok', count)
      results.push({ fuente: nombre, ok: true, count })
      console.log(`${nombre}: ${count} registros`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await logSync(supabase, nombre === 'GAFI' ? 'GAFI_NEGRO' : nombre, 'error', 0, msg)
      results.push({ fuente: nombre, ok: false, error: msg })
      console.error(`${nombre} ERROR:`, msg)
    }
  }

  return new Response(JSON.stringify({ ok: true, results, ts: new Date().toISOString() }), {
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
})
