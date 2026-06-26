/**
 * Vercel Serverless Function — Feed de Inteligencia Regulatoria CNL
 *
 * Invocado por:
 *   - Vercel Cron: GET /api/feed-sync  (diariamente 11:00 UTC = 6:00 AM Costa Rica)
 *   - Botón manual: POST /api/feed-sync (desde Dashboard)
 *
 * Variables de entorno requeridas en Vercel:
 *   TAVILY_API_KEY           — ya configurada
 *   ANTHROPIC_API_KEY        — ya configurada
 *   SUPABASE_SERVICE_ROLE_KEY — agregar en Vercel Settings → Environment Variables
 *                              (encontrar en Supabase → Project Settings → API → service_role)
 */

const SUPABASE_URL = 'https://akczzwsfggzcfqyytyho.supabase.co'

// Búsquedas temáticas ALA/CFT para Costa Rica
const SEARCHES = [
  { q: 'SUGEF CONASSIF circular resolución acuerdo Costa Rica 2025 2026', tipo: 'normativa',     fuente: 'SUGEF/CONASSIF' },
  { q: 'ICD UIF cumplimiento ALA/CFT sujetos obligados Costa Rica',        tipo: 'normativa',     fuente: 'ICD/UIF' },
  { q: 'lavado dinero legitimación capitales Costa Rica noticias',          tipo: 'noticia',       fuente: 'Medios CR' },
  { q: 'GAFI FATF lista gris negra países riesgo lavado dinero 2025 2026', tipo: 'internacional', fuente: 'GAFI/FATF' },
  { q: 'sentencia condena lavado activos Costa Rica OIJ Fiscalía',         tipo: 'judicial',      fuente: 'Poder Judicial' },
  { q: 'GAFILAT INTERPOL sanciones cooperación AML financiero',            tipo: 'internacional', fuente: 'GAFILAT/INTERPOL' },
  { q: 'proyecto ley reforma 7786 Asamblea Legislativa Costa Rica',        tipo: 'normativa',     fuente: 'Asamblea Legislativa' },
  { q: 'narcotráfico crimen financiero operativo Costa Rica delito fiscal', tipo: 'noticia',      fuente: 'Medios CR' },
]

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const tavilyKey    = process.env.TAVILY_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!tavilyKey)    return res.status(500).json({ error: 'TAVILY_API_KEY no configurada.' })
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada.' })
  if (!serviceKey)   return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada. Agréguela en Vercel Settings → Environment Variables.' })

  try {
    // ── 1. Búsquedas en Tavily (paralelo) ────────────────────────────────────
    const searchResults = await Promise.allSettled(
      SEARCHES.map(({ q, tipo, fuente }) =>
        fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key:      tavilyKey,
            query:        q,
            search_depth: 'basic',
            max_results:  5,
            include_answer: false,
          }),
        })
        .then(r => r.ok ? r.json() : { results: [] })
        .then(data => (data.results || []).map(r => ({
          titulo:     r.title || '',
          url:        r.url || '',
          contenido:  (r.content || '').slice(0, 450),
          fecha:      r.published_date || null,
          fuente_hint: fuente,
          tipo_hint:   tipo,
        })))
        .catch(() => [])
      )
    )

    const allResults = searchResults
      .flatMap(r => r.status === 'fulfilled' ? r.value : [])
      .filter(r => r.url && r.titulo)

    // Deduplicar por URL
    const uniqueResults = Object.values(
      allResults.reduce((acc, r) => { acc[r.url] = r; return acc }, {})
    ).slice(0, 35)

    if (uniqueResults.length === 0) {
      return res.status(200).json({ ok: true, msg: 'Sin resultados de búsqueda.', insertados: 0 })
    }

    // ── 2. Claude: filtrar, clasificar, resumir ───────────────────────────────
    const prompt = `Eres un analista senior de inteligencia regulatoria ALA/CFT para Costa Rica.
Se te proporciona una lista de artículos encontrados en búsquedas web.

TU TAREA:
1. Filtra y conserva SOLO los artículos directamente relevantes para: lavado de dinero/legitimación de capitales, financiamiento al terrorismo, compliance ALA/CFT, normativa SUGEF/CONASSIF/ICD/UIF, sanciones OFAC/ONU, GAFI/GAFILAT, delitos financieros, sentencias por lavado en Costa Rica.
2. Para cada artículo conservado, asigna:
   - "urgencia": "urgente" (nueva sanción/lista negra/alerta crítica), "importante" (nueva normativa/sentencia significativa/actualización GAFI), "informativo" (noticias generales de cumplimiento)
   - "fuente_tipo": "normativa" | "noticia" | "internacional" | "judicial"
   - "fuente": nombre de la institución o medio (ej: "La Nación", "SUGEF", "GAFI")
   - "resumen": 1-2 oraciones en español formal (máximo 180 caracteres)
   - "fecha_publicacion": fecha YYYY-MM-DD si está disponible, sino null
3. Genera "resumen_ejecutivo": 2-3 oraciones en español resumiendo los hallazgos más importantes del día para un oficial de cumplimiento ALA/CFT en Costa Rica.

ARTÍCULOS A EVALUAR:
${uniqueResults.map((r, i) =>
  `[${i + 1}] TÍTULO: ${r.titulo}\nURL: ${r.url}\nCONTENIDO: ${r.contenido}\nCATEGORÍA SUGERIDA: tipo=${r.tipo_hint}, fuente=${r.fuente_hint}\nFECHA: ${r.fecha || 'desconocida'}`
).join('\n\n---\n\n')}

Responde ÚNICAMENTE con un JSON válido, sin markdown, con esta estructura exacta:
{
  "items": [
    {
      "titulo": "...",
      "url": "...",
      "resumen": "...",
      "fuente": "...",
      "fuente_tipo": "normativa|noticia|internacional|judicial",
      "urgencia": "urgente|importante|informativo",
      "fecha_publicacion": "YYYY-MM-DD o null"
    }
  ],
  "resumen_ejecutivo": "..."
}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 3500,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      return res.status(502).json({ error: 'Error de Claude API: ' + err.slice(0, 300) })
    }

    const claudeData = await claudeRes.json()
    const rawText    = claudeData.content?.[0]?.text || '{}'

    let parsed
    try {
      // Limpiar posible bloque de código markdown
      const clean = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      return res.status(502).json({ error: 'Claude no devolvió JSON válido.', raw: rawText.slice(0, 400) })
    }

    const { items = [], resumen_ejecutivo = '' } = parsed

    // ── 3. Preparar registros para Supabase ───────────────────────────────────
    const now = new Date().toISOString()
    const feedRecords = items
      .filter(i => i.url && i.titulo)
      .map(i => ({
        titulo:            String(i.titulo).slice(0, 500),
        resumen:           String(i.resumen || '').slice(0, 500),
        url:               String(i.url),
        fuente:            String(i.fuente || '').slice(0, 200),
        fuente_tipo:       ['normativa','noticia','internacional','judicial'].includes(i.fuente_tipo)
                           ? i.fuente_tipo : 'informativo',
        urgencia:          ['urgente','importante','informativo'].includes(i.urgencia)
                           ? i.urgencia : 'informativo',
        fecha_publicacion: i.fecha_publicacion || null,
        fecha_ingreso:     now,
        activo:            true,
      }))

    // Resumen ejecutivo como ítem especial con fuente_tipo='resumen'
    if (resumen_ejecutivo?.trim()) {
      feedRecords.push({
        titulo:            `Resumen ejecutivo IA — ${new Date().toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        resumen:           String(resumen_ejecutivo).slice(0, 800),
        url:               `resumen-ejecutivo-${now.slice(0, 10)}`,
        fuente:            'CNL Inteligencia IA',
        fuente_tipo:       'resumen',
        urgencia:          'informativo',
        fecha_publicacion: now.slice(0, 10),
        fecha_ingreso:     now,
        activo:            true,
      })
    }

    if (feedRecords.length === 0) {
      return res.status(200).json({
        ok: true,
        msg: 'Claude no clasificó ningún artículo como relevante.',
        insertados: 0,
      })
    }

    // ── 4. Upsert en Supabase (ignorar duplicados por URL) ───────────────────
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/feed_items`, {
      method: 'POST',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(feedRecords),
    })

    if (!sbRes.ok) {
      const sbErr = await sbRes.text()
      // 23505 = duplicate key — los artículos ya existen, no es un error real
      if (sbErr.includes('23505') || sbErr.includes('already exists')) {
        console.log('[feed-sync] Algunos artículos ya existían, ignorando duplicados.')
      } else {
        return res.status(502).json({ error: 'Error al insertar en Supabase: ' + sbErr.slice(0, 400) })
      }
    }

    console.log(`[feed-sync] OK — ${feedRecords.length} registros procesados`)
    return res.status(200).json({
      ok:         true,
      insertados: feedRecords.length,
      resumen:    resumen_ejecutivo.slice(0, 200),
    })

  } catch (err) {
    console.error('[feed-sync] Error inesperado:', err)
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message })
  }
}
