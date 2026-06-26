// ============================================================
// Metodología de Calificación de Riesgo de Clientes N06
// Basada en Basel AML Index 2023 y listas GAFI/GAFILAT
// ============================================================

// ------------------------------------
// Escala final consolidada
// ------------------------------------
export const ESCALA = [
  { min: 0,    max: 1,    nivel: 'bajo',  label: 'Riesgo Bajo',  color: 'green' },
  { min: 1.01, max: 2,    nivel: 'medio', label: 'Riesgo Medio', color: 'yellow' },
  { min: 2.01, max: 3,    nivel: 'alto',  label: 'Riesgo Alto',  color: 'red' },
]

export function clasificar(score) {
  if (score == null) return null
  if (score <= 1)   return 'bajo'
  if (score <= 2)   return 'medio'
  return 'alto'
}

// ------------------------------------
// Pesos consolidados por tipo de persona
// ------------------------------------
export const PESOS_CONSOLIDADO = {
  fisica:   { cliente: 0.6, geo: 0.4, productos: 0,    canales: 0    },
  juridica: { cliente: 0.5, geo: 0.15, productos: 0.2, canales: 0.15 },
}

// ------------------------------------
// FACTOR CLIENTE — Ponderaciones por criterio
// ------------------------------------
export const CRITERIOS_CLIENTE = {
  fisica: [
    { key: 'acceso_info',     label: 'Acceso a la información',                   peso: 0.10 },
    { key: 'pep',             label: 'PEP',                                        peso: 0.10 },
    { key: 'listas_obs',      label: 'Aparece en otras listas de investigación',   peso: 0.20 },
    { key: 'struct_admin',    label: 'Estructura Administrativa',                  peso: 0.05 },
    { key: 'profesion',       label: 'Profesión',                                  peso: 0.10 },
    { key: 'info_ingreso',    label: 'Información del Ingreso',                    peso: 0.10 },
    { key: 'protectoras',     label: 'Información de Protectoras de Crédito',      peso: 0.15 },
    { key: 'ingreso_mensual', label: 'Ingreso Promedio Mensual',                   peso: 0.15 },
    { key: 'efectivo',        label: 'Dinero en Efectivo',                         peso: 0.05 },
  ],
  juridica: [
    { key: 'acceso_info',     label: 'Acceso a la información',                   peso: 0.10 },
    { key: 'pep',             label: 'PEP (Personas Expuestas Políticamente)',     peso: 0.10 },
    { key: 'actividad_eco',   label: 'Actividad Económica / Laboral',              peso: 0.10 },
    { key: 'listas_obs',      label: 'Aparece en otras listas de investigación',   peso: 0.20 },
    { key: 'struct_acc',      label: 'Estructura Accionaria',                      peso: 0.10 },
    { key: 'struct_admin',    label: 'Estructura Administrativa',                  peso: 0.05 },
    { key: 'anos_operacion',  label: 'Años de Operación',                          peso: 0.10 },
    { key: 'ingreso_mensual', label: 'Ingreso Promedio Mensual P. Jurídica',       peso: 0.10 },
    { key: 'efectivo',        label: 'Dinero en Efectivo',                         peso: 0.05 },
    { key: 'vol_trans',       label: 'Volumen de Transacciones',                   peso: 0.05 },
    { key: 'cant_trans',      label: 'Cantidad de Transacciones',                  peso: 0.05 },
  ],
}

// ------------------------------------
// FACTOR ZONA GEOGRÁFICA — Ponderaciones
// ------------------------------------
export const CRITERIOS_GEO = {
  fisica: [
    { key: 'pais_origen',     label: 'País de Origen / Nacionalidad',             peso: 0.40 },
    { key: 'residencia',      label: 'Residencia Actual',                          peso: 0.40 },
    { key: 'transfronterizo', label: 'Dinero Transfronterizo',                     peso: 0.20 },
  ],
  juridica: [
    { key: 'ubicacion_geo',   label: 'Ubicación Geográfica (actividad)',           peso: 0.30 },
    { key: 'casa_matriz',     label: 'Ubicación Casa Matriz / País Origen',        peso: 0.30 },
    { key: 'transfronterizo', label: 'Dinero Transfronterizo',                     peso: 0.20 },
    { key: 'op_nacional',     label: 'Operación Nacional',                         peso: 0.10 },
    { key: 'op_internacional',label: 'Operación Internacional',                    peso: 0.10 },
  ],
}

