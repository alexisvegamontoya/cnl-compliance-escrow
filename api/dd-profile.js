/**
 * Vercel Serverless Function — Perfil IA para Debida Diligencia
 * Usa Tavily para búsqueda web real + Claude para análisis narrativo
 *
 * Variables de entorno requeridas en Vercel:
 *   ANTHROPIC_API_KEY — ya configurada
 *   TAVILY_API_KEY    — nueva: obtener en https://tavily.com (gratuito 1000 búsquedas/mes)
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { tipo, nombre, actividad, pais, participantes, resultados_listas } = req.body || {}

  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre del cliente requerido.' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const tavilyKey    = process.env.TAVILY_API_KEY

  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada.' })
  if (!tavilyKey)    return res.status(500).json({ error: 'TAVILY_API_KEY no configurada. Agréguela en Vercel Dashboard → Settings → Environment Variables.' })

  try {
    // ── 1. Búsqueda web con Tavily ────────────────────────────────────────────
    const queries = tipo === 'J'
      ? [
          `empresa "${nombre}" Costa Rica cumplimiento fraude lavado`,
          `"${nombre}" ${actividad || ''} ${pais || 'Costa Rica'} noticias`,
        ]
      : [
          `"${nombre}" ${pais || 'Costa Rica'} fraude lavado corrupción sanción`,
          `"${nombre}" funcionario público cargo político ${pais || 'Costa Rica'}`,
        ]

    const searchResults = await Promise.allSettled(
      queries.map(q =>
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
        .catch(() => ({ results: [] }))
      )
    )

    const webContext = searchResults
      .flatMap(r => r.status === 'fulfilled' ? (r.value.results || []) : [])
      .slice(0, 8)
      .map(r => `FUENTE: ${r.url}\nTÍTULO: ${r.title}\nRESUMEN: ${(r.content || '').slice(0, 350)}`)
      .join('\n\n---\n\n')

    // ── 2. Contexto de listas ─────────────────────────────────────────────────
    const resultadosList = Object.entries(resultados_listas || {})
    const hayAlerta  = resultadosList.some(([, v]) => v?.nivel === 'ALERTA')
    const hayRevisar = resultadosList.some(([, v]) => v?.nivel === 'REVISAR')
    const hayPEP     = resultadosList.some(([, v]) => v?.esPEP)

    const contextoListas = resultadosList.length > 0
      ? `Consulta de listas internacionales:\n${resultadosList.map(([n, v]) =>
          `- ${n}: ${v?.nivel || 'SIN_HALLAZGOS'}${v?.esPEP ? ' (PEP ICD CR)' : ''}`
        ).join('\n')}`
      : 'No se han consultado listas aún.'

    // ── 3. Prompt para Claude ─────────────────────────────────────────────────
    const prompt = `Eres un analista senior de debida diligencia ALA/CFT para el mercado costarricense, especializado en la Ley 7786 y el Acuerdo SUGEF 13-19.

DATOS DEL CLIENTE:
- Tipo: ${tipo === 'J' ? 'Persona Jurídica' : 'Persona Física'}
- Nombre: ${nombre}
- Actividad económica / Ocupación: ${actividad || 'No especificada'}
- País: ${pais || 'Costa Rica'}
${participantes?.length > 0
  ? `- Participantes vinculados: ${participantes.map(p => `${p.nombre} (${p.rol})`).join(', ')}`
  : ''}
${hayAlerta  ? '⚠️ ALERTA CRÍTICA: Se detectaron coincidencias en listas internacionales de sanciones.' : ''}
${hayRevisar ? '⚠️ REVISAR: Posibles coincidencias en listas internacionales.' : ''}
${hayPEP     ? '🏛️ PEP IDENTIFICADO en la Lista ICD Costa Rica.' : ''}

${contextoListas}

RESULTADOS DE BÚSQUEDA WEB:
${webContext || 'No se encontraron resultados relevantes en internet para este nombre.'}

---

Genera un PERFIL DE DEBIDA DILIGENCIA con exactamente estas 4 secciones. Usa el formato indicado:

**1. PERFIL DEL NEGOCIO / ACTIVIDAD ECONÓMICA**
[Describe el giro comercial, sector económico, características típicas de este tipo de negocio/profesión, y su nivel de riesgo inherente según estándares GAFI y SUGEF. Menciona si la actividad es APNFD según Ley 7786, Art. 14.]

**2. PRESENCIA PÚBLICA Y REPUTACIÓN**
[Basado en los resultados web encontrados: ¿qué información pública existe sobre esta persona o empresa? ¿Hay noticias adversas, demandas, investigaciones o menciones en medios? Si no se encontró información, indícalo claramente y menciona que esto puede ser normal para empresas pequeñas.]

**3. SEÑALES DE ALERTA IDENTIFICADAS**
[Lista las señales de alerta relevantes según Acuerdo SUGEF 13-19, Art. 43. Incluye: riesgo de la actividad económica, resultados de listas, información pública encontrada, y cualquier factor de riesgo adicional identificado. Si no hay señales significativas, indícalo explícitamente.]

**4. NIVEL DE RIESGO SUGERIDO: [BAJO / MEDIO / ALTO / MUY ALTO]**
[Justifica en 2-3 oraciones con referencia a la Ley 7786 y el Acuerdo SUGEF 13-19, Art. 21-28. Indica el tipo de DDC que corresponde.]

Escribe en español formal costarricense. Máximo 600 palabras totales.`

    // ── 4. Llamada a Claude ───────────────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':        anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':     'application/json',
      },
      body: JSON.stringify({
        model:      'claude-3-5-haiku-20241022',
        max_tokens: 1800,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      let msg = 'Error al generar perfil con Claude.'
      try { msg = JSON.parse(err)?.error?.message || msg } catch {}
      return res.status(502).json({ error: msg })
    }

    const claudeData = await claudeRes.json()
    const perfil = claudeData.content?.[0]?.text || ''

    // ── 5. Extraer nivel de riesgo del texto generado ────────────────────────
    let nivel_sugerido = 'MEDIO'
    if (/MUY ALTO/i.test(perfil))          nivel_sugerido = 'MUY_ALTO'
    else if (/\bALTO\b/i.test(perfil))     nivel_sugerido = 'ALTO'
    else if (/\bBAJO\b/i.test(perfil))     nivel_sugerido = 'BAJO'

    return res.status(200).json({ perfil, nivel_sugerido })

  } catch (err) {
    console.error('[dd-profile] Error:', err)
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message })
  }
}
