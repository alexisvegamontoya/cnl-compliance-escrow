# Plan — Auto-llenado completo de la calificación desde el gestor de clientes

> Objetivo: que al elegir un cliente, la calificación de riesgo llegue lo más completa posible con datos ya existentes en la ficha del cliente y en el histórico de transacciones, dejando manual solo lo que es criterio del analista.

---

## 1. Mapa: cada indicador → de dónde sale → qué falta

Estado actual de cada criterio de la calificación:

| Factor | Indicador | Fuente | Estado |
|---|---|---|---|
| Cliente | PEP | `clientes.pep` | ✅ Auto |
| Cliente | Actividad / profesión | `actividad_eco_*` / `profesion_*` | ✅ Auto |
| Cliente | Ingreso mensual | `ingreso_mensual_est` | ✅ Auto |
| Cliente | Listas de observados | Módulo de listas ALA/CFT (ya se consulta en la calificación) | 🔶 Conectar |
| Cliente | Años de operación (jurídica) | Derivar de `fecha_constitucion` | 🔶 Derivar |
| Cliente | Volumen de transacciones | `transacciones` (SUM por período) | 🔶 Calcular |
| Cliente | Cantidad de transacciones | `transacciones` (COUNT por período) | 🔶 Calcular |
| Cliente | Acceso a la información | Criterio del analista | ⬜ Manual |
| Cliente | Protectoras de crédito | Externo (buró de crédito) | ⬜ Manual |
| Cliente | Respaldo del ingreso | — | ➕ Campo nuevo (o manual) |
| Cliente | Manejo de efectivo | — | ➕ Campo nuevo |
| Cliente | Estructura accionaria (jurídica) | — | ➕ Campo nuevo |
| Cliente | Estructura administrativa / personal (jurídica) | — | ➕ Campo nuevo |
| Geo | País origen / residencia / ubicación / casa matriz | `pais_*` | ✅ Auto |
| Geo | Operación nacional (provincia/cantón) | `provincia` / `canton` | ✅ Auto |
| Geo | Dinero transfronterizo | — | ➕ Campo nuevo |
| Geo | Operación internacional | — | ➕ Campo nuevo (o derivar de transfronterizo) |
| Productos | Servicios / productos | `actividad_eco` (catálogo con riesgo) | ✅ Auto |
| Productos | Años de experiencia / comercialización | `fecha_constitucion` (jurídica) / campo (física) | 🔶 Derivar / ➕ |
| Productos | Posicionamiento en el mercado | — | ➕ Campo nuevo |
| Productos | Estructura de ventas | — | ➕ Campo nuevo |
| Canales | Cómo realiza su labor (física) | — | ➕ Campo nuevo (situación laboral) |
| Canales | Cantidad de lugares (física) | — | ➕ Campo nuevo |
| Canales | Cantidad de sucursales (jurídica) | — | ➕ Campo nuevo |
| Canales | Tipo de vendedor (jurídica) | — | ➕ Campo nuevo |

Resumen: **4 se conectan/derivan sin tocar el formulario**, **2 se calculan de transacciones**, y **~11 requieren campo nuevo** en la ficha del cliente.

---

## 2. Fase 1 — Sin tocar el formulario (rápida, alto valor)

Se puede hacer ya, solo en la calificación (`preLlenarDesdeDB`), sin migración:

1. **Años de operación / experiencia (jurídica)**: calcular de `fecha_constitucion` → mapear al criterio (0–2 años = alto … >8 = bajo).
2. **Operación nacional**: ya viene de `provincia`/`canton` (hecho).
3. **Listas de observados**: usar el resultado del módulo de listas ALA/CFT que la pantalla ya consulta al seleccionar el cliente, y setear `listas_obs` (1 si limpio / 3 si aparece).
4. **Volumen y cantidad de transacciones** (ver Fase 2-bis).

## 2-bis. Cálculo desde transacciones (SICVECA)

La tabla `transacciones` tiene `cliente_id`, `monto_movimiento`, `fecha_transaccion`. Cálculo por cliente sobre los últimos 12 meses:

- **Volumen mensual** = SUM(`monto_movimiento`) / n.º de meses con actividad → mapear a las bandas de `vol_trans` (hasta $100k, $100–300k, $300–500k, >$500k).
- **Cantidad mensual** = COUNT / n.º de meses → mapear a `cant_trans` (hasta 50, 50–100, 100–500, >500).

Se hace con una consulta agregada al abrir el cliente. **Decisión**: ¿ventana de 12 meses y promedio mensual, o el mes de mayor movimiento (más conservador)?

---

## 3. Fase 2 — Campos nuevos en la ficha del cliente (+ migración BD)

Columnas a agregar en `clientes` (todas opcionales, con valor por defecto nulo):

**Comunes**
- `manejo_efectivo` (select: no opera / poco / mayoritario / solo efectivo)
- `opera_transfronterizo` (select: no / remesas / transferencias intl. / transferencias + otros)

**Persona física**
- `situacion_laboral` (asalariado formal / independiente en Hacienda-CCSS / independiente sin Hacienda)
- `cant_lugares_actividad` (1 / 2–3 / 4+)
- `anos_actividad` (número)

**Persona jurídica**
- `niveles_societarios` (1 a 4+ → estructura accionaria)
- `cant_personal` (rangos → estructura administrativa)
- `opera_internacional` (no / riesgo bajo-medio / algún país alto / varios países alto)
- `posicion_mercado` (las 6 opciones nuevas)
- `estructura_ventas` (las 6 opciones nuevas)
- `cant_sucursales` (sin sucursales / 1–2 / 3–5 / 5+)
- `tipo_vendedor` (propios en planilla / distribuidores formales / intermediarios / informales)

**Trabajo por parte:**
1. Migración SQL `ALTER TABLE clientes ADD COLUMN …` (Cumplimiento; se aplica por dashboard/SQL).
2. Controles en `ClienteFormCompleto.jsx` (secciones "Datos para calificación de riesgo", una para física y otra para jurídica).
3. Guardado/lectura de esos campos (agregar a los arrays de campos permitidos del form).
4. Pre-llenado en `preLlenarDesdeDB` de cada criterio desde su columna.

**Nota "según la actividad"**: varios de estos campos solo aplican a ciertas actividades. Se pueden mostrar/ocultar en el formulario según el `clase_dato` del sujeto obligado, igual que ya se hace en la calificación.

---

## 4. Fase 3 — Auto-llenado automático

Hoy el pre-llenado es un botón. Se puede disparar **automático al seleccionar el cliente** (llamar `preLlenarDesdeDB` dentro de `handleSelectCliente`), dejando igualmente un botón "volver a pre-llenar". **Decisión**: ¿automático siempre, o mantener el botón para no sobrescribir lo que el analista ya tocó?

---

## 5. Orden sugerido y esfuerzo

| Fase | Qué | Esfuerzo | Requiere |
|---|---|---|---|
| **1** | Años de operación + listas + auto-llenado automático | Bajo | Solo código |
| **1-bis** | Volumen/cantidad de transacciones desde SICVECA | Medio | Consulta agregada |
| **2** | 11 campos nuevos en ficha del cliente | Alto | Migración BD + formulario |
| **3** | Mostrar/ocultar campos por actividad | Medio | Sobre la Fase 2 |

Recomendación: arrancar por **Fase 1 + 1-bis** (se ve valor ya, sin tocar la base), y luego encarar la **Fase 2** (campos nuevos) por grupos: primero los comunes (efectivo, transfronterizo), después física, después jurídica.

---

## 6. Decisiones para vos

1. **Transacciones**: ¿ventana 12 meses / promedio mensual, o mes pico (más conservador)?
2. **Auto-llenado**: ¿automático al elegir cliente, o mantener botón?
3. **Campos por actividad**: ¿mostramos todos los campos siempre, o los filtramos según el sujeto obligado?
4. **Respaldo del ingreso y acceso a información**: ¿campo nuevo o quedan como criterio manual del analista?
5. ¿Arranco por la **Fase 1 + 1-bis** mientras definimos las columnas de la Fase 2?