// ------------------------------------
// FACTOR PRODUCTOS — Ponderaciones
// ------------------------------------
export const CRITERIOS_PRODUCTOS = {
  fisica: [
    { key: 'servicios',       label: 'Servicios o productos que comercializa',    peso: 0.50 },
    { key: 'anos_exp',        label: 'Años de experiencia / comercialización',     peso: 0.50 },
  ],
  juridica: [
    { key: 'servicios',       label: 'Servicios o productos que comercializa',    peso: 0.40 },
    { key: 'anos_exp',        label: 'Años de experiencia / comercialización',     peso: 0.20 },
    { key: 'posicion_mkt',    label: 'Posicionamiento en el mercado',              peso: 0.20 },
    { key: 'struct_ventas',   label: 'Estructura de Ventas',                       peso: 0.20 },
  ],
}

// ------------------------------------
// FACTOR CANALES DE DISTRIBUCIÓN — Ponderaciones
// ------------------------------------
export const CRITERIOS_CANALES = {
  fisica: [
    { key: 'como_labor',      label: 'Cómo realiza su labor',                     peso: 0.50 },
    { key: 'cant_lugares',    label: 'Cantidad de lugares distintos',              peso: 0.50 },
  ],
  juridica: [
    { key: 'cant_sucursales', label: 'Cantidad de Sucursales',                     peso: 0.40 },
    { key: 'tipo_vendedor',   label: 'Tipo de Vendedor',                           peso: 0.60 },
  ],
}

