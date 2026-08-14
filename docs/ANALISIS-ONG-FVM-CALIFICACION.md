# Análisis — Calificación de riesgo para ONG a partir de la metodología de Fundación Visión Mundial

> Basado en los documentos reales de FVM: **N04 Metodología de Clasificación de Riesgo** y **F08 Formulario de Categorización de Riesgo** (aprobados por Comité Ejecutivo, rige 29-oct-2024).
> Objetivo: contrastar la propuesta del sistema con la metodología real y dejarla lista para probar/calibrar.

---

## 1. Lo que aporta la metodología FVM (y confirma / corrige la propuesta)

1. **El cliente de una ONG no es uno solo: hay categorías con reglas distintas.** FVM califica en tres tipos, cada uno con su propio esquema de pesos:
   - **Donante** (por encima del umbral ≥ $1.000/mes, y donante mayor > $50.000/mes)
   - **Donante Cooperación Internacional** (gobiernos, organismos como la ONU, fundaciones internacionales)
   - **Beneficiario Externo**
   - *(Además existen formularios de Proveedor F06/F07, pero la metodología N04 de calificación cubre donante y beneficiario.)*

2. **Hay un umbral que decide si se califica o no** — regla de negocio previa a la calificación:
   | Donante | Monto mensual | ¿Se califica? |
   |---|---|---|
   | Anónimo (digital) | < $300 | No — bajo automático (cliente ocasional) |
   | Por debajo del umbral | $300 – $1.000 | No — bajo automático |
   | Por encima del umbral | ≥ $1.000 | **Sí** |
   | Mayor | > $50.000 | **Sí** |
   | Cooperación internacional | — | **Sí** |
   | Beneficiario externo | — | **Sí** |

3. **Pesos consolidados reales por categoría** (de N04 / F08):
   | Categoría | Cliente | Geografía | Productos | Canales |
   |---|---|---|---|---|
   | Donante / Beneficiario externo — **física** | 0.40 | 0.20 | 0.20 | 0.20 |
   | Donante / Beneficiario externo — **jurídica** | 0.50 | 0.15 | 0.20 | 0.15 |
   | **Cooperación Internacional** | 0.30 | **0.40** | 0.15 | 0.15 |

   El dato clave: para **cooperación internacional el factor geográfico domina** (0.40), porque el riesgo está en el origen internacional de los fondos.

4. **Persona física usa solo 6 criterios de cliente** (no los 9 genéricos): Acceso a la información (0.15), PEP (0.20), Aparece negativo en el BPS (0.15), Profesión (0.20), Ingreso promedio mensual (0.15), Dinero en efectivo (0.15).

5. **Persona jurídica usa 11 criterios**, casi todos con peso 0.10 (volumen y cantidad de transacciones 0.05 cada uno).

6. **Zona geográfica jurídica**: Ubicación de la actividad (0.30), Casa matriz (0.30), Dinero transfronterizo (0.20), Operación internacional (0.20). No usa "operación nacional".

7. **Terminología propia**: "Aparece negativo en el **BPS**" (sistema interno que consulta al donante/beneficiario contra listas internacionales) = nuestras "listas de observados". Países por **BASE AML INDEX 2023**.

8. **Escala de país** (BASE AML INDEX): < 5 → riesgo 1; 5–6 → riesgo 2; > 7 → riesgo 3.

---

## 2. Cómo quedó implementado en la herramienta

En `metodologiaRiesgo.js`, el perfil de la ONG (`clase_dato 42`) ahora reproduce lo anterior:

- **Selector de categoría** en la pantalla de calificación (aparece solo para ONG): **Donante (≥ $1.000 / mayor) · Cooperación Internacional · Beneficiario Externo**.
- Cada categoría aplica **su esquema de pesos consolidados** exacto de FVM (tabla del punto 1.3).
- **Física → 6 criterios** (se ocultan protectoras de crédito, información del ingreso y estructura administrativa) con los pesos FVM.
- **Jurídica → 11 criterios** con pesos FVM; geografía jurídica sin "operación nacional".
- "Listas de observados" se muestra como **"Aparece negativo en el BPS"**; la terminología de cada factor cambia según la categoría (donante = *origen* de los fondos; beneficiario = *destino/uso* de los fondos; cooperación = *cooperante*).
- **Lista de país FT (GAFI)** activa y **piso de riesgo "medio"** para toda ONG.

Verificado con pruebas unitarias (categorías, pesos y criterios coinciden con FVM).

---

## 3. Diferencias / decisiones para revisar

1. **Umbral de calificación (regla de negocio).** Hoy el sistema califica a cualquiera; FVM **no califica** a donantes < $1.000 (los deja bajo automático). Propuesta: al elegir "Donante", pedir el monto mensual y, si es < $1.000, marcar automáticamente **Bajo** sin exigir el resto del formulario. → **¿Lo implementamos?**

2. **Productos/Canales en persona física.** El esquema consolidado de FVM asigna 0.20 a productos y 0.20 a canales incluso en física, aunque el texto dice que "productos aplica solo a jurídica". Es una inconsistencia del propio documento FVM. Hoy la herramienta **muestra** esos factores en física (peso 0.20). → **¿Los mantenemos en física o los movemos a cliente/geo?**

3. **BASE AML INDEX vs lista UIF.** FVM califica el país con BASE AML INDEX 2023 (escala 1–3 por cortes < 5 / 5–6 / > 7). Nuestra herramienta usa la lista **LC/UIF** para la mayoría y **FT/GAFI** para ONG. Para ONG podríamos alinear los cortes a los de FVM. → **¿Alineamos la escala de país al criterio BASE AML INDEX para ONG?**

4. **"Aparece negativo en el BPS".** En FVM el BPS es un sistema interno que consulta varias listas. En nuestra herramienta ese criterio se responde manualmente (Sí/No). Se puede conectar al módulo de consulta de listas que ya existe. → **¿Lo automatizamos con el resultado de listas ALA/CFT?**

5. **Periodicidad por nivel** (FVM): Alto cada 12 meses, Medio cada 24, Bajo cada 36. Coincide con el módulo de periodicidad que ya tiene la app — conviene confirmar que el parámetro esté igual para ONG.

6. **Proveedores.** FVM tiene "Conozca a su Proveedor" (F06/F07). Si se quiere calificar proveedores de la ONG, se agregaría una cuarta categoría con su propio esquema (falta el detalle de pesos en N04). → **¿Incluimos Proveedor?**

---

## 4. Cómo probarlo (local)

```bash
npm run dev
```
En **Calificación de Riesgo**, con un tenant ONG (o superadmin seleccionando uno): aparecen los botones **Donante / Cooperación Internacional / Beneficiario**. Al cambiar de categoría y de tipo de persona se ve cómo cambian los pesos, los indicadores visibles y la terminología. Comparar contra el F08 de FVM para validar.

---

*Los valores implementados provienen de la metodología aprobada de FVM y sirven de plantilla para las ONG. Otras ONG podrían tener variaciones; el perfil es un punto de partida calibrable en `PERFIL_SUJETO_OBLIGADO[42]`.*
