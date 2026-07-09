/**
 * k6 Load Test — Login flow
 * Ítem 11.1 Cuestionario Due Diligence CNL
 *
 * Prueba el flujo completo de autenticación con contraseña.
 * Supabase Auth endpoint: POST /auth/v1/token?grant_type=password
 *
 * Uso:
 *   k6 run --env SUPABASE_URL=https://... --env SUPABASE_ANON_KEY=... \
 *          --env TEST_EMAIL=test@example.com --env TEST_PASSWORD=pass \
 *          k6-login.js
 *
 * Perfiles de carga:
 *   Smoke test (validar):       1 VU, 30s
 *   Load test (carga normal):   50 VUs, 2min
 *   Stress test (máxima carga): 200 VUs, 5min
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

const loginErrors   = new Counter('login_errors')
const loginRate     = new Rate('login_success_rate')
const loginDuration = new Trend('login_duration_ms', true)

export const options = {
  scenarios: {
    // Smoke: verificar que el script funciona
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { scenario: 'smoke' },
    },
    // Load: simular carga normal de usuarios
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },   // ramp-up
        { duration: '60s', target: 50 },   // steady state
        { duration: '30s', target: 0 },    // ramp-down
      ],
      tags: { scenario: 'load' },
      startTime: '35s',  // después del smoke
    },
  },
  thresholds: {
    // 95% de logins deben completarse en < 2000ms
    'login_duration_ms{scenario:load}': ['p(95)<2000'],
    // Tasa de éxito debe ser >= 99%
    'login_success_rate': ['rate>=0.99'],
    // Tasa de errores HTTP < 1%
    'http_req_failed': ['rate<0.01'],
  },
}

const SUPABASE_URL     = __ENV.SUPABASE_URL     || 'https://akczzwsfggzcfqyytyho.supabase.co'
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || ''
const TEST_EMAIL       = __ENV.TEST_EMAIL       || 'test@cnl-cr.com'
const TEST_PASSWORD    = __ENV.TEST_PASSWORD    || 'Test1234!'

export default function () {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`

  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  }

  const t0  = Date.now()
  const res = http.post(url, payload, { headers })
  const ms  = Date.now() - t0

  const ok = check(res, {
    'status 200': r => r.status === 200,
    'tiene access_token': r => r.json('access_token') !== undefined,
    'tiempo < 2000ms': () => ms < 2000,
  })

  loginDuration.add(ms)
  loginRate.add(ok)
  if (!ok) loginErrors.add(1)

  sleep(1)
}

export function handleSummary(data) {
  return {
    'results/login-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  }
}

function textSummary(data) {
  const dur = data.metrics['login_duration_ms']
  const rate = data.metrics['login_success_rate']
  return `
=== CNL Compliance — Login Load Test ===
Duración total:      ${Math.round(data.state.testRunDurationMs / 1000)}s
VUs máximos:         ${data.metrics.vus_max?.values?.max || '-'}
Requests totales:    ${data.metrics.http_reqs?.values?.count || 0}
Tasa de éxito:       ${((rate?.values?.rate || 0) * 100).toFixed(2)}%
Latencia p50:        ${Math.round(dur?.values?.['p(50)'] || 0)}ms
Latencia p95:        ${Math.round(dur?.values?.['p(95)'] || 0)}ms
Latencia p99:        ${Math.round(dur?.values?.['p(99)'] || 0)}ms
Errores:             ${data.metrics.login_errors?.values?.count || 0}
`
}
