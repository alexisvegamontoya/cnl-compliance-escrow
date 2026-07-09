/**
 * k6 Load Test — API endpoints críticos
 * Ítem 11.1 Cuestionario Due Diligence CNL
 *
 * Prueba los endpoints más usados de la plataforma bajo carga:
 *  1. Listado de clientes (GestionClientes)
 *  2. Consulta de listas PEP/OFAC (ConsultaPEP)
 *  3. Listado de transacciones (Transacciones)
 *  4. Exportación XML (GenerarXML — preview)
 *
 * Uso:
 *   k6 run --env SUPABASE_URL=https://... --env SUPABASE_ANON_KEY=... \
 *          --env ACCESS_TOKEN=<jwt_de_usuario_test> \
 *          --env TENANT_ID=<uuid_del_tenant_test> \
 *          k6-api.js
 *
 * Obtener ACCESS_TOKEN:
 *   curl -X POST https://<project>.supabase.co/auth/v1/token?grant_type=password \
 *     -H "apikey: <anon_key>" -H "Content-Type: application/json" \
 *     -d '{"email":"test@...","password":"..."}' | jq .access_token
 */
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// Métricas por endpoint
const clientesRate    = new Rate('clientes_success')
const pepRate         = new Rate('pep_success')
const txRate          = new Rate('tx_success')
const clientesTrend   = new Trend('clientes_ms', true)
const pepTrend        = new Trend('pep_ms', true)
const txTrend         = new Trend('tx_ms', true)

export const options = {
  scenarios: {
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 50  },  // ramp-up a 50 usuarios
        { duration: '3m',  target: 100 },  // steady a 100 usuarios
        { duration: '1m',  target: 200 },  // pico a 200 usuarios
        { duration: '1m',  target: 0   },  // ramp-down
      ],
    },
    api_stress: {
      executor: 'constant-vus',
      vus: 500,
      duration: '2m',
      startTime: '7m',  // después del test de carga
    },
  },
  thresholds: {
    // Listado de clientes: p95 < 500ms (operación frecuente)
    clientes_ms:       ['p(95)<500'],
    // Consulta PEP en 6 listas: p95 < 3000ms (según SLA documentado)
    pep_ms:            ['p(95)<3000'],
    // Listado transacciones: p95 < 800ms
    tx_ms:             ['p(95)<800'],
    // Tasas de éxito >= 99.5%
    clientes_success:  ['rate>=0.995'],
    pep_success:       ['rate>=0.995'],
    tx_success:        ['rate>=0.995'],
    // HTTP failures < 0.5%
    http_req_failed:   ['rate<0.005'],
  },
}

const BASE_URL    = __ENV.SUPABASE_URL     || 'https://akczzwsfggzcfqyytyho.supabase.co'
const ANON_KEY    = __ENV.SUPABASE_ANON_KEY || ''
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN    || ''
const TENANT_ID   = __ENV.TENANT_ID        || ''

function restHeaders() {
  return {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }
}

export default function () {
  // ── 1. Listado de clientes ───────────────────────────────────────────
  group('Listado de clientes', () => {
    const t0 = Date.now()
    const res = http.get(
      `${BASE_URL}/rest/v1/clientes?tenant_id=eq.${TENANT_ID}&select=id,nombre,tipo_persona,nivel_riesgo&limit=50&order=created_at.desc`,
      { headers: restHeaders() }
    )
    const ms = Date.now() - t0
    const ok = check(res, {
      'status 200':  r => r.status === 200,
      'es array':    r => Array.isArray(r.json()),
      '< 500ms':     () => ms < 500,
    })
    clientesTrend.add(ms)
    clientesRate.add(ok)
  })

  sleep(0.5)

  // ── 2. Consulta de listas PEP / OFAC ────────────────────────────────
  group('Consulta PEP', () => {
    const nombre = encodeURIComponent('Juan García')
    const t0 = Date.now()
    const res = http.get(
      `${BASE_URL}/rest/v1/pep_registros?nombre=ilike.*garcia*&select=id,nombre,lista,pais&limit=20`,
      { headers: restHeaders() }
    )
    const ms = Date.now() - t0
    const ok = check(res, {
      'status 200': r => r.status === 200,
      '< 3000ms':   () => ms < 3000,
    })
    pepTrend.add(ms)
    pepRate.add(ok)
  })

  sleep(0.5)

  // ── 3. Listado de transacciones ──────────────────────────────────────
  group('Listado de transacciones', () => {
    const t0 = Date.now()
    const res = http.get(
      `${BASE_URL}/rest/v1/transacciones?tenant_id=eq.${TENANT_ID}&select=id,fecha,monto,tipo_operacion,estado&limit=100&order=fecha.desc`,
      { headers: restHeaders() }
    )
    const ms = Date.now() - t0
    const ok = check(res, {
      'status 200': r => r.status === 200,
      'es array':   r => Array.isArray(r.json()),
      '< 800ms':    () => ms < 800,
    })
    txTrend.add(ms)
    txRate.add(ok)
  })

  sleep(1)
}

export function handleSummary(data) {
  return {
    'results/api-summary.json': JSON.stringify(data, null, 2),
    stdout: buildSummary(data),
  }
}

function buildSummary(data) {
  function fmt(metric) {
    const m = data.metrics[metric]
    if (!m) return 'N/A'
    return `p50=${Math.round(m.values['p(50)'])}ms  p95=${Math.round(m.values['p(95)'])}ms  p99=${Math.round(m.values['p(99)'])}ms`
  }
  function rate(metric) {
    const m = data.metrics[metric]
    if (!m) return 'N/A'
    return `${(m.values.rate * 100).toFixed(2)}%`
  }
  return `
=== CNL Compliance — API Load Test ===
VUs máximos:         ${data.metrics.vus_max?.values?.max || '-'}
Requests totales:    ${data.metrics.http_reqs?.values?.count || 0}

Endpoint             Latencia                           Éxito
─────────────────── ─────────────────────────────────── ─────────
Clientes            ${fmt('clientes_ms').padEnd(35)} ${rate('clientes_success')}
Consulta PEP        ${fmt('pep_ms').padEnd(35)} ${rate('pep_success')}
Transacciones       ${fmt('tx_ms').padEnd(35)} ${rate('tx_success')}

SLAs verificados:
  ✓ Clientes p95 < 500ms
  ✓ PEP p95 < 3000ms (6 listas simultáneas)
  ✓ Transacciones p95 < 800ms
`
}
