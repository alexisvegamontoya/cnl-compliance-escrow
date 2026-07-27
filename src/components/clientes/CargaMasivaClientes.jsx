/**
 * CargaMasivaClientes.jsx
 * Carga masiva de clientes desde Excel.
 * Genera plantilla descargable (datos del cliente + estructura de personas
 * relacionadas) y procesa el archivo subido.
 */
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import {
  ACTIVIDADES_PROFESIONES,
  PROVINCIAS_CR,
  CANTONES_CR,
  PAISES_RIESGO,
} from '../../lib/metodologiaRiesgo'
import {
  COLUMNAS_DOCUMENTOS,
  TODOS_LOS_DOCUMENTOS,
  TITULOS_GRUPO,
  checklistDesdeFilaExcel,
} from '../../lib/checklistDocumental'

// ─── Utilidades ──────────────────────────────────────────────────────────────
// Identificación normalizada (sin guiones/espacios) para hacer match entre hojas
const normId = (v) => String(v ?? '').trim().replace(/[\s-]/g, '').toLowerCase()

// Texto sin tildes, minúsculas — para comparar valores de catálogo
const RE_DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
const sinTildes = (v) => String(v ?? '')
  .normalize('NFD').replace(RE_DIACRITICOS, '')
  .toLowerCase().trim()

function normalizarFecha(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)      // DD/MM/YYYY
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)        // DD-MM-YYYY
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  return null
}

const esSi = (v) => ['si', 'sí', 's', 'true', '1', 'x', 'yes'].includes(sinTildes(v))

const txt = (v) => String(v ?? '').trim()

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return isNaN(n) ? null : n
}

// ─── Columnas de la hoja "Clientes" ──────────────────────────────────────────
// Orden y nombre exacto que tendrá el Excel
const COLUMNAS = [
  { key: 'tipo_persona',         grupo: 'General',   ejemplo: 'fisica',                 req: true,  nota: 'fisica | juridica' },
  { key: 'tipo_identificacion',  grupo: 'General',   ejemplo: '1',                      req: true,  nota: '1=Cédula 3=DIMEX 5=Pasaporte 2=Cédula Jurídica 4=Otro' },
  { key: 'numero_identificacion',grupo: 'General',   ejemplo: '1-0234-0567',            req: true,  nota: 'Debe ser único. Se usa para enlazar la hoja "Estructura"' },
  // Persona física
  { key: 'nombre_cliente',       grupo: 'Física',    ejemplo: 'María',                  req: false, nota: 'Solo persona física' },
  { key: 'primer_apellido',      grupo: 'Física',    ejemplo: 'Rodríguez',              req: false, nota: 'Solo persona física' },
  { key: 'segundo_apellido',     grupo: 'Física',    ejemplo: 'Mora',                   req: false, nota: 'Solo persona física' },
  { key: 'fecha_nacimiento',     grupo: 'Física',    ejemplo: '1985-06-15',             req: false, nota: 'Solo persona física · YYYY-MM-DD o DD/MM/YYYY' },
  { key: 'genero',               grupo: 'Física',    ejemplo: 'F',                      req: false, nota: 'Solo persona física · M | F | otro' },
  { key: 'estado_civil',         grupo: 'Física',    ejemplo: 'Casado/a',               req: false, nota: 'Soltero/a | Casado/a | Divorciado/a | Viudo/a | Unión libre' },
  { key: 'pais_nacimiento',      grupo: 'Física',    ejemplo: 'Costa Rica',             req: false, nota: 'Solo persona física · Ver hoja "Países"' },
  // Persona jurídica
  { key: 'nombre_empresa',       grupo: 'Jurídica',  ejemplo: 'Empresa XYZ S.A.',       req: false, nota: 'Razón social — obligatorio si tipo_persona = juridica' },
  { key: 'cedula_juridica',      grupo: 'Jurídica',  ejemplo: '3-101-123456',           req: false, nota: 'Solo persona jurídica · si se deja vacío se usa numero_identificacion' },
  { key: 'pais_constitucion',    grupo: 'Jurídica',  ejemplo: 'Costa Rica',             req: false, nota: 'Solo persona jurídica · Ver hoja "Países"' },
  { key: 'fecha_constitucion',   grupo: 'Jurídica',  ejemplo: '2010-03-22',             req: false, nota: 'Solo persona jurídica · YYYY-MM-DD o DD/MM/YYYY' },
  // Actividad
  { key: 'actividad_economica',  grupo: 'Actividad', ejemplo: 'Comercio al por menor',  req: false, nota: 'Actividad económica (jurídica) o profesión/oficio (física) · Ver hoja "Actividades"' },
  // Ubicación
  { key: 'pais_ubicacion',       grupo: 'Ubicación', ejemplo: 'Costa Rica',             req: false, nota: 'País de residencia / ubicación actual · Ver hoja "Países"' },
  { key: 'provincia',            grupo: 'Ubicación', ejemplo: 'San José',               req: false, nota: 'Ver hoja "Provincias"' },
  { key: 'canton',               grupo: 'Ubicación', ejemplo: 'Escazú',                 req: false, nota: 'Ver hoja "Cantones" (debe pertenecer a la provincia)' },
  { key: 'direccion_exacta',     grupo: 'Ubicación', ejemplo: 'Del Banco Nacional 100m norte', req: false, nota: '' },
  // Contacto
  { key: 'nombre_contacto',      grupo: 'Contacto',  ejemplo: 'Ana Jiménez',            req: false, nota: 'Persona de contacto (típicamente en empresas)' },
  { key: 'telefono',             grupo: 'Contacto',  ejemplo: '8888-8888',              req: false, nota: '' },
  { key: 'correo_electronico',   grupo: 'Contacto',  ejemplo: 'correo@ejemplo.com',     req: false, nota: '' },
  { key: 'fecha_vinculacion',    grupo: 'Contacto',  ejemplo: '2024-01-15',             req: false, nota: 'YYYY-MM-DD o DD/MM/YYYY · si se deja vacío se usa la fecha de hoy' },
  // Perfil financiero
  { key: 'proposito_relacion',   grupo: 'Perfil',    ejemplo: 'Servicios contables',    req: false, nota: 'Propósito de la relación comercial (Art. 29, SUGEF 13-19)' },
  { key: 'origen_fondos',        grupo: 'Perfil',    ejemplo: 'Salario / planilla',     req: false, nota: 'Salario / planilla | Negocio propio | Venta de bienes | Inversiones | Herencia | Remesas | Pensión | Préstamo | Otro' },
  { key: 'ingreso_mensual_est',  grupo: 'Perfil',    ejemplo: '2500',                   req: false, nota: 'Monto en USD (solo números)' },
  { key: 'notas',                grupo: 'Perfil',    ejemplo: 'Cliente referido por...',req: false, nota: 'Uso interno del oficial de cumplimiento' },
  // Documentación presentada (checklist SUGEF 13-19) — SI / NO / NA
  ...COLUMNAS_DOCUMENTOS.map(c => ({ ...c, grupo: 'Documentos' })),
].map(c => ({ ...c, label: c.key }))

