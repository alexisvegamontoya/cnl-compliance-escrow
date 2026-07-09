# Load Tests — CNL Compliance Platform
**Ítem 11.1 · Cuestionario Due Diligence · Evaluación SUGEF**

Scripts k6 para prueba de carga formal. Cubren los flujos críticos documentados en el Cuestionario v3.

---

## Instalación de k6

**Windows:**
```powershell
winget install k6 --source winget
# o descarga directa:
# https://dl.k6.io/msi/k6-latest-amd64.msi
```

**Linux / Mac:**
```bash
brew install k6          # Mac
sudo apt install k6      # Ubuntu/Debian
```

---

## Scripts disponibles

| Script | Qué prueba | SLA objetivo |
|--------|-----------|--------------|
| `k6-login.js` | Autenticación con contraseña | p95 < 2000ms, éxito ≥ 99% |
| `k6-api.js` | Clientes, PEP, Transacciones | p95 < 500 / 3000 / 800ms |

---

## Ejecución paso a paso

### 1. Obtener credenciales de prueba

```bash
# Obtener ACCESS_TOKEN con usuario de prueba
curl -X POST "https://akczzwsfggzcfqyytyho.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@cnl-cr.com","password":"TU_PASSWORD"}' \
  | jq -r .access_token
```

### 2. Test de login (smoke → load)

```bash
k6 run \
  --env SUPABASE_URL=https://akczzwsfggzcfqyytyho.supabase.co \
  --env SUPABASE_ANON_KEY=TU_ANON_KEY \
  --env TEST_EMAIL=test@cnl-cr.com \
  --env TEST_PASSWORD=TU_PASSWORD \
  scripts/load-tests/k6-login.js
```

### 3. Test de APIs bajo carga

```bash
k6 run \
  --env SUPABASE_URL=https://akczzwsfggzcfqyytyho.supabase.co \
  --env SUPABASE_ANON_KEY=TU_ANON_KEY \
  --env ACCESS_TOKEN=JWT_OBTENIDO_ARRIBA \
  --env TENANT_ID=UUID_DEL_TENANT_TEST \
  scripts/load-tests/k6-api.js
```

### 4. Guardar resultados en JSON (para el informe)

```bash
k6 run --out json=results/run-$(date +%Y%m%d).json k6-login.js
```

---

## Perfiles de carga configurados

### k6-login.js
| Fase | VUs | Duración | Objetivo |
|------|-----|----------|---------|
| Smoke | 1 | 30s | Validar configuración |
| Load (ramp-up) | 0→20 | 30s | Subida gradual |
| Load (steady) | 20→50 | 60s | Carga normal |
| Load (ramp-down) | 50→0 | 30s | Bajada gradual |

### k6-api.js
| Fase | VUs | Duración | Objetivo |
|------|-----|----------|---------|
| Ramp-up | 0→50 | 1min | Subida |
| Steady 100 | 100 | 3min | Carga sostenida |
| Pico 200 | 200 | 1min | Carga máxima esperada |
| Stress 500 | 500 | 2min | Límite de estrés |
| Ramp-down | 200→0 | 1min | Bajada |

---

## Criterios de aprobación (thresholds)

Los scripts fallan automáticamente si no se cumplen:

```
login_duration_ms p95 < 2000ms   ← Login en < 2s
login_success_rate ≥ 99%         ← Tasa de éxito login
clientes_ms p95 < 500ms          ← Listado clientes
pep_ms p95 < 3000ms              ← Consulta PEP (6 listas)
tx_ms p95 < 800ms                ← Listado transacciones
http_req_failed < 0.5%           ← Errores HTTP totales
```

---

## Documentar resultados para evaluación

Después de ejecutar, incluir en el informe:
1. Archivo `results/login-summary.json`
2. Archivo `results/api-summary.json`
3. Fecha y hora de ejecución
4. Volumen de datos del tenant de prueba (# clientes, # transacciones)
5. Firma del responsable técnico

Esto satisface el criterio del ítem 11.1: *"informe de load test formal con resultados documentados de 100-1,000 usuarios concurrentes"*.
