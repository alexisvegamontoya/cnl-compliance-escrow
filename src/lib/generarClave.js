/**
 * generarClave.js — contraseñas provisionales fuertes.
 *
 * Se usa donde un administrador tiene que entregarle una contraseña a otra
 * persona (alta de usuario y restablecimiento). Evita los caracteres que se
 * confunden al dictarlas o copiarlas a mano: I, l, 1, O, 0.
 */

const MAYUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MINUS = 'abcdefghijkmnpqrstuvwxyz'
const NUMS  = '23456789'
const SIMS  = '!@#$%*?-_'

/** Entero aleatorio en [0, n) con el generador criptográfico del navegador. */
function azar(n) {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % n
}

/**
 * @param {number} largo  cantidad de caracteres (mínimo 12)
 * @returns {string} contraseña con al menos una mayúscula, minúscula, número y símbolo
 */
export function generarClave(largo = 14) {
  const total = MAYUS + MINUS + NUMS + SIMS
  const n = Math.max(12, largo)

  const chars = [
    MAYUS[azar(MAYUS.length)],
    MINUS[azar(MINUS.length)],
    NUMS[azar(NUMS.length)],
    SIMS[azar(SIMS.length)],
  ]
  while (chars.length < n) chars.push(total[azar(total.length)])

  // Sin la mezcla, los cuatro obligatorios quedarían siempre en el mismo orden.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = azar(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