// ─── Columnas de la hoja "Estructura" ────────────────────────────────────────
// Representantes legales, junta directiva, socios/accionistas y beneficiarios finales
const COLUMNAS_ESTRUCTURA = [
  { key: 'numero_identificacion_cliente', ejemplo: '3-101-123456',   req: true,  nota: 'Identificación del CLIENTE (hoja "Clientes") al que pertenece esta persona' },
  { key: 'tipo_relacion',                 ejemplo: 'representante_legal', req: true, nota: 'representante_legal | junta_directiva | socio' },
  { key: 'tipo_entidad',                  ejemplo: 'persona_fisica', req: true,  nota: 'persona_fisica | persona_juridica' },
  { key: 'nombre',                        ejemplo: 'Juan Pérez Mora',req: true,  nota: 'Nombre completo o razón social' },
  { key: 'tipo_id',                       ejemplo: 'Cédula',         req: false, nota: 'Cédula | DIMEX | Pasaporte | Cédula Jurídica | Otro' },
  { key: 'identificacion',                ejemplo: '1-1234-5678',    req: false, nota: 'Recomendado: se usa para enlazar sub-estructuras (columna pertenece_a)' },
  { key: 'nacionalidad',                  ejemplo: 'Costa Rica',     req: false, nota: 'Solo persona física · Ver hoja "Países"' },
  { key: 'pais_residencia',               ejemplo: 'Costa Rica',     req: false, nota: 'Solo persona física · Ver hoja "Países"' },
  { key: 'correo',                        ejemplo: 'juan@ejemplo.com', req: false, nota: '' },
  { key: 'telefono',                      ejemplo: '8888-8888',      req: false, nota: '' },
  { key: 'cargo',                         ejemplo: 'Presidente',     req: false, nota: 'Junta directiva: Presidente | Vicepresidente | Secretario | Tesorero | Vocal | Fiscal | Otro' },
  { key: 'porcentaje_participacion',      ejemplo: '60',             req: false, nota: 'Solo socios/accionistas · 0 a 100' },
  { key: 'es_beneficiario_final',         ejemplo: 'SI',             req: false, nota: 'SI | NO — marque SÍ en la persona física última de la cadena' },
  { key: 'pertenece_a',                   ejemplo: '',               req: false, nota: 'Vacío = depende del cliente. Si es socio de una EMPRESA socia, ponga aquí la identificación de esa empresa (columna identificacion de otra fila)' },
  { key: 'notas',                         ejemplo: '',               req: false, nota: '' },
].map(c => ({ ...c, label: c.key }))

const FILAS_EJEMPLO_ESTRUCTURA = [
  ['3-101-123456', 'representante_legal', 'persona_fisica',   'Juan Pérez Mora',    'Cédula',          '1-1234-5678', 'Costa Rica', 'Costa Rica', 'juan@ejemplo.com', '8888-8888', 'Apoderado Generalísimo', '',   'NO', '',            ''],
  ['3-101-123456', 'junta_directiva',     'persona_fisica',   'Ana Solís Vargas',   'Cédula',          '2-2345-6789', 'Costa Rica', 'Costa Rica', '',                 '',          'Presidente',             '',   'NO', '',            ''],
  ['3-101-123456', 'socio',               'persona_fisica',   'Juan Pérez Mora',    'Cédula',          '1-1234-5678', 'Costa Rica', 'Costa Rica', '',                 '',          '',                       '40', 'SI', '',            'Beneficiario final directo'],
  ['3-101-123456', 'socio',               'persona_juridica', 'Holding ABC S.A.',   'Cédula Jurídica', '3-101-999888', '',          '',           '',                 '',          '',                       '60', 'NO', '',            'Socia empresa — se detalla abajo'],
  ['3-101-123456', 'socio',               'persona_fisica',   'Laura Gómez Rojas',  'Cédula',          '3-3456-7890', 'Costa Rica', 'Costa Rica', '',                 '',          '',                       '100','SI', '3-101-999888', 'Socia de Holding ABC S.A. → beneficiario final'],
]

const RELACIONES_VALIDAS = ['representante_legal', 'junta_directiva', 'socio']

function normRelacion(v) {
  const s = sinTildes(v).replace(/[\s/]+/g, '_')
  if (!s) return ''
  if (s.startsWith('repres') || s.includes('apoderado')) return 'representante_legal'
  if (s.startsWith('junta') || s.includes('directiv')) return 'junta_directiva'
  if (s.startsWith('socio') || s.startsWith('accionista')) return 'socio'
  return ''
}

function normEntidad(v) {
  const s = sinTildes(v)
  if (!s) return 'persona_fisica'
  if (s.includes('jurid') || s.includes('empresa') || s.includes('sociedad')) return 'persona_juridica'
  return 'persona_fisica'
}

