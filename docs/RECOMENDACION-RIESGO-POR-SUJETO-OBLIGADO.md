# Recomendación — Estructura de la calificación de riesgo por tipo de actividad, persona física/jurídica e indicadores

> Documento de análisis y propuesta. **No implementa cambios**: es la base para revisar y decidir.
> Fecha: 2026-08-13 · App: Cumplimiento (CNL) · Archivo base: `src/lib/metodologiaRiesgo.js`

---

## 1. Diagnóstico del estado actual

La metodología N06 vigente califica al cliente con **4 factores** ponderados y consolidados:

| Factor | Física | Jurídica |
|---|---|---|
| Cliente | 60 % | 50 % |
| Zona geográfica | 40 % | 15 % |
| Productos/Servicios | 0 % | 20 % |
| Canales de distribución | 0 % | 15 % |

Hallazgos:

1. **Sí diferencia persona física vs jurídica.** No es cierto que use los mismos indicadores: física tiene 9 criterios de cliente (profesión, protectoras de crédito, información de ingreso…) y jurídica tiene 11 (actividad económica, estructura accionaria, años de operación, volumen y cantidad de transacciones…), además de pesos y factores geográficos/productos/canales distintos. El tipo se **autodetecta** del `tipo_identificacion` del cliente (`handleSelectCliente`).

2. **NO diferencia por tipo de sujeto obligado.** Una joyería (metales), un casino, una inmobiliaria, una remesadora y una ONG se califican **con los mismos pesos y los mismos indicadores**. El único ajuste por actividad hoy existente es el que se agregó ahora: si el sujeto obligado es **ONG (`clase_dato = 42`)**, el riesgo país se toma de la **lista FT (GAFI)** en vez de la lista LC/UIF.

3. **La app ya sabe qué tipo de sujeto obligado es cada tenant.** El catálogo `ACTIVIDADES_APNFD` clasifica 10 actividades por `clase_dato`, cada una con un umbral de reporte (`monto_min_usd`) que **ya refleja un riesgo inherente distinto** (a menor umbral, mayor escrutinio):

| clase_dato | Sujeto obligado | Umbral USD | Señal de riesgo inherente |
|---|---|---|---|
| 42 | Organizaciones Sin Fines de Lucro | 1 000 | Muy alto (FT) |
| 45 | Remesas y Transferencias | 1 000 | Muy alto |
| 43 | Casinos | 3 000 | Alto |
| 41 | Casas de Empeño | 10 000 | Medio-alto |
| 44 | Administración de Dinero | 10 000 | Alto |
| 46 | Emisión/Operación Tarjetas | 10 000 | Medio-alto |
| 47 | Facilidades Crediticias | 10 000 | Medio-alto |
| 48 | Servicios Fiduciarios | 10 000 | Alto |
| 49 | Bienes Inmuebles | 10 000 | Alto |
| 40 | Metales y Piedras Preciosas | 15 000 | Medio-alto |

**Conclusión del diagnóstico:** el eje que falta es el de **riesgo por actividad del sujeto obligado**. La estructura correcta es de **tres ejes**, no dos.

---

## 2. Propuesta: calificación en tres ejes

```
Riesgo del cliente = f( EJE 1: actividad del sujeto obligado )
                       ( EJE 2: persona física / jurídica     )
                       ( EJE 3: perfil del cliente — 4 factores)
```

- **Eje 1 — Actividad del sujeto obligado** (NUEVO): define, según `clase_dato`, (a) qué **lista de país** aplica, (b) el **ajuste de pesos** de los 4 factores, (c) los **indicadores específicos** que se activan, y (d) un **piso de riesgo** cuando la actividad es intrínsecamente alta.
- **Eje 2 — Persona física / jurídica** (YA EXISTE): mantiene la diferenciación actual de pesos e indicadores; se refina.
- **Eje 3 — Perfil del cliente** (YA EXISTE): los 4 factores y sus criterios.

La clave de diseño: el Eje 1 **modula** (no reemplaza) los ejes 2 y 3. Así el comportamiento actual queda como "perfil por defecto" y cada actividad se calibra encima. Es retrocompatible.

---

## 3. Eje 1 — Riesgo inherente y perfil por sujeto obligado