// ------------------------------------
// OPCIONES DE RESPUESTA por criterio (valor 0.5-3)
// ------------------------------------
export const OPCIONES = {
  acceso_info: [
    { valor: 1, label: 'Fácil acceso a la información' },
    { valor: 2, label: 'Acceso medianamente completo' },
    { valor: 3, label: 'Difícil acceso a la información' },
  ],
  pep: [
    { valor: 1, label: 'No es PEP' },
    { valor: 3, label: 'Es PEP' },
  ],
  actividad_eco: [
    { valor: 1, label: 'Bajo riesgo (ej: salud, agricultura, tecnología, cooperativas, transporte)' },
    { valor: 2, label: 'Mediano riesgo (ej: compra/venta vehículos, construcción, servicios comerciales)' },
    { valor: 3, label: 'Alto riesgo (ej: casinos, empeño, remesas, inmuebles, ONG, facilidades crediticias, metales preciosos, despachos jurídicos/contables)' },
  ],
  listas_obs: [
    { valor: 1, label: 'No aparece en listas' },
    { valor: 3, label: 'Sí aparece en listas de observados / investigación' },
  ],
  struct_acc: [
    { valor: 1,   label: 'Nivel 1 — Persona natural directa' },
    { valor: 1.5, label: 'Nivel 2 — Una sociedad intermedia' },
    { valor: 2,   label: 'Nivel 3 — Dos niveles societarios' },
    { valor: 3,   label: 'Nivel 4 o más — Estructura compleja' },
  ],
  struct_admin: [
    { valor: 0.5, label: 'Corporación (estructura consolidada)' },
    { valor: 1,   label: 'Empresa grande (más de 100 empleados)' },
    { valor: 1.5, label: 'Mediana empresa (hasta 100 empleados)' },
    { valor: 2,   label: 'PYME (5 a 30 empleados)' },
    { valor: 3,   label: 'Menos de 5 personas' },
  ],
  profesion: [
    { valor: 1, label: 'Bajo riesgo (empleado, profesional estándar)' },
    { valor: 2, label: 'Mediano riesgo (comerciante, independiente formal)' },
    { valor: 3, label: 'Alto riesgo (abogado, contador, prestamista, administrador de fondos de terceros)' },
  ],
  info_ingreso: [
    { valor: 1, label: 'Trabajador asalariado (planilla formal)' },
    { valor: 2, label: 'Trabajador independiente inscrito en Hacienda y CCSS' },
    { valor: 3, label: 'Trabajador independiente sin inscripción en Hacienda/CCSS' },
  ],
  protectoras: [
    { valor: 1, label: 'Sin manchas / historial crediticio limpio' },
    { valor: 2, label: 'Con atrasos en créditos' },
    { valor: 3, label: 'Con cobros judiciales' },
  ],
  ingreso_mensual: [
    { valor: 1,   label: 'Más de ₡6,000 o persona jurídica > $1,000,001' },
    { valor: 1.5, label: 'De ₡4,001 a ₡6,000 / P. Jurídica $500,001-$1,000,000' },
    { valor: 2,   label: 'De ₡2,001 a ₡4,000 / P. Jurídica $100,001-$500,000' },
    { valor: 2.5, label: 'De ₡1,001 a ₡2,000 / P. Jurídica $25,001-$100,000' },
    { valor: 3,   label: 'De ₡1 a ₡1,000 / P. Jurídica $0-$25,000 o sin datos' },
  ],
  anos_operacion: [
    { valor: 0.5, label: 'Más de 8 años' },
    { valor: 1,   label: 'De 6 a 8 años' },
    { valor: 2,   label: 'De 3 a 5 años' },
    { valor: 3,   label: 'De 0 a 2 años' },
  ],
  efectivo: [
    { valor: 0.5, label: 'No opera en efectivo' },
    { valor: 1,   label: 'Opera con poco efectivo' },
    { valor: 2,   label: 'Opera mayoritariamente en efectivo' },
    { valor: 3,   label: 'Opera solo en efectivo' },
  ],
  vol_trans: [
    { valor: 0.5, label: 'Hasta USD $100,000' },
    { valor: 1,   label: 'Mayor a $100,000 hasta $300,000' },
    { valor: 2,   label: 'Mayor a $300,000 hasta $500,000' },
    { valor: 3,   label: 'Mayor a $500,000' },
  ],
  cant_trans: [
    { valor: 0.5, label: 'Hasta 50 transacciones' },
    { valor: 1,   label: 'Mayor a 50 hasta 100 transacciones' },
    { valor: 2,   label: 'Mayor a 100 hasta 500 transacciones' },
    { valor: 3,   label: 'Más de 500 transacciones' },
  ],

  // Zona Geográfica
  pais_riesgo: [ // usado para pais_origen, residencia, ubicacion_geo, casa_matriz
    { valor: 1, label: 'País de bajo riesgo (incluye Costa Rica y países desarrollados)' },
    { valor: 2, label: 'País de riesgo medio (BASEL AML Index 2023 score 5.0–5.99)' },
    { valor: 3, label: 'País de alto riesgo (BASEL AML Index 2023 score ≥6.0 / lista GAFI)' },
  ],
  transfronterizo: [
    { valor: 0.5, label: 'No opera con dinero transfronterizo' },
    { valor: 1,   label: 'Opera con remesas de dinero' },
    { valor: 2,   label: 'Opera con transferencias internacionales' },
    { valor: 3,   label: 'Opera con transferencias internacionales y otros productos' },
  ],
  op_nacional: [
    { valor: 0.5, label: 'Opera solo en zonas de riesgo bajo' },
    { valor: 1,   label: 'Opera en zonas de riesgo medio y bajo' },
    { valor: 2,   label: 'Opera en zona de riesgo alto' },
    { valor: 3,   label: 'Opera en más de una zona de riesgo' },
  ],
  op_internacional: [
    { valor: 0.5, label: 'No tiene operaciones internacionales' },
    { valor: 1,   label: 'Opera con países de riesgo medio y bajo' },
    { valor: 2,   label: 'Opera con algún país de riesgo alto' },
    { valor: 3,   label: 'Opera con más de un país de riesgo alto' },
  ],

  // Productos
  servicios: [
    { valor: 1, label: 'Servicios/productos de bajo riesgo (salud, tecnología, alimentos)' },
    { valor: 2, label: 'Servicios/productos de riesgo medio (comercio general, transporte)' },
    { valor: 3, label: 'Servicios/productos de alto riesgo (metales, inmuebles, joyas, remesas)' },
  ],
  anos_exp: [
    { valor: 0.5, label: 'Más de 8 años de experiencia' },
    { valor: 1,   label: 'De 6 a 8 años' },
    { valor: 2,   label: 'De 3 a 5 años' },
    { valor: 3,   label: 'De 0 a 2 años' },
  ],
  posicion_mkt: [
    { valor: 0.5, label: 'Líder en el mercado' },
    { valor: 1,   label: 'Representativo / reconocido' },
    { valor: 2,   label: 'Mediano posicionamiento' },
    { valor: 3,   label: 'Iniciando / sin posicionamiento' },
  ],
  struct_ventas: [
    { valor: 0.5, label: 'Departamento comercial consolidado' },
    { valor: 1,   label: 'Estructura organizada' },
    { valor: 2,   label: 'Estructura media / en desarrollo' },
    { valor: 3,   label: 'Iniciando / sin estructura' },
  ],

  // Canales de Distribución
  como_labor: [
    { valor: 1, label: 'Trabajador formal con contrato / establecimiento fijo' },
    { valor: 2, label: 'Trabajador independiente en Hacienda y CCSS' },
    { valor: 3, label: 'Trabajador independiente sin Hacienda / sin establecimiento' },
  ],
  cant_lugares: [
    { valor: 1,   label: '1 solo lugar' },
    { valor: 2,   label: 'De 2 a 3 lugares' },
    { valor: 3,   label: '4 o más lugares distintos' },
  ],
  cant_sucursales: [
    { valor: 0.5, label: 'Más de 5 sucursales (red amplia)' },
    { valor: 1,   label: 'De 3 a 5 sucursales' },
    { valor: 2,   label: 'De 1 a 2 sucursales' },
    { valor: 3,   label: 'Sin sucursales' },
  ],
  tipo_vendedor: [
    { valor: 0.5, label: 'Vendedores propios en planilla' },
    { valor: 1,   label: 'Agentes registrados / distribuidores formales' },
    { valor: 2,   label: 'Intermediarios sin relación laboral directa' },
    { valor: 3,   label: 'Internos por comisiones sin contrato / canales informales' },
  ],
}

