// ============================================================
// Reglas de negocio SICVECA — SUGEF APNFD
// Aplica umbrales, tipo_operacion, filtrado y validación de códigos
// ============================================================

import { ACTIVIDADES_APNFD, TIPOS_INGRESO, TIPOS_SALIDA } from './catalogos'

// ─── Conversión de moneda ────────────────────────────────────────────────────
// tipoCambioUSD: colones por 1 dólar (ej: 530)
// tipoCambioEUR: dólares por 1 euro   (ej: 1.09)
export function toUSD(monto, tipoMoneda, tipoCambioUSD, tipoCambioEUR = 1.09) {
  const m = Number(monto) || 0
  switch (Number(tipoMoneda)) {
    case 1: return tipoCambioUSD > 0 ? m / tipoCambioUSD : 0  // CRC → USD
    case 2: return m                                            // Ya es USD
    case 3: return m * tipoCambioEUR                           // EUR → USD
    default: return m
  }
}

// ─── Umbral por clase de dato ────────────────────────────────────────────────
export function getUmbralUSD(claseDato) {
  const act = ACTIVIDADES_APNFD.find(a => a.clase_dato === Number(claseDato))
  return act?.monto_min_usd || 10000
}

// ─── Reglas de inclusión SICVECA (puntos 2, 3 y 4) ──────────────────────────
//
// REGLA 1 — tipo_operacion = 1 (única):
//   Toda transacción cuyo monto individual (en USD equivalente) sea >= umbral.
//
// REGLA 2 — tipo_operacion = 2 (múltiple):
//   Transacciones individuales < umbral, pero cuya SUMATORIA por cliente
//   y por dirección (ingreso/salida por separado) sea >= umbral en el mes.
//   Ingresos y salidas NO se mezclan para alcanzar el umbral.
//
// EXCLUSIÓN: transacciones < umbral cuyo grupo tampoco alcanza el umbral.
//   Quedan en la BD pero NO se incluyen en el XML.
//
export function aplicarReglasSICVECA(transacciones, claseDato, tipoCambioUSD) {
  const umbralUSD = getUmbralUSD(claseDato)

  // Agregar monto en USD a cada transacción
  const conUSD = transacciones.map(t => ({
    ...t,
    _montoUSD: toUSD(t.monto_movimiento, t.tipo_moneda_movimiento, tipoCambioUSD),
  }))

  // Separar únicas de candidatas a múltiple
  const unicas              = []
  const candidatasMultiple  = []

  for (const t of conUSD) {
    if (t._montoUSD >= umbralUSD) {
      unicas.push({ ...t, tipo_operacion: 1 })
    } else {
      candidatasMultiple.push(t)
    }
  }

  // Agrupar candidatas por (cliente × dirección)
  // Ingresos y salidas se evalúan de forma independiente
  const grupos = {}
  for (const t of candidatasMultiple) {
    const key = `${t.numero_identificacion}||${t.tipo_movimiento}`
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(t)
  }

  const multiples = []
  const excluidas = []

  for (const txs of Object.values(grupos)) {
    const sumaUSD = txs.reduce((acc, t) => acc + t._montoUSD, 0)
    if (sumaUSD >= umbralUSD) {
      txs.forEach(t => multiples.push({ ...t, tipo_operacion: 2 }))
    } else {
      txs.forEach(t => excluidas.push(t))
    }
  }

  return {
    incluidas : [...unicas, ...multiples],
    excluidas,
    umbralUSD,
    stats: {
      total     : transacciones.length,
      unicas    : unicas.length,
      multiples : multiples.length,
      excluidas : excluidas.length,
    },
  }
}