Perfil recomendado por actividad. Los pesos son una **propuesta a calibrar** por la oficialía de cumplimiento; la lógica detrás de cada uno se explica en la columna de tipología.

| Sujeto obligado | Lista país | Peso ↑ que domina | Piso de riesgo | Tipología / porqué |
|---|---|---|---|---|
| **ONG (42)** | **FT (GAFI)** | Geo + Cliente (origen/destino de fondos, donantes/beneficiarios) | Medio | Abuso de OSFL para canalizar/mover fondos con fines FT; corredores transfronterizos. |
| **Remesas (45)** | LC + **FT** | Geo (corredores) + Canales (agentes/subagentes) | Medio | Estructuración (*smurfing*), corredores de alto riesgo, uso de terceros. |
| **Casinos (43)** | LC | Canales + Efectivo | Medio | Alta rotación de efectivo, fichas como cuasi-dinero, *refining*. |
| **Bienes Inmuebles (49)** | LC | Productos (valor de operación) + Cliente (origen de fondos) | Medio | Integración de fondos, pago en efectivo, sobre/subvaluación. |
| **Servicios Fiduciarios (48)** | LC | Cliente (beneficiario final, capas societarias) + Geo | Medio | Ocultamiento del beneficiario final, estructuras opacas. |
| **Metales y Piedras (40)** | LC | Productos (bien de alto valor y portable) + Efectivo | — | Valor concentrado, portabilidad, pago en efectivo. |
| **Casas de Empeño (41)** | LC | Cliente + Efectivo | — | Efectivo, bienes de procedencia dudosa. |
| **Admin. de Dinero (44)** | LC | Canales + transaccional (volumen/cantidad) | — | Movimiento de fondos por cuenta de terceros. |
| **Tarjetas (46)** | LC | Canales + Productos | — | Prepago/anónimo, recargas en efectivo. |
| **Facilidades Crediticias (47)** | LC | Cliente (capacidad/origen de pago) + transaccional | — | Cancelaciones anticipadas en efectivo, testaferros. |

Notas:
- **Piso de riesgo** = la calificación consolidada no puede quedar por debajo de ese nivel para ese sujeto obligado (p. ej., ninguna ONG debería salir "Bajo" por diseño). Es un control conservador; se activa solo donde tiene sentido normativo.
- Para **ONG y Remesas**, la lista de país debe cruzar **FT** (ya hecho para ONG). Se recomienda extender el cruce FT a Remesas.

---

## 4. Eje 2 — Persona física vs jurídica (refinamiento)

Se mantiene la estructura actual. Ajustes sugeridos para que "encaje" mejor por actividad:

- **Física con productos/canales = 0 %** hoy tiene sentido para un cliente-persona sin giro comercial, pero para actividades donde la persona física **sí opera un negocio** (p. ej., un comerciante de metales inscrito como física, un prestamista individual), conviene que el Eje 1 pueda **activar** los factores Productos/Canales también en física, redistribuyendo pesos.
- Los criterios compartidos entre física y jurídica (PEP, listas de observados, acceso a información, efectivo) se mantienen idénticos a propósito: son transversales. La diferenciación real está en los criterios propios de cada tipo (protectoras/profesión en física; estructura accionaria/años de operación/volumen en jurídica).

---

## 5. Eje 3 — Indicadores específicos por actividad

Además de los criterios base, cada sujeto obligado debería **activar indicadores propios**. Propuesta de "indicadores adicionales por actividad" (se suman al factor correspondiente):

| Sujeto obligado | Factor | Indicador específico propuesto |
|---|---|---|
| ONG (42) | Cliente | Origen de los fondos / donante; destino y país del beneficiario final del proyecto |
| ONG (42) | Geo | Operación en jurisdicción bajo monitoreo FT (cruce lista FT) |
| Remesas (45) | Geo | Corredor de envío/recepción de alto riesgo |
| Remesas (45) | Cliente | Patrón de estructuración (múltiples envíos bajo umbral) |
| Casinos (43) | Canales | Proporción de operación en efectivo / compra-recompra de fichas |
| Bienes Inmuebles (49) | Productos | Valor de la operación vs perfil declarado; % pagado en efectivo |
| Fiduciarios (48) | Cliente | Nº de capas societarias hasta el beneficiario final (ya existe `struct_acc`, elevar peso) |
| Metales (40) | Productos | Transacción en efectivo sobre bien de alto valor y portable |
| Empeño (41) | Cliente | Recurrencia y procedencia del bien empeñado |