// ------------------------------------
// PAÍSES — Basel AML Index 2023
// Calificación: 1=Bajo (score<5), 2=Medio (5.0-5.99), 3=Alto (≥6.0)
// ------------------------------------
export const PAISES_RIESGO = [
  // Bajo Riesgo (1) — score < 5
  { pais: 'Costa Rica', riesgo: 1 }, { pais: 'Alemania', riesgo: 1 }, { pais: 'Andorra', riesgo: 1 },
  { pais: 'Armenia', riesgo: 1 }, { pais: 'Aruba', riesgo: 1 }, { pais: 'Australia', riesgo: 1 },
  { pais: 'Austria', riesgo: 1 }, { pais: 'Bahréin', riesgo: 1 }, { pais: 'Bélgica', riesgo: 1 },
  { pais: 'Botsuana', riesgo: 1 }, { pais: 'Brunéi Darussalam', riesgo: 1 }, { pais: 'Canadá', riesgo: 1 },
  { pais: 'Chile', riesgo: 1 }, { pais: 'Chipre', riesgo: 1 }, { pais: 'Colombia', riesgo: 1 },
  { pais: 'Corea del Sur', riesgo: 1 }, { pais: 'Croacia', riesgo: 1 }, { pais: 'Dinamarca', riesgo: 1 },
  { pais: 'Dominica', riesgo: 1 }, { pais: 'Eslovaquia', riesgo: 1 }, { pais: 'Eslovenia', riesgo: 1 },
  { pais: 'España', riesgo: 1 }, { pais: 'Estados Unidos', riesgo: 1 }, { pais: 'Estonia', riesgo: 1 },
  { pais: 'Filipinas', riesgo: 1 }, { pais: 'Finlandia', riesgo: 1 }, { pais: 'Fiyi', riesgo: 1 },
  { pais: 'Francia', riesgo: 1 }, { pais: 'Georgia', riesgo: 1 }, { pais: 'Granada', riesgo: 1 },
  { pais: 'Grecia', riesgo: 1 }, { pais: 'Hungría', riesgo: 1 }, { pais: 'Irlanda', riesgo: 1 },
  { pais: 'Islandia', riesgo: 1 }, { pais: 'Israel', riesgo: 1 }, { pais: 'Italia', riesgo: 1 },
  { pais: 'Japón', riesgo: 1 }, { pais: 'Jordán', riesgo: 1 }, { pais: 'Kazajstán', riesgo: 1 },
  { pais: 'Letonia', riesgo: 1 }, { pais: 'Liechtenstein', riesgo: 1 }, { pais: 'Lituania', riesgo: 1 },
  { pais: 'Luxemburgo', riesgo: 1 }, { pais: 'Macedonia', riesgo: 1 }, { pais: 'Malta', riesgo: 1 },
  { pais: 'Mauricio', riesgo: 1 }, { pais: 'Moldavia', riesgo: 1 }, { pais: 'Noruega', riesgo: 1 },
  { pais: 'Nueva Zelanda', riesgo: 1 }, { pais: 'Países Bajos', riesgo: 1 }, { pais: 'Perú', riesgo: 1 },
  { pais: 'Polonia', riesgo: 1 }, { pais: 'Portugal', riesgo: 1 }, { pais: 'RAE de Hong Kong, China', riesgo: 1 },
  { pais: 'Reino Unido', riesgo: 1 }, { pais: 'República Checa', riesgo: 1 }, { pais: 'Rumania', riesgo: 1 },
  { pais: 'Samoa', riesgo: 1 }, { pais: 'San Marino', riesgo: 1 }, { pais: 'Serbia', riesgo: 1 },
  { pais: 'Singapur', riesgo: 1 }, { pais: 'Suecia', riesgo: 1 }, { pais: 'Suiza', riesgo: 1 },
  { pais: 'Taiwán', riesgo: 1 }, { pais: 'Trinidad y Tobago', riesgo: 1 }, { pais: 'Túnez', riesgo: 1 },
  { pais: 'Uruguay', riesgo: 1 }, { pais: 'Albania', riesgo: 1 }, { pais: 'Antigua y Barbuda', riesgo: 1 },
  { pais: 'Croacia', riesgo: 1 }, { pais: 'Chipre', riesgo: 1 }, { pais: 'Bután', riesgo: 2 },
  // Medio Riesgo (2) — score 5.0-5.99
  { pais: 'Arabia Saudita', riesgo: 2 }, { pais: 'Bangladés', riesgo: 2 }, { pais: 'Barbados', riesgo: 2 },
  { pais: 'Bielorrusia', riesgo: 2 }, { pais: 'Bulgaria', riesgo: 2 }, { pais: 'Cuba', riesgo: 2 },
  { pais: 'Ecuador', riesgo: 2 }, { pais: 'Egipto', riesgo: 2 }, { pais: 'Emiratos Árabes Unidos', riesgo: 2 },
  { pais: 'Etiopía', riesgo: 2 }, { pais: 'Filipinas', riesgo: 2 }, { pais: 'Gambia', riesgo: 2 },
  { pais: 'Ghana', riesgo: 2 }, { pais: 'Guatemala', riesgo: 2 }, { pais: 'Honduras', riesgo: 2 },
  { pais: 'Indonesia', riesgo: 2 }, { pais: 'Jamaica', riesgo: 2 }, { pais: 'Katar', riesgo: 2 },
  { pais: 'Malaui', riesgo: 2 }, { pais: 'Malasia', riesgo: 2 }, { pais: 'México', riesgo: 2 },
  { pais: 'Mongolia', riesgo: 2 }, { pais: 'Namibia', riesgo: 2 }, { pais: 'Palaos', riesgo: 2 },
  { pais: 'Panamá', riesgo: 2 }, { pais: 'Paraguay', riesgo: 2 }, { pais: 'República Dominicana', riesgo: 2 },
  { pais: 'San Cristóbal y Nieves', riesgo: 2 }, { pais: 'Santa Lucía', riesgo: 2 }, { pais: 'Seychelles', riesgo: 2 },
  { pais: 'Sri Lanka', riesgo: 2 }, { pais: 'Turquía', riesgo: 2 }, { pais: 'Ucrania', riesgo: 2 },
  { pais: 'Uzbekistán', riesgo: 2 }, { pais: 'Vanuatu', riesgo: 2 }, { pais: 'Zambia', riesgo: 2 },
  { pais: 'Zimbabue', riesgo: 2 }, { pais: 'Eswatini', riesgo: 2 },
  // Alto Riesgo (3) — score ≥6.0 o lista GAFI
  { pais: 'Angola', riesgo: 3 }, { pais: 'Argelia', riesgo: 3 }, { pais: 'Birmania (Myanmar)', riesgo: 3 },
  { pais: 'Burkina Faso', riesgo: 3 }, { pais: 'Cabo Verde', riesgo: 3 }, { pais: 'Camboya', riesgo: 3 },
  { pais: 'Camerún', riesgo: 3 }, { pais: 'Chad', riesgo: 3 }, { pais: 'Congo', riesgo: 3 },
  { pais: 'República Democrática del Congo', riesgo: 3 }, { pais: 'Corea del Norte', riesgo: 3 },
  { pais: 'Costa de Marfil', riesgo: 3 }, { pais: 'Gabón', riesgo: 3 }, { pais: 'Guinea-Bissau', riesgo: 3 },
  { pais: 'Haití', riesgo: 3 }, { pais: 'Irán', riesgo: 3 }, { pais: 'Islas Salomón', riesgo: 3 },
  { pais: 'Kenia', riesgo: 3 }, { pais: 'Kirguistán', riesgo: 3 }, { pais: 'Laos', riesgo: 3 },
  { pais: 'Liberia', riesgo: 3 }, { pais: 'Libia', riesgo: 3 }, { pais: 'Madagascar', riesgo: 3 },
  { pais: 'Malí', riesgo: 3 }, { pais: 'Mauritania', riesgo: 3 }, { pais: 'Mozambique', riesgo: 3 },
  { pais: 'Nicaragua', riesgo: 3 }, { pais: 'Níger', riesgo: 3 }, { pais: 'Nigeria', riesgo: 3 },
  { pais: 'Pakistán', riesgo: 3 }, { pais: 'Región Adm. Especial de Macao, China', riesgo: 3 },
  { pais: 'Porcelana (China)', riesgo: 3 }, { pais: 'Rusia', riesgo: 3 }, { pais: 'Senegal', riesgo: 3 },
  { pais: 'Sierra Leona', riesgo: 3 }, { pais: 'Siria', riesgo: 3 }, { pais: 'Somalia', riesgo: 3 },
  { pais: 'Sudán', riesgo: 3 }, { pais: 'Sudán del Sur', riesgo: 3 }, { pais: 'Surinam', riesgo: 3 },
  { pais: 'Tanzania', riesgo: 3 }, { pais: 'Tonga', riesgo: 3 }, { pais: 'Turkmenistán', riesgo: 3 },
  { pais: 'Uganda', riesgo: 3 }, { pais: 'Venezuela', riesgo: 3 }, { pais: 'Vietnam', riesgo: 3 },
  { pais: 'Yemen', riesgo: 3 }, { pais: 'Zimbaue', riesgo: 3 },
].sort((a, b) => a.pais.localeCompare(b.pais, 'es'))

