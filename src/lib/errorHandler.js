/**
 * errorHandler.js
 * Clasificador de errores operativos vs técnicos
 * Uso: import { clasificarError } from '../lib/errorHandler'
 */

// Códigos PostgreSQL / Supabase que corresponden a errores OPERATIVOS
const CODIGOS_OPERATIVOS = {
  '23505': 'Ya existe un registro con esa información (clave duplicada).',
  '23502': 'Falta completar un campo requerido.',
  '23503': 'Referencia inválida: verifique los datos ingresados.',
  '22001': 'Un campo contiene demasiados caracteres.',
  '22003': 'El valor numérico ingresado está fuera del rango permitido.',
  '22007': 'El formato de fecha ingresado no es válido.',
  '22008': 'La fecha ingresada está fuera del rango permitido.',
  '42501': 'No tiene permisos para realizar esta acción.',
  'PGRST116': 'No se encontraron registros con esos criterios.',
}

// Palabras clave en el mensaje que indican error OPERATIVO
const PALABRAS_OPERATIVO = [
  'duplicate key',
  'unique constraint',
  'not-null constraint',
  'violates not-null',
  'foreign key',
  'check constraint',
  'value too long',
  'out of range',
  'invalid input syntax for type',
  'invalid_text_representation',
  'network',
  'fetch failed',
  'failed to fetch',
  'networkerror',
]

// Palabras clave que indican error TÉCNICO (de programación)
const PALABRAS_TECNICO = [
  'schema cache',
  'column of',
  'does not exist',
  'column',
  'syntax error',
  'undefined_table',
  'undefined_column',
  'relation',
  'permission denied for table',
  'unrecognized',
  'cannot find',
  'invalid identifier',
]

// Mensajes amigables para patrones comunes
function mensajeAmigable(msg) {
  const m = (msg || '').toLowerCase()

  if (m.includes('duplicate key') || m.includes('unique'))
    return 'Ya existe un registro con esa identificación o dato único. Verifique e intente de nuevo.'

  if (m.includes('not-null') || m.includes('violates not-null'))
    return 'Falta completar un campo obligatorio. Revise el formulario.'

  if (m.includes('foreign key'))
    return 'Referencia inválida: el registro al que apunta no existe.'

  if (m.includes('value too long') || m.includes('character varying'))
    return 'Uno de los campos tiene demasiado texto. Reduzca el contenido e intente de nuevo.'

  if (m.includes('invalid input syntax'))
    return 'El formato de un campo es incorrecto (ej: fecha o número inválido).'

  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch'))
    return 'Error de conexión. Verifique su internet e intente nuevamente.'

  if (m.includes('permission denied') || m.includes('42501'))
    return 'No tiene permisos para realizar esta acción. Contacte al administrador.'

  return null
}

/**
 * Clasifica un error de Supabase o JS en operativo o técnico.
 * @param {Error|{message:string, code?:string, details?:string}} error
 * @returns {{ tipo: 'operativo'|'tecnico', mensaje: string }}
 */
export function clasificarError(error) {
  if (!error) return { tipo: 'tecnico', mensaje: 'Error desconocido.' }

  const msg     = error.message || error.toString() || ''
  const code    = error.code    || ''
  const details = error.details || ''
  const hint    = error.hint    || ''
  const msgLow  = (msg + details + hint).toLowerCase()

  // 0. RAISE EXCEPTION de una función nuestra (P0001). El mensaje ya viene
  // redactado para el usuario y explica qué hacer, así que se muestra tal cual.
  if (code === 'P0001' && msg) {
    return { tipo: 'operativo', mensaje: msg }
  }

  // 1. Verificar por código PostgreSQL conocido como operativo
  if (CODIGOS_OPERATIVOS[code]) {
    const amigable = mensajeAmigable(msg)
    return { tipo: 'operativo', mensaje: amigable || CODIGOS_OPERATIVOS[code] }
  }

  // 2. Verificar si el mensaje contiene palabras técnicas → error de programación
  const esTecnico = PALABRAS_TECNICO.some(p => msgLow.includes(p))
  if (esTecnico) {
    return { tipo: 'tecnico', mensaje: msg }
  }

  // 3. Verificar si el mensaje contiene palabras operativas → error de usuario
  const esOperativo = PALABRAS_OPERATIVO.some(p => msgLow.includes(p))
  if (esOperativo) {
    const amigable = mensajeAmigable(msg)
    return { tipo: 'operativo', mensaje: amigable || msg }
  }

  // 4. Error de red / conexión
  if (error instanceof TypeError && msg.toLowerCase().includes('fetch')) {
    return { tipo: 'operativo', mensaje: 'Error de conexión. Verifique su internet e intente nuevamente.' }
  }

  // 5. Por defecto: técnico
  return { tipo: 'tecnico', mensaje: msg }
}