Estos indicadores ya existen parcialmente como criterios genéricos (efectivo, transfronterizo, estructura accionaria); la propuesta es **darles el peso adecuado según la actividad**, no necesariamente crear campos nuevos.

---

## 6. Propuesta de implementación (para cuando se decida)

Extensión mínima y retrocompatible sobre `metodologiaRiesgo.js`:

```js
// NUEVO: perfil de riesgo por sujeto obligado (clave = clase_dato)
export const PERFIL_SUJETO_OBLIGADO = {
  42: { // ONG
    listaPais: 'FT',
    pisoRiesgo: 'medio',
    pesos: { fisica:   { cliente: 0.5, geo: 0.5, productos: 0, canales: 0 },
             juridica: { cliente: 0.45, geo: 0.35, productos: 0.1, canales: 0.1 } },
    indicadoresExtra: ['origen_fondos', 'destino_beneficiario'],
  },
  45: { listaPais: 'FT+LC', pisoRiesgo: 'medio', /* remesas … */ },
  43: { listaPais: 'LC', /* casinos: canales+efectivo … */ },
  // … 40, 41, 44, 46, 47, 48, 49
  default: { listaPais: 'LC', pisoRiesgo: null, pesos: PESOS_CONSOLIDADO },
}

export function perfilSujeto(claseDato) {
  return PERFIL_SUJETO_OBLIGADO[claseDato] || PERFIL_SUJETO_OBLIGADO.default
}
```

En `CalificacionRiesgo.jsx`:
- Leer `perfil = perfilSujeto(tenant.clase_dato)` una vez.
- Usar `perfil.pesos[tipoPersona]` en `calcularScoreTotal` (en vez de la constante fija).
- Elegir lista de país por `perfil.listaPais` (`'FT'`, `'LC'`, `'FT+LC'`) — generaliza el `esONG` actual.
- Aplicar `perfil.pisoRiesgo` al consolidar (elevar el nivel final si cae por debajo).

Ventaja: el `default` reproduce **exactamente** el comportamiento de hoy, así que se puede migrar actividad por actividad sin romper las demás.

---

## 7. Fundamento normativo

- **Ley 7786** (reformada por Ley 8204 y 9449) — sujetos obligados APNFD, Art. 15/15 bis/15 ter.
- **Recomendación GAFI 1** — enfoque basado en riesgo: la intensidad de la DDC debe ser **proporcional al riesgo de la actividad**, lo que sustenta diferenciar por sujeto obligado.
- **Recomendación GAFI 8** — organizaciones sin fines de lucro y riesgo FT (sustenta la lista FT para ONG).
- **Acuerdo SUGEF 13-19 / 12-21** — metodología de valoración de riesgo y factores (cliente, producto/servicio, canal, zona geográfica).

---

## 8. Decisiones para revisar en la mañana

1. **¿Se aprueba el enfoque de tres ejes** (actividad → persona → cliente)?
2. **Perfiles de peso por actividad** de la tabla §3: ¿los calibramos juntos o con base en una plantilla que uses hoy fuera del sistema?
3. **Piso de riesgo**: ¿lo aplicamos (p. ej., ONG nunca "Bajo") o preferimos que la calificación sea 100 % por indicadores sin pisos?
4. **Lista FT para Remesas** (además de ONG): ¿se incluye?
5. **Productos/Canales en persona física** para actividades con giro comercial: ¿se activan?
6. Orden de implementación sugerido: **ONG → Remesas → Casinos → Inmobiliaria → resto** (de mayor a menor riesgo inherente).

---

*Este documento acompaña los cambios ya realizados y commiteados: lista de país LC/UIF (178 países) y lista FT (GAFI, jun-2026) aplicada solo a ONG. Ninguno de esos cambios está desplegado en producción todavía — pendiente de tu confirmación.*