// GAFI — Jurisdicciones bajo mayor monitoreo (uso para ONG/FT)
export const PAISES_ALTO_RIESGO_FT = [
  'Birmania (Myanmar)', 'Burkina Faso', 'Camerún', 'República Democrática del Congo',
  'Haití', 'Irán', 'Corea del Norte', 'Malí', 'Mozambique', 'Nicaragua', 'Nigeria',
  'Pakistán', 'Panamá', 'Filipinas', 'Rusia', 'Senegal', 'Somalia', 'Sudán del Sur',
  'Siria', 'Tanzania', 'Trinidad y Tobago', 'Uganda', 'Emiratos Árabes Unidos', 'Yemen',
  'Venezuela', 'Vietnam', 'Zimbabue',
]

// ------------------------------------
// FUNCIÓN: calcular score de un factor
// ------------------------------------
export function calcularScoreFactor(respuestas, criterios) {
  if (!respuestas || !criterios) return null
  let total = 0
  let pesosUsados = 0
  for (const c of criterios) {
    const val = respuestas[c.key]
    if (val != null && val !== '') {
      total += Number(val) * c.peso
      pesosUsados += c.peso
    }
  }
  if (pesosUsados === 0) return null
  // Normalizar si no se respondieron todos los criterios
  return total / pesosUsados
}

// ------------------------------------
// FUNCIÓN: calcular score consolidado
// ------------------------------------
export function calcularScoreTotal(scores, tipo) {
  const pesos = PESOS_CONSOLIDADO[tipo]
  let total = 0
  let pesosUsados = 0
  if (scores.cliente != null) { total += scores.cliente * pesos.cliente; pesosUsados += pesos.cliente }
  if (scores.geo != null)     { total += scores.geo * pesos.geo;         pesosUsados += pesos.geo }
  if (pesos.productos > 0 && scores.productos != null) { total += scores.productos * pesos.productos; pesosUsados += pesos.productos }
  if (pesos.canales > 0 && scores.canales != null)     { total += scores.canales * pesos.canales;     pesosUsados += pesos.canales }
  if (pesosUsados === 0) return null
  return total / pesosUsados
}

// Obtener riesgo de país por nombre
export function getRiesgoPais(nombrePais) {
  if (!nombrePais) return null
  const entry = PAISES_RIESGO.find(p => p.pais.toLowerCase() === nombrePais.toLowerCase())
  return entry ? entry.riesgo : null
}