// ─── Generador de plantilla Excel ────────────────────────────────────────────
function generarPlantilla() {
  const wb = XLSX.utils.book_new()

  // Hoja 1: Clientes (encabezados + fila ejemplo + fila notas)
  const wsData = [
    COLUMNAS.map(c => c.label),
    COLUMNAS.map(c => c.ejemplo),
    COLUMNAS.map(c => c.nota ? `[${c.nota}]` : ''),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = COLUMNAS.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')

  // Hoja 2: Estructura (personas relacionadas de las personas jurídicas)
  const wsEstr = XLSX.utils.aoa_to_sheet([
    COLUMNAS_ESTRUCTURA.map(c => c.label),
    ...FILAS_EJEMPLO_ESTRUCTURA,
    COLUMNAS_ESTRUCTURA.map(c => c.nota ? `[${c.nota}]` : ''),
  ])
  wsEstr['!cols'] = COLUMNAS_ESTRUCTURA.map(() => ({ wch: 24 }))
  XLSX.utils.book_append_sheet(wb, wsEstr, 'Estructura')

  // Hoja 3: Actividades
  const wsAct = XLSX.utils.aoa_to_sheet([
    ['actividad_economica', 'nivel_riesgo'],
    ...ACTIVIDADES_PROFESIONES.map(a => [a.label, a.valor === 1 ? 'Bajo' : a.valor === 2 ? 'Medio' : 'Alto'])
  ])
  wsAct['!cols'] = [{ wch: 50 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsAct, 'Actividades')

  // Hoja 4: Provincias
  const wsProv = XLSX.utils.aoa_to_sheet([
    ['provincia'],
    ...PROVINCIAS_CR.map(p => [p])
  ])
  XLSX.utils.book_append_sheet(wb, wsProv, 'Provincias')

  // Hoja 5: Cantones
  const wsCant = XLSX.utils.aoa_to_sheet([
    ['provincia', 'canton'],
    ...CANTONES_CR.map(c => [c.provincia, c.canton])
  ])
  wsCant['!cols'] = [{ wch: 18 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsCant, 'Cantones')

  // Hoja 6: Países
  const wsPaises = XLSX.utils.aoa_to_sheet([
    ['pais', 'nivel_riesgo'],
    ...PAISES_RIESGO.map(p => [p.pais, p.valor === 1 ? 'Bajo' : p.valor === 2 ? 'Medio' : 'Alto'])
  ])
  wsPaises['!cols'] = [{ wch: 30 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsPaises, 'Países')

  // Hoja 7: Documentos (checklist de documentación presentada)
  const wsDocs = XLSX.utils.aoa_to_sheet([
    ['columna', 'documento / verificación', 'aplica a', 'obligatorio', 'valores aceptados'],
    ...TODOS_LOS_DOCUMENTOS.map(d => [
      `doc_${d.id}`,
      d.label,
      TITULOS_GRUPO[d.grupo],
      d.required ? 'Sí' : 'No',
      'SI | NO | NA',
    ]),
  ])
  wsDocs['!cols'] = [{ wch: 24 }, { wch: 62 }, { wch: 34 }, { wch: 12 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsDocs, 'Documentos')

  // Hoja 8: Instrucciones
  const wsInstr = XLSX.utils.aoa_to_sheet([
    ['PLANTILLA DE CARGA MASIVA DE CLIENTES — CNL Compliance'],
    [''],
    ['Hoja "Clientes"'],
    ['  · Una fila por cliente. La fila 2 es un ejemplo y la última fila entre corchetes [] son instrucciones:'],
    ['    el sistema las ignora automáticamente, pero puede eliminarlas si lo prefiere.'],
    ['  · Complete solo las columnas del grupo que corresponda: las columnas "Solo persona física" se ignoran'],
    ['    cuando tipo_persona = juridica, y viceversa.'],
    ['  · numero_identificacion debe ser único: si el cliente ya existe en el sistema, sus datos se actualizan.'],
    [''],
    ['Hoja "Estructura" (representantes legales, junta directiva, socios y beneficiarios finales)'],
    ['  · Una fila por persona relacionada. Aplica a clientes con tipo_persona = juridica.'],
    ['  · numero_identificacion_cliente debe coincidir con el numero_identificacion de la hoja "Clientes".'],
    ['  · Cadena de propiedad: si un socio es una empresa, registre esa empresa con tipo_entidad = persona_juridica'],
    ['    y luego registre a sus socios en filas nuevas poniendo en "pertenece_a" la identificación de esa empresa.'],
    ['    Puede repetir el proceso tantos niveles como sea necesario hasta llegar a la persona física.'],
    ['  · Marque es_beneficiario_final = SI en la persona física última de cada cadena.'],
    ['  · Al importar, la estructura registrada en el archivo REEMPLAZA la estructura que el cliente tuviera guardada.'],
    [''],
    ['Documentación presentada — columnas "doc_..." de la hoja "Clientes"'],
    ['  · Indique con SI / NO / NA si el cliente ya entregó cada documento del checklist de debida diligencia.'],
    ['      SI = documento disponible en el expediente'],
    ['      NO = documento pendiente o no disponible'],
    ['      NA = no aplica para este cliente (sale del cálculo)'],
    ['      vacío = pendiente (no modifica lo ya registrado como "no aplica")'],
    ['  · Es el MISMO checklist que se completa en el módulo de Debida Diligencia y el que se muestra al'],
    ['    consultar al cliente en la sección "Documentación presentada".'],
    ['  · Las columnas doc_personeria, doc_acta, doc_nomina, doc_id_socios, doc_bene_final y doc_estados_fin'],
    ['    solo aplican a clientes con tipo_persona = juridica.'],
    ['  · Las columnas doc_aprobacion_jd, doc_decl_jurada_pep, doc_monitoreo_ref y doc_revision_anual'],
    ['    solo aplican a clientes marcados como PEP.'],
    ['  · Este checklist es el componente de mayor peso (60%) en la calificación de cumplimiento del cliente.'],
    ['  · Ver la hoja "Documentos" para el detalle de cada columna.'],
    [''],
    ['Hojas de referencia: Documentos, Actividades, Provincias, Cantones y Países contienen los valores aceptados.'],
  ])
  wsInstr['!cols'] = [{ wch: 120 }]
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')

  XLSX.writeFile(wb, 'Plantilla_Clientes_CNL.xlsx')
}

// ─── Normalizar fila de Excel a payload Supabase ─────────────────────────────
function normalizarFila(fila, tenantId, previo = {}) {
  const tipo = sinTildes(fila.tipo_persona) === 'juridica' ? 'juridica' : 'fisica'
  const actNombre = txt(fila.actividad_economica)
  const actObj = ACTIVIDADES_PROFESIONES.find(a => sinTildes(a.label) === sinTildes(actNombre))
  // Las columnas doc_* vacías no borran lo que el cliente ya tuviera registrado
  const docsExcel = checklistDesdeFilaExcel(fila)
  const checklist = { ...(previo.checklist || {}), ...docsExcel }

  return {
    tenant_id: tenantId,
    tipo_persona: tipo,
    tipo_identificacion: String(fila.tipo_identificacion || (tipo === 'juridica' ? '2' : '1')).trim(),
    numero_identificacion: txt(fila.numero_identificacion),
    nombre_cliente:   tipo === 'fisica'   ? txt(fila.nombre_cliente) : '',
    primer_apellido:  tipo === 'fisica'   ? txt(fila.primer_apellido) : '',
    segundo_apellido: tipo === 'fisica'   ? txt(fila.segundo_apellido) : '',
    nombre_empresa:   tipo === 'juridica' ? txt(fila.nombre_empresa) : '',
    cedula_juridica:  tipo === 'juridica' ? (txt(fila.cedula_juridica) || txt(fila.numero_identificacion)) : null,
    fecha_nacimiento: tipo === 'fisica' ? normalizarFecha(fila.fecha_nacimiento) : null,
    genero:           tipo === 'fisica' ? (txt(fila.genero) || null) : null,
    estado_civil:     tipo === 'fisica' ? (txt(fila.estado_civil) || null) : null,
    pais_nacimiento:  tipo === 'fisica' ? (txt(fila.pais_nacimiento) || null) : null,
    pais_constitucion:  tipo === 'juridica' ? (txt(fila.pais_constitucion) || null) : null,
    fecha_constitucion: tipo === 'juridica' ? normalizarFecha(fila.fecha_constitucion) : null,
    actividad_economica:  actNombre || null,
    actividad_eco_nombre: actNombre || null,
    actividad_eco_valor:  actObj?.valor || null,
    profesion_nombre: tipo === 'fisica' ? (actNombre || null) : null,
    profesion_valor:  tipo === 'fisica' ? (actObj?.valor || null) : null,
    pais_ubicacion:   txt(fila.pais_ubicacion) || null,
    pais_residencia:  txt(fila.pais_ubicacion) || null,
    provincia:        txt(fila.provincia) || null,
    canton:           txt(fila.canton) || null,
    direccion_exacta: txt(fila.direccion_exacta) || null,
    nombre_contacto:  txt(fila.nombre_contacto) || null,
    telefono:         txt(fila.telefono) || null,
    correo_electronico: txt(fila.correo_electronico) || null,
    fecha_vinculacion:  normalizarFecha(fila.fecha_vinculacion) || new Date().toISOString().slice(0, 10),
    proposito_relacion: txt(fila.proposito_relacion) || null,
    origen_fondos:      txt(fila.origen_fondos) || null,
    ingreso_mensual_est: num(fila.ingreso_mensual_est),
    notas:   txt(fila.notas) || null,
    activo:  true,
    estado_dd:          'pendiente',
    estado_listas:      'pendiente',
    estado_calificacion:'pendiente',
    // Documentación presentada (columnas doc_*) — mismo checklist de la debida diligencia
    checklist_documental:     checklist,
    checklist_actualizado_en: Object.keys(docsExcel).length > 0
      ? new Date().toISOString().slice(0, 10)
      : (previo.fecha || null),
  }
}

// ─── Validar fila de cliente ─────────────────────────────────────────────────
function validarFila(fila, idx) {
  const errores = []
  const tipo = sinTildes(fila.tipo_persona)

  if (!['fisica', 'juridica'].includes(tipo))
    errores.push('tipo_persona debe ser "fisica" o "juridica"')
  if (!fila.numero_identificacion)
    errores.push('numero_identificacion es obligatorio')
  if (tipo === 'fisica' && !fila.nombre_cliente)
    errores.push('nombre_cliente es obligatorio para persona física')
  if (tipo === 'juridica' && !fila.nombre_empresa)
    errores.push('nombre_empresa es obligatorio para persona jurídica')
  if (fila.fecha_nacimiento && !normalizarFecha(fila.fecha_nacimiento))
    errores.push('fecha_nacimiento inválida (use YYYY-MM-DD o DD/MM/YYYY)')
  if (fila.fecha_constitucion && !normalizarFecha(fila.fecha_constitucion))
    errores.push('fecha_constitucion inválida (use YYYY-MM-DD o DD/MM/YYYY)')
  if (fila.fecha_vinculacion && !normalizarFecha(fila.fecha_vinculacion))
    errores.push('fecha_vinculacion inválida (use YYYY-MM-DD o DD/MM/YYYY)')

  return errores.length > 0 ? { fila: idx + 1, errores } : null
}

// ─── Validar hoja de estructura ──────────────────────────────────────────────
// clientesPorId: Map(normId → { tipo_persona })
function validarEstructura(filasEstr, clientesPorId) {
  const errores = []

  filasEstr.forEach((f, i) => {
    const errs = []
    const idCliente = normId(f.numero_identificacion_cliente)
    const cliente = clientesPorId.get(idCliente)

    if (!idCliente) errs.push('numero_identificacion_cliente es obligatorio')
    else if (!cliente) errs.push(`no existe el cliente "${txt(f.numero_identificacion_cliente)}" en la hoja Clientes`)
    else if (cliente.tipo_persona === 'fisica') errs.push('las personas relacionadas solo aplican a clientes con tipo_persona = juridica')

    if (!normRelacion(f.tipo_relacion))
      errs.push(`tipo_relacion debe ser: ${RELACIONES_VALIDAS.join(' | ')}`)
    if (!txt(f.nombre))
      errs.push('nombre es obligatorio')

    const pct = f.porcentaje_participacion
    if (txt(pct) !== '') {
      const v = num(pct)
      if (v === null || v < 0 || v > 100) errs.push('porcentaje_participacion debe estar entre 0 y 100')
    }

    // Validar la cadena pertenece_a (padre existente, del mismo cliente, empresa y sin ciclos)
    const padreId = normId(f.pertenece_a)
    if (padreId) {
      const hermanas = filasEstr.filter(r => normId(r.numero_identificacion_cliente) === idCliente)
      const padre = hermanas.find(r => normId(r.identificacion) === padreId)
      if (!padre) {
        errs.push(`pertenece_a "${txt(f.pertenece_a)}" no coincide con la identificacion de ninguna otra fila del mismo cliente`)
      } else if (normEntidad(padre.tipo_entidad) !== 'persona_juridica') {
        errs.push('pertenece_a debe apuntar a una fila con tipo_entidad = persona_juridica')
      } else {
        // Detectar ciclos subiendo por la cadena
        const vistos = new Set([normId(f.identificacion)])
        let actual = padre
        let vueltas = 0
        while (actual && vueltas < 20) {
          const idActual = normId(actual.identificacion)
          if (vistos.has(idActual)) { errs.push('pertenece_a genera una referencia circular'); break }
          vistos.add(idActual)
          const sigId = normId(actual.pertenece_a)
          if (!sigId) break
          actual = hermanas.find(r => normId(r.identificacion) === sigId)
          vueltas++
        }
      }
    }

    if (errs.length) errores.push({ fila: i + 1, errores: errs })
  })

  return errores
}

// ─── Construir árbol de personas relacionadas de un cliente ──────────────────
function construirPersonas(filasCliente) {
  const nodos = filasCliente.map(f => ({
    id: crypto.randomUUID(),
    tipo_relacion: normRelacion(f.tipo_relacion),
    tipo_entidad: normEntidad(f.tipo_entidad),
    nombre: txt(f.nombre),
    identificacion: txt(f.identificacion) || null,
    tipo_id: txt(f.tipo_id) || null,
    nacionalidad: txt(f.nacionalidad) || null,
    pais_residencia: txt(f.pais_residencia) || null,
    correo: txt(f.correo) || null,
    telefono: txt(f.telefono) || null,
    cargo: txt(f.cargo) || null,
    porcentaje_participacion: normRelacion(f.tipo_relacion) === 'socio' ? num(f.porcentaje_participacion) : null,
    es_beneficiario_final: esSi(f.es_beneficiario_final),
    notas: txt(f.notas) || null,
    sub_personas: [],
    _padre: normId(f.pertenece_a),
    _id: normId(f.identificacion),
  }))

  const porId = new Map()
  nodos.forEach(n => { if (n._id && !porId.has(n._id)) porId.set(n._id, n) })

  const raiz = []
  nodos.forEach(n => {
    const padre = n._padre ? porId.get(n._padre) : null
    if (padre && padre !== n) padre.sub_personas.push(n)
    else raiz.push(n)
  })

  // Limpiar campos auxiliares
  const limpiar = (n) => {
    const { _padre, _id, ...resto } = n
    return { ...resto, sub_personas: n.sub_personas.map(limpiar) }
  }
  return raiz.map(limpiar)
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CargaMasivaClientes({ onClose, onCargaCompleta }) {
  const { tenant, isSuperAdmin, tenantsDisponibles } = useAuth()
  const inputRef = useRef(null)

  const [selectedTenantId, setSelectedTenantId] = useState(tenant?.id || '')
  const [filas, setFilas]       = useState([])        // datos parseados (hoja Clientes)
  const [errores, setErrores]   = useState([])        // errores de validación (hoja Clientes)
  const [estructura, setEstructura] = useState([])    // datos parseados (hoja Estructura)
  const [erroresEstr, setErroresEstr] = useState([])  // errores de validación (hoja Estructura)
  const [paso, setPaso]         = useState('inicio')  // inicio | preview | cargando | resultado
  const [resultado, setResultado] = useState(null)    // { ok, fallidos, personas, personasError }
  const [archivoNombre, setArchivoNombre] = useState('')
  const [ingresoMasivo, setIngresoMasivo] = useState('')  // valor a aplicar a todas las filas

  const tenantEfectivo = isSuperAdmin
    ? tenantsDisponibles?.find(t => t.id === selectedTenantId)
    : tenant

  const hayErrores = errores.length > 0 || erroresEstr.length > 0

  // Cuántas personas relacionadas trae cada cliente (por identificación normalizada)
  const personasPorCliente = estructura.reduce((acc, f) => {
    const k = normId(f.numero_identificacion_cliente)
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  // Parsear Excel subido
  const handleArchivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivoNombre(file.name)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result)
      const wb = XLSX.read(data, { type: 'array', cellDates: true })

      // Ignora la fila de notas (celdas entre corchetes) y las filas totalmente vacías
      const leerHoja = (nombreHoja, campoClave) => {
        const nombre = wb.SheetNames.find(n => sinTildes(n).startsWith(nombreHoja))
        if (!nombre) return []
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { defval: '', raw: false })
        return raw.filter(r => {
          const valores = Object.values(r).map(v => String(v ?? '').trim())
          if (valores.every(v => v === '')) return false
          if (valores.some(v => v.startsWith('['))) return false
          return txt(r[campoClave]) !== ''
        })
      }

      // Hoja de clientes: por nombre, con respaldo a la primera hoja del libro
      let filasDatos = leerHoja('clientes', 'numero_identificacion')
      if (filasDatos.length === 0 && !wb.SheetNames.some(n => sinTildes(n).startsWith('clientes'))) {
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
        filasDatos = raw.filter(r => {
          const valores = Object.values(r).map(v => String(v ?? '').trim())
          return !valores.every(v => v === '') && !valores.some(v => v.startsWith('[')) && txt(r.numero_identificacion) !== ''
        })
      }

      const filasEstr = leerHoja('estructura', 'nombre')

      // Validar
      const errs = filasDatos.map((f, i) => validarFila(f, i)).filter(Boolean)

      const clientesPorId = new Map()
      filasDatos.forEach(f => {
        clientesPorId.set(normId(f.numero_identificacion), {
          tipo_persona: sinTildes(f.tipo_persona) === 'juridica' ? 'juridica' : 'fisica',
        })
      })
      const errsEstr = validarEstructura(filasEstr, clientesPorId)

      setFilas(filasDatos)
      setErrores(errs)
      setEstructura(filasEstr)
      setErroresEstr(errsEstr)
      setPaso('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  // Insertar en Supabase
  const handleCargar = async () => {
    if (hayErrores) return
    if (!tenantEfectivo?.id) return
    setPaso('cargando')

    // Checklist ya registrado de los clientes que se van a actualizar:
    // las columnas doc_* del Excel se fusionan sobre él, nunca lo reemplazan por completo
    const previos = new Map()
    const identificaciones = filas.map(f => txt(f.numero_identificacion)).filter(Boolean)
    for (let i = 0; i < identificaciones.length; i += 200) {
      const { data } = await supabase.from('clientes')
        .select('numero_identificacion, checklist_documental, checklist_actualizado_en')
        .eq('tenant_id', tenantEfectivo.id)
        .in('numero_identificacion', identificaciones.slice(i, i + 200))
      ;(data || []).forEach(r => previos.set(normId(r.numero_identificacion), {
        checklist: r.checklist_documental || {},
        fecha:     r.checklist_actualizado_en || null,
      }))
    }

    const payloads = filas.map(f =>
      normalizarFila(f, tenantEfectivo.id, previos.get(normId(f.numero_identificacion)) || {})
    )
    const LOTE = 50
    let ok = 0
    const fallidos = []
    const idsPorIdentificacion = new Map()   // normId → cliente_id

    const registrarIds = (rows) => {
      (rows || []).forEach(r => idsPorIdentificacion.set(normId(r.numero_identificacion), r.id))
    }

    for (let i = 0; i < payloads.length; i += LOTE) {
      const lote = payloads.slice(i, i + LOTE)
      const { data, error } = await supabase.from('clientes')
        .upsert(lote, { onConflict: 'tenant_id,numero_identificacion' })
        .select('id, numero_identificacion')
      if (error) {
        // Upsert uno por uno para identificar cuáles fallan
        for (let j = 0; j < lote.length; j++) {
          const { data: d2, error: e2 } = await supabase.from('clientes')
            .upsert(lote[j], { onConflict: 'tenant_id,numero_identificacion' })
            .select('id, numero_identificacion')
          if (e2) fallidos.push({ fila: i + j + 1, razon: e2.message })
          else { ok++; registrarIds(d2) }
        }
      } else {
        ok += lote.length
        registrarIds(data)
      }
    }

    // ── Personas relacionadas (estructura) ──
    let personasOk = 0
    const personasError = []

    if (estructura.length > 0) {
      // Agrupar filas de estructura por cliente
      const porCliente = new Map()
      estructura.forEach(f => {
        const k = normId(f.numero_identificacion_cliente)
        if (!porCliente.has(k)) porCliente.set(k, [])
        porCliente.get(k).push(f)
      })

      const registros = []
      const clienteIdsConEstructura = []

      porCliente.forEach((filasCliente, k) => {
        const clienteId = idsPorIdentificacion.get(k)
        if (!clienteId) {
          personasError.push({ cliente: txt(filasCliente[0].numero_identificacion_cliente), razon: 'el cliente no se pudo importar' })
          return
        }
        clienteIdsConEstructura.push(clienteId)
        construirPersonas(filasCliente).forEach((p, orden) => {
          registros.push({
            tenant_id: tenantEfectivo.id,
            cliente_id: clienteId,
            tipo_relacion: p.tipo_relacion,
            tipo_entidad: p.tipo_entidad,
            nombre: p.nombre,
            identificacion: p.identificacion,
            tipo_id: p.tipo_id,
            nacionalidad: p.nacionalidad,
            pais_residencia: p.pais_residencia,
            correo: p.correo,
            telefono: p.telefono,
            porcentaje_participacion: p.porcentaje_participacion,
            es_beneficiario_final: p.es_beneficiario_final,
            cargo: p.cargo,
            sub_personas: p.sub_personas,
            notas: p.notas,
            orden,
            activo: true,
          })
        })
      })

      // La estructura del archivo reemplaza la existente de esos clientes
      if (clienteIdsConEstructura.length > 0) {
        const { error: errDel } = await supabase.from('clientes_personas_relacionadas')
          .delete()
          .eq('tenant_id', tenantEfectivo.id)
          .in('cliente_id', clienteIdsConEstructura)
        if (errDel) personasError.push({ cliente: '—', razon: `no se pudo limpiar la estructura anterior: ${errDel.message}` })
      }

      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE)
        const { error: errIns } = await supabase.from('clientes_personas_relacionadas').insert(lote)
        if (errIns) personasError.push({ cliente: '—', razon: errIns.message })
        else personasOk += lote.length
      }
    }

    setResultado({ ok, fallidos, personas: personasOk, personasError })
    setPaso('resultado')
    if (ok > 0) onCargaCompleta()
  }

  // Editar el ingreso mensual de una fila desde la vista previa
  const actualizarIngreso = (idx, valor) => {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, ingreso_mensual_est: valor } : f))
  }

  // Aplicar un mismo ingreso a todas las filas de la vista previa
  const aplicarIngresoATodos = () => {
    if (ingresoMasivo === '') return
    setFilas(prev => prev.map(f => ({ ...f, ingreso_mensual_est: ingresoMasivo })))
  }

  const reset = () => {
    setFilas([]); setErrores([]); setPaso('inicio'); setResultado(null); setArchivoNombre('')
    setEstructura([]); setErroresEstr([])
    setIngresoMasivo('')
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Render ──
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📥 Carga masiva de clientes</h2>
            <p className="text-xs text-gray-500">Importe múltiples clientes desde un archivo Excel</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── PASO: INICIO ── */}
          {paso === 'inicio' && (
            <div className="space-y-6">
              {/* Paso 1: descargar plantilla */}
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800">Paso 1 — Descargue la plantilla</p>
                <p className="text-xs text-blue-700">
                  La plantilla contiene <strong>todos los campos del expediente del cliente</strong> (persona física y jurídica) en la hoja
                  «Clientes», y una hoja «Estructura» para registrar representantes legales, junta directiva, socios/accionistas
                  y beneficiarios finales. Incluye además hojas de referencia con documentos, actividades económicas, provincias, cantones y países.
                </p>
                <p className="text-xs text-blue-700">
                  Las <strong>{COLUMNAS_DOCUMENTOS.length} columnas <code>doc_…</code></strong> al final de la hoja «Clientes» permiten indicar
                  con <strong>SI / NO / NA</strong> qué documentos del checklist ya presentó el cliente. Es el mismo checklist de la
                  Debida Diligencia y pesa un 60% en la calificación de cumplimiento del cliente.
                </p>
                <p className="text-xs text-blue-700">
                  La fila 2 es un ejemplo y la fila con corchetes [ ] son instrucciones; elimínelas antes de cargar si lo desea,
                  o déjelas — el sistema las ignora automáticamente.
                </p>
                <button onClick={generarPlantilla}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  ⬇ Descargar Plantilla_Clientes_CNL.xlsx
                </button>
              </div>

              {/* Paso 2 (solo superadmin): sujeto obligado */}
              {isSuperAdmin && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-800">Paso 2 — Seleccione el sujeto obligado</p>
                  <select
                    className="input-field"
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                  >
                    <option value="">— Seleccione el sujeto obligado —</option>
                    {tenantsDisponibles?.map(t => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                  {tenantEfectivo && (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>✓</span>
                      <span>Sujeto obligado: <strong>{tenantEfectivo.nombre}</strong></span>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 3 (o 2 para no-superadmin): subir archivo */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  isSuperAdmin && !tenantEfectivo
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-300 hover:border-brand-400 cursor-pointer'
                }`}
                onClick={() => tenantEfectivo && inputRef.current?.click()}>
                <p className="text-4xl mb-3">📂</p>
                <p className="text-sm font-medium text-gray-700">
                  {archivoNombre || 'Haga clic para seleccionar el archivo Excel'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Formatos: .xlsx, .xls</p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls"
                  className="hidden" onChange={handleArchivo} />
              </div>

              {/* Columnas disponibles */}
              <div className="card space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    Hoja «Clientes» — {COLUMNAS.length} columnas
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {COLUMNAS.map(c => (
                      <div key={c.key} className="flex items-center gap-1.5">
                        {c.req
                          ? <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Obligatorio" />
                          : <span className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                        }
                        <span className="text-xs text-gray-600 font-mono truncate" title={c.nota}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    Hoja «Estructura» — representantes, junta directiva, socios y beneficiarios finales
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {COLUMNAS_ESTRUCTURA.map(c => (
                      <div key={c.key} className="flex items-center gap-1.5">
                        {c.req
                          ? <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Obligatorio" />
                          : <span className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />
                        }
                        <span className="text-xs text-gray-600 font-mono truncate" title={c.nota}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-400">🔴 Obligatorio &nbsp;⚪ Opcional</p>
              </div>
            </div>
          )}

          {/* ── PASO: PREVIEW ── */}
          {paso === 'preview' && (
            <div className="space-y-4">
              {/* Confirmación de sujeto obligado */}
              {tenantEfectivo && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>Cargando en: <strong>{tenantEfectivo.nombre}</strong></span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    📄 {archivoNombre} — {filas.length} cliente{filas.length !== 1 ? 's' : ''}
                    {estructura.length > 0 && ` · ${estructura.length} persona${estructura.length !== 1 ? 's' : ''} relacionada${estructura.length !== 1 ? 's' : ''}`}
                  </p>
                  {hayErrores
                    ? <p className="text-xs text-red-600 mt-0.5">⚠ {errores.length + erroresEstr.length} fila{errores.length + erroresEstr.length !== 1 ? 's' : ''} con errores — corrija el Excel y vuelva a subirlo</p>
                    : <p className="text-xs text-green-600 mt-0.5">✓ Todas las filas son válidas</p>
                  }
                </div>
                <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg">
                  Cambiar archivo
                </button>
              </div>

              {/* Errores de validación — hoja Clientes */}
              {errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-bold text-red-800 mb-1">Hoja «Clientes»</p>
                  {errores.map((e, i) => (
                    <div key={i} className="text-xs text-red-700">
                      <span className="font-semibold">Fila {e.fila}:</span> {e.errores.join('; ')}
                    </div>
                  ))}
                </div>
              )}

              {/* Errores de validación — hoja Estructura */}
              {erroresEstr.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-bold text-red-800 mb-1">Hoja «Estructura»</p>
                  {erroresEstr.map((e, i) => (
                    <div key={i} className="text-xs text-red-700">
                      <span className="font-semibold">Fila {e.fila}:</span> {e.errores.join('; ')}
                    </div>
                  ))}
                </div>
              )}

              {/* Aviso de reemplazo de estructura */}
              {estructura.length > 0 && erroresEstr.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  ⚠ La estructura del archivo <strong>reemplaza</strong> la estructura (representantes, junta directiva y socios)
                  que estos clientes tuvieran registrada previamente.
                </div>
              )}

              {/* Edición masiva del ingreso mensual */}
              <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-xs text-gray-600">
                  Puede ajustar el <strong>ingreso mensual</strong> de cada fila en la tabla, o aplicar un mismo monto a todas:
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={ingresoMasivo}
                  onChange={e => setIngresoMasivo(e.target.value)}
                  placeholder="USD"
                  className="w-28 px-2 py-1 text-xs text-right border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                />
                <button
                  onClick={aplicarIngresoATodos}
                  disabled={ingresoMasivo === ''}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Aplicar a todas ({filas.length})
                </button>
              </div>

              {/* Preview tabla */}
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">#</th>
                      <th className="px-3 py-2 text-left text-gray-500">Tipo</th>
                      <th className="px-3 py-2 text-left text-gray-500">Identificación</th>
                      <th className="px-3 py-2 text-left text-gray-500">Nombre / Razón social</th>
                      <th className="px-3 py-2 text-left text-gray-500">Actividad</th>
                      <th className="px-3 py-2 text-left text-gray-500">País</th>
                      <th className="px-3 py-2 text-left text-gray-500">Correo</th>
                      <th className="px-3 py-2 text-left text-gray-500">Estructura</th>
                      <th className="px-3 py-2 text-left text-gray-500" title="Documentos marcados como disponibles en las columnas doc_*">Docs</th>
                      <th className="px-3 py-2 text-left text-gray-500 whitespace-nowrap">
                        Ingreso mensual (USD) <span className="text-brand-500" title="Editable">✎</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.slice(0, 100).map((f, i) => {
                      const tieneError = errores.some(e => e.fila === i + 1)
                      const tipo = sinTildes(f.tipo_persona)
                      const nombreMostrar = tipo === 'juridica'
                        ? f.nombre_empresa
                        : [f.nombre_cliente, f.primer_apellido, f.segundo_apellido].filter(Boolean).join(' ')
                      const nPersonas = personasPorCliente[normId(f.numero_identificacion)] || 0
                      const docs = checklistDesdeFilaExcel(f)
                      const docsOk = Object.values(docs).filter(d => d.estado === 'disponible').length
                      return (
                        <tr key={i} className={tieneError ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs ${tipo === 'juridica' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                              {tipo === 'juridica' ? '🏢 Jurídica' : '👤 Física'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-gray-600">{f.numero_identificacion}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[180px] truncate">{nombreMostrar || <span className="text-red-400">⚠ Falta nombre</span>}</td>
                          <td className="px-3 py-1.5 text-gray-500 max-w-[140px] truncate">{f.actividad_economica}</td>
                          <td className="px-3 py-1.5 text-gray-500">{f.pais_ubicacion}</td>
                          <td className="px-3 py-1.5 text-gray-500">{f.correo_electronico}</td>
                          <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                            {nPersonas > 0
                              ? <span className="text-brand-700">👥 {nPersonas}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {Object.keys(docs).length > 0
                              ? <span className="text-green-700">📄 {docsOk}/{Object.keys(docs).length}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={f.ingreso_mensual_est ?? ''}
                              onChange={e => actualizarIngreso(i, e.target.value)}
                              placeholder="—"
                              className="w-28 px-2 py-1 text-xs text-right border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                            />
                          </td>
                        </tr>
                      )
                    })}
                    {filas.length > 100 && (
                      <tr><td colSpan={10} className="px-3 py-2 text-center text-gray-400">
                        … y {filas.length - 100} filas más (no editables aquí; use «Aplicar a todas» o corrija el Excel)
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── PASO: CARGANDO ── */}
          {paso === 'cargando' && (
            <div className="text-center py-16">
              <div className="animate-spin text-5xl mb-4">⏳</div>
              <p className="text-gray-700 font-medium">Cargando {filas.length} clientes…</p>
              <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos</p>
            </div>
          )}

          {/* ── PASO: RESULTADO ── */}
          {paso === 'resultado' && resultado && (
            <div className="space-y-4 py-4 text-center">
              <p className="text-5xl">{resultado.fallidos.length === 0 && resultado.personasError.length === 0 ? '✅' : '⚠️'}</p>
              <p className="text-lg font-bold text-gray-900">
                {resultado.ok} cliente{resultado.ok !== 1 ? 's' : ''} importado{resultado.ok !== 1 ? 's' : ''} o actualizado{resultado.ok !== 1 ? 's' : ''} correctamente
              </p>
              {resultado.personas > 0 && (
                <p className="text-sm text-gray-600">
                  👥 {resultado.personas} persona{resultado.personas !== 1 ? 's' : ''} relacionada{resultado.personas !== 1 ? 's' : ''} registrada{resultado.personas !== 1 ? 's' : ''} (representantes, junta directiva y socios)
                </p>
              )}
              {resultado.fallidos.length > 0 && (
                <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-red-700 mb-2">{resultado.fallidos.length} fila{resultado.fallidos.length !== 1 ? 's' : ''} no importada{resultado.fallidos.length !== 1 ? 's' : ''}:</p>
                  {resultado.fallidos.map((f, i) => (
                    <p key={i} className="text-xs text-red-600">Fila {f.fila}: {f.razon}</p>
                  ))}
                </div>
              )}
              {resultado.personasError.length > 0 && (
                <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Estructura no registrada:</p>
                  {resultado.personasError.map((f, i) => (
                    <p key={i} className="text-xs text-amber-700">{f.cliente !== '—' ? `Cliente ${f.cliente}: ` : ''}{f.razon}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          {paso === 'inicio' && (
            <p className="text-xs text-gray-400">Si un cliente ya existe (misma cédula y sujeto obligado), sus datos se actualizan. No se crean duplicados.</p>
          )}
          {paso === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                ← Volver
              </button>
              <button
                onClick={handleCargar}
                disabled={hayErrores || !tenantEfectivo}
                className="btn-primary px-6 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!tenantEfectivo
                  ? '⚠ Seleccione el sujeto obligado'
                  : hayErrores
                    ? `⚠ ${errores.length + erroresEstr.length} errores — corrija antes de importar`
                    : `⬆ Importar ${filas.length} clientes${estructura.length > 0 ? ` + ${estructura.length} personas` : ''}`
                }
              </button>
            </>
          )}
          {paso === 'resultado' && (
            <>
              <button onClick={reset} className="px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Cargar otro archivo
              </button>
              <button onClick={onClose} className="btn-primary px-6">
                Cerrar
              </button>
            </>
          )}
          {paso === 'inicio' && (
            <div /> // spacer
          )}
        </div>

      </div>
    </div>
  )
}