// ─── Validación de códigos por actividad (punto 5) ──────────────────────────
// claseIdx = claseDato - 39  (clase 40 → 1, 41 → 2, …, 47 → 8, 48 → 9, 49 → 10)
export function validarCodigosActividad(transacciones, claseDato) {
  const claseIdx = Number(claseDato) - 39
  const errores  = []

  for (const t of transacciones) {
    const tipoMov = Number(t.tipo_movimiento)

    if (tipoMov === 1) {
      // ── Ingreso ──
      const codigo = Number(t.tipo_ingreso)
      if (codigo === 0) {
        // "No aplica" en un movimiento de Ingreso es inválido para SICVECA
        errores.push({
          id          : t.id,
          cedula      : t.numero_identificacion,
          campo       : 'tipo_ingreso',
          valor       : 0,
          descripcion : 'No aplica — los ingresos requieren un código de Tipo Ingreso válido',
        })
        continue
      }
      const entrada = TIPOS_INGRESO.find(ti => ti.codigo === codigo)
      const esValido = entrada &&
        (entrada.clases.includes(0) || entrada.clases.includes(claseIdx))
      if (!esValido) {
        errores.push({
          id          : t.id,
          cedula      : t.numero_identificacion,
          campo       : 'tipo_ingreso',
          valor       : codigo,
          descripcion : entrada?.descripcion || `Código ${codigo} desconocido`,
          clasesDato  : entrada?.clases || [],
        })
      }

    } else if (tipoMov === 2) {
      // ── Salida ──
      const codigo = Number(t.tipo_salida)
      if (codigo === 0) {
        errores.push({
          id          : t.id,
          cedula      : t.numero_identificacion,
          campo       : 'tipo_salida',
          valor       : 0,
          descripcion : 'No aplica — las salidas requieren un código de Tipo Salida válido',
        })
        continue
      }
      const entrada = TIPOS_SALIDA.find(ts => ts.codigo === codigo)
      const esValido = entrada &&
        (entrada.clases.includes(0) || entrada.clases.includes(claseIdx))
      if (!esValido) {
        errores.push({
          id          : t.id,
          cedula      : t.numero_identificacion,
          campo       : 'tipo_salida',
          valor       : codigo,
          descripcion : entrada?.descripcion || `Código ${codigo} desconocido`,
          clasesDato  : entrada?.clases || [],
        })
      }
    }
  }

  return errores
}

// ─── Aplicar nombres corregidos del padrón a las transacciones ───────────────
// nombresCorregidos: { [numero_identificacion]: { tipo, nombre_completo } }
export function aplicarNombresPadron(transacciones, nombresCorregidos) {
  return transacciones.map(t => {
    const reg = nombresCorregidos[String(t.numero_identificacion).replace(/[-\s]/g, '')]
    if (!reg) return t

    if (reg.tipo === 'J') {
      return {
        ...t,
        nombre_empresa   : reg.nombre_completo,
        nombre_cliente   : '',
        primer_apellido  : '',
        segundo_apellido : '',
      }
    } else {
      // Formato padrón persona física: "NOMBRE AP1 AP2"
      const parts = (reg.nombre_completo || '').trim().split(/\s+/)
      const ap2   = parts.length >= 3 ? parts[parts.length - 1] : ''
      const ap1   = parts.length >= 2 ? parts[parts.length - 2] : ''
      const nomb  = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(' ') : (parts[0] || '')
      return {
        ...t,
        nombre_cliente   : nomb,
        primer_apellido  : ap1,
        segundo_apellido : ap2,
        nombre_empresa   : '',
      }
    }
  })
}

// ─── Obtener tipo de cambio BCCR via Hacienda ────────────────────────────────
export async function fetchTipoCambio() {
  try {
    const res  = await fetch('https://api.hacienda.go.cr/indicadores/tc/dolar', { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    // La API devuelve { venta: { valor: 530.xx }, compra: { valor: 528.xx } }
    const venta  = data?.venta?.valor
    const compra = data?.compra?.valor
    if (venta && compra) return Number(((venta + compra) / 2).toFixed(2))
    if (venta)  return Number(venta)
    if (compra) return Number(compra)
    return null
  } catch {
    return null
  }
}
