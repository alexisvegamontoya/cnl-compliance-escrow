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
// ACTIVIDADES / PROFESIONES — Metodología N06
// valor: 1=BAJO  2=MEDIO  3=ALTO
// ------------------------------------
export const ACTIVIDADES_PROFESIONES = [
  // BAJO
  { label: 'ABOGADO / NOTARIO', valor: 3 },
  { label: 'ACADEMIAS, INSTITUTOS Y PARAUNIVERSITARI', valor: 1 },
  { label: 'ACUICULTURA (CAMARON, PECES, OTROS)', valor: 2 },
  { label: 'ACTOR / ARTE ESCENICO', valor: 1 },
  { label: 'ACTIVIDADES DEPORTIVAS', valor: 3 },
  { label: 'ADMINISTRADOR ADUANERO', valor: 2 },
  { label: 'ADMINISTRADOR EDUCATIVO', valor: 1 },
  { label: 'ADMINISTRADOR HOTELERO', valor: 1 },
  { label: 'ADMINISTRADOR NEGOCIOS / EMPRESAS', valor: 1 },
  { label: 'ADMINISTRADOR OTROS', valor: 1 },
  { label: 'ADMINISTRADOR PUBLICO', valor: 2 },
  { label: 'ADMINISTRADOR RECURSOS HUMANOS', valor: 1 },
  { label: 'ADMINISTRADOR SERVICIOS DE SALUD', valor: 2 },
  { label: 'AGENCIAS DE VIAJES', valor: 2 },
  { label: 'AGRICULTURA', valor: 1 },
  { label: 'AGRONOMO', valor: 1 },
  { label: 'AMA DE CASA', valor: 2 },
  { label: 'AMBIENTALISTA', valor: 1 },
  { label: 'ANTROPOLOGO', valor: 1 },
  { label: 'ARQUEOLOGO / PALEONTOLOGO', valor: 1 },
  { label: 'ARQUITECTO', valor: 1 },
  { label: 'ASALARIADO INSTITUCION PUBLICA', valor: 1 },
  { label: 'ASALARIADO PRIVADO', valor: 1 },
  { label: 'ASOCIACIONES / FUNDACIONES', valor: 2 },
  { label: 'ASTRONOMO', valor: 1 },
  { label: 'AVICULTURA', valor: 1 },
  { label: 'BIBLIOTECOLOGO', valor: 1 },
  { label: 'BIOFISICO', valor: 1 },
  { label: 'BIOLOGO', valor: 1 },
  { label: 'BOTANICO', valor: 1 },
  { label: 'CAMBISTAS DE DIVISAS', valor: 2 },
  { label: 'CARTOGRAFO', valor: 1 },
  { label: 'CASAS DE EMPEÑO', valor: 3 },
  { label: 'CASINOS', valor: 3 },
  { label: 'CO-DESARROLLO PUBLICO - PRIVADO', valor: 1 },
  { label: 'COMERCIO EN GENERAL', valor: 2 },
  { label: 'COMERCIO EXTERIOR', valor: 3 },
  { label: 'COMERCIO JOYAS, GEMAS, METALES PRECIOSOS', valor: 3 },
  { label: 'COMERCIO PRODUCTOS DE SALUD', valor: 2 },
  { label: 'CONSULT. Y LABORATORIOS MEDICOS', valor: 1 },
  { label: 'CONSTRUCCION', valor: 2 },
  { label: 'CONTADOR PRIVADO', valor: 3 },
  { label: 'CONTADOR PUBLICO', valor: 3 },
  { label: 'COREOGRAFO / BAILARIN / DANZA', valor: 1 },
  { label: 'CORREDORES DE BOLSA INDEP INTERNACIONAL', valor: 1 },
  { label: 'CRIMINOLOGO', valor: 1 },
  { label: 'DERIVADOS DEL PETRÓLEO (GASOLINA, DIESEL, GAS)', valor: 2 },
  { label: 'DESARROLLO INMOBILIARIO E INVERSION', valor: 3 },
  { label: 'DISEÑADOR DE INTERIORES', valor: 1 },
  { label: 'DISENADOR GRAFICO / PUBLICITARIO', valor: 1 },
  { label: 'DIBUJANTE', valor: 1 },
  { label: 'ECONOMISTA', valor: 1 },
  { label: 'ECOLOGO', valor: 1 },
  { label: 'EDUCADOR / PROFESOR / ORIENTADOR', valor: 1 },
  { label: 'ENFERMERO', valor: 1 },
  { label: 'ESCUELAS Y COLEGIOS PRIVADOS', valor: 1 },
  { label: 'ESCRITOR', valor: 1 },
  { label: 'ESCULTOR / CERAMICO', valor: 1 },
  { label: 'ESTADISTICO', valor: 1 },
  { label: 'ESTUDIANTE', valor: 2 },
  { label: 'EXTRACCION / EXPLOTACION DE MINERALES', valor: 2 },
  { label: 'FABRICACION DE PRODUCTOS METALICOS', valor: 1 },
  { label: 'FABRICACION DE PRODUCTOS QUIMICOS', valor: 3 },
  { label: 'FABRICACION DE TEXTILES, OTROS', valor: 1 },
  { label: 'FARMACEUTICO', valor: 2 },
  { label: 'FARMACIAS', valor: 1 },
  { label: 'FOTOGRAFO', valor: 1 },
  { label: 'FILOSOFO', valor: 1 },
  { label: 'FILOLOGO', valor: 1 },
  { label: 'FISICO', valor: 1 },
  { label: 'FLORES, PLANTAS ORNAMENTALES', valor: 1 },
  { label: 'GANADO, PORCINO, EQUINO, OTROS', valor: 2 },
  { label: 'GASTRONOMO / CHEF', valor: 1 },
  { label: 'GENERACION ELECTRICA', valor: 1 },
  { label: 'GENETICO', valor: 1 },
  { label: 'GEOLOGO / GEOGRAFO', valor: 1 },
  { label: 'HISTORIADOR / ARCHIVISTICO', valor: 1 },
  { label: 'HOSPITALES Y CLINICAS PRIVADAS', valor: 1 },
  { label: 'INDUSTRIA MANUFACTURERA', valor: 1 },
  { label: 'INDUSTRIA PRODUCTOS ALIMENTICIOS', valor: 1 },
  { label: 'INGENIERO AGRONOMO / AGRICOLA', valor: 1 },
  { label: 'INGENIERO BIOTECNOLOGO', valor: 1 },
  { label: 'INGENIERO CIVIL', valor: 1 },
  { label: 'INGENIERO ELECTROMECANICO', valor: 1 },
  { label: 'INGENIERO ELECTRONICO / ELECTRICO', valor: 1 },
  { label: 'INGENIERO ESPECIALIZADO', valor: 1 },
  { label: 'INGENIERO FORESTAL', valor: 1 },
  { label: 'INGENIERO INDUSTRIAL', valor: 1 },
  { label: 'INGENIERO INFORMATICO / COMPUTACION', valor: 2 },
  { label: 'INGENIERO MECANICO', valor: 1 },
  { label: 'INGENIERO QUIMICO', valor: 2 },
  { label: 'INGENIERO SEGURIDAD LABORAL', valor: 1 },
  { label: 'INGENIERO TELECOMUNICACIONES', valor: 1 },
  { label: 'INGENIERO TOPOGRAFO', valor: 1 },
  { label: 'JUEGOS DE AZAR (INCLUYE EN LÍNEA Y APUESTAS)', valor: 3 },
  { label: 'MATEMATICO / ACTUARIAL', valor: 1 },
  { label: 'MEDICO', valor: 2 },
  { label: 'MERCADOLOGO', valor: 1 },
  { label: 'METEOROLOGO', valor: 1 },
  { label: 'MICROBIOLOGO', valor: 1 },
  { label: 'MODELAJE', valor: 1 },
  { label: 'MONEDAS VIRTUALES', valor: 3 },
  { label: 'MOTELES, NIGHTCLUB Y AFINES', valor: 3 },
  { label: 'MUSICO / CANTANTE', valor: 1 },
  { label: 'NUTRICIONISTA', valor: 1 },
  { label: 'ODONTOLOGO', valor: 1 },
  { label: 'OPTOMETRISTA / OFTALMOLOGO', valor: 1 },
  { label: 'ORGANIZACIONES DE BENEFICIENCIA', valor: 2 },
  { label: 'ORGANIZACIONES INTERNACIONALES', valor: 2 },
  { label: 'OTRA', valor: 2 },
  { label: 'PEDAGOGO', valor: 1 },
  { label: 'PERIODISTA', valor: 1 },
  { label: 'PESCA Y CAZA', valor: 3 },
  { label: 'PINTOR', valor: 1 },
  { label: "PEP'S", valor: 3 },
  { label: 'PRODUCTOS CREDITO, PRESTAMISTA, FACTOREO', valor: 3 },
  { label: 'PSICOLOGO / PSIQUIATRA', valor: 1 },
  { label: 'PUBLICISTA', valor: 1 },
  { label: 'QUIMICO', valor: 2 },
  { label: 'RADIOLOGO / IMAGENOLOGO', valor: 1 },
  { label: 'RELACIONISTA PUBLICO', valor: 1 },
  { label: 'RELACIONES INT / CIENCIAS POLITICAS', valor: 1 },
  { label: 'SECRETARIA (O)', valor: 1 },
  { label: 'SEGUROS Y PENSION', valor: 1 },
  { label: 'SERVICIOS ADUANEROS', valor: 3 },
  { label: 'SERVICIOS DE ALQUILER', valor: 1 },
  { label: 'SERVICIOS DE BIENES RAICES', valor: 3 },
  { label: 'SERVICIOS DE COMUNICACIONES', valor: 1 },
  { label: 'SERVICIOS DE IMPRENTA, EDITORIAL, OTROS', valor: 1 },
  { label: 'SERVICIOS DE REPARACION DE EQUIPO', valor: 1 },
  { label: 'SERVICIOS FINANCIEROS', valor: 2 },
  { label: 'SERVICIOS PROFESIONALES', valor: 2 },
  { label: 'SERVICIOS PUBLICOS (AGUA, ELEC, OTROS)', valor: 1 },
  { label: 'SILVICULTURA', valor: 1 },
  { label: 'SIN ACTIVIDAD ECONOMICA', valor: 2 },
  { label: 'SOCIEDAD DE HECHO', valor: 3 },
  { label: 'SOCIEDADES RELIGIOSAS', valor: 2 },
  { label: 'SOCIOLOGO', valor: 1 },
  { label: 'TECNICO DENTAL', valor: 1 },
  { label: 'TECNOLOGO DE ALIMENTOS', valor: 1 },
  { label: 'TEOLOGO', valor: 1 },
  { label: 'TERAPEUTA / QUIROPRACTICO', valor: 1 },
  { label: 'TRABAJADOR SOCIAL', valor: 1 },
  { label: 'TRADUCTOR / INTERPRETADOR DE IDIOMAS', valor: 1 },
  { label: 'TRANSPORTE PRIVADO (PLATAFORMAS, MARITIMO, AÉREO)', valor: 2 },
  { label: 'TRANSPORTE PUBLICO', valor: 1 },
  { label: 'TURISMO', valor: 1 },
  { label: 'UNIVERSIDADES PRIVADAS', valor: 1 },
  { label: 'VENTA BIENES MUEBLES (AUTOS, BARCOS, OTROS)', valor: 3 },
  { label: 'VENTA DE CONTENIDO EN PLATAFORMAS DIGITALES', valor: 1 },
  { label: 'VETERINARIO', valor: 1 },
  { label: 'SERVICIO REMESAS DE DINERO', valor: 3 },
].sort((a, b) => a.label.localeCompare(b.label, 'es'))

// ------------------------------------
// CANTONES DE COSTA RICA — Riesgo 2025
// valor: 1=BAJO  2=MEDIO  3=ALTO
// ------------------------------------
export const CANTONES_CR = [
  { provincia: 'Alajuela',    canton: 'Alajuela',              valor: 3 },
  { provincia: 'Alajuela',    canton: 'Atenas',                valor: 1 },
  { provincia: 'Alajuela',    canton: 'Grecia',                valor: 2 },
  { provincia: 'Alajuela',    canton: 'Guatuso',               valor: 2 },
  { provincia: 'Alajuela',    canton: 'Los Chiles',            valor: 3 },
  { provincia: 'Alajuela',    canton: 'Naranjo',               valor: 2 },
  { provincia: 'Alajuela',    canton: 'Orotina',               valor: 2 },
  { provincia: 'Alajuela',    canton: 'Palmares',              valor: 1 },
  { provincia: 'Alajuela',    canton: 'Poás',                  valor: 2 },
  { provincia: 'Alajuela',    canton: 'Río Cuarto',            valor: 2 },
  { provincia: 'Alajuela',    canton: 'San Carlos',            valor: 3 },
  { provincia: 'Alajuela',    canton: 'San Mateo',             valor: 1 },
  { provincia: 'Alajuela',    canton: 'San Ramón',             valor: 3 },
  { provincia: 'Alajuela',    canton: 'Upala',                 valor: 3 },
  { provincia: 'Alajuela',    canton: 'Valverde Vega',         valor: 1 },
  { provincia: 'Alajuela',    canton: 'Zarcero',               valor: 1 },
  { provincia: 'Cartago',     canton: 'Alvarado',              valor: 2 },
  { provincia: 'Cartago',     canton: 'Cartago',               valor: 3 },
  { provincia: 'Cartago',     canton: 'El Guarco',             valor: 2 },
  { provincia: 'Cartago',     canton: 'Jiménez',               valor: 1 },
  { provincia: 'Cartago',     canton: 'La Unión',              valor: 2 },
  { provincia: 'Cartago',     canton: 'Oreamuno',              valor: 2 },
  { provincia: 'Cartago',     canton: 'Paraíso',               valor: 2 },
  { provincia: 'Cartago',     canton: 'Turrialba',             valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Abangares',             valor: 1 },
  { provincia: 'Guanacaste',  canton: 'Bagaces',               valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Carrillo',              valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Cañas',                 valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Hojancha',              valor: 2 },
  { provincia: 'Guanacaste',  canton: 'La Cruz',               valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Liberia',               valor: 3 },
  { provincia: 'Guanacaste',  canton: 'Nandayure',             valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Nicoya',                valor: 2 },
  { provincia: 'Guanacaste',  canton: 'Santa Cruz',            valor: 3 },
  { provincia: 'Guanacaste',  canton: 'Tilarán',               valor: 1 },
  { provincia: 'Heredia',     canton: 'Barva',                 valor: 2 },
  { provincia: 'Heredia',     canton: 'Belén',                 valor: 2 },
  { provincia: 'Heredia',     canton: 'Flores',                valor: 1 },
  { provincia: 'Heredia',     canton: 'Heredia',               valor: 2 },
  { provincia: 'Heredia',     canton: 'San Isidro',            valor: 1 },
  { provincia: 'Heredia',     canton: 'San Pablo',             valor: 1 },
  { provincia: 'Heredia',     canton: 'San Rafael',            valor: 2 },
  { provincia: 'Heredia',     canton: 'Santa Bárbara',         valor: 1 },
  { provincia: 'Heredia',     canton: 'Santo Domingo',         valor: 2 },
  { provincia: 'Limón',       canton: 'Guácimo',               valor: 2 },
  { provincia: 'Limón',       canton: 'Limón',                 valor: 3 },
  { provincia: 'Limón',       canton: 'Matina',                valor: 3 },
  { provincia: 'Limón',       canton: 'Pococí',                valor: 3 },
  { provincia: 'Limón',       canton: 'Sarapiquí',             valor: 3 },
  { provincia: 'Limón',       canton: 'Siquirres',             valor: 3 },
  { provincia: 'Limón',       canton: 'Talamanca',             valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Aguirre',               valor: 2 },
  { provincia: 'Puntarenas',  canton: 'Buenos Aires',          valor: 2 },
  { provincia: 'Puntarenas',  canton: 'Corredores',            valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Coto Brus',             valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Esparza',               valor: 2 },
  { provincia: 'Puntarenas',  canton: 'Garabito',              valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Golfito',               valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Montes de Oro',         valor: 1 },
  { provincia: 'Puntarenas',  canton: 'Osa',                   valor: 3 },
  { provincia: 'Puntarenas',  canton: 'Parrita',               valor: 2 },
  { provincia: 'Puntarenas',  canton: 'Puntarenas',            valor: 3 },
  { provincia: 'San Jose',    canton: 'Acosta',                valor: 1 },
  { provincia: 'San Jose',    canton: 'Alajuelita',            valor: 2 },
  { provincia: 'San Jose',    canton: 'Aserrí',                valor: 2 },
  { provincia: 'San Jose',    canton: 'Curridabat',            valor: 2 },
  { provincia: 'San Jose',    canton: 'Desamparados',          valor: 3 },
  { provincia: 'San Jose',    canton: 'Dota',                  valor: 2 },
  { provincia: 'San Jose',    canton: 'Escazú',                valor: 2 },
  { provincia: 'San Jose',    canton: 'Goicoechea',            valor: 3 },
  { provincia: 'San Jose',    canton: 'León Cortés Castro',    valor: 2 },
  { provincia: 'San Jose',    canton: 'Montes de Oca',         valor: 2 },
  { provincia: 'San Jose',    canton: 'Mora',                  valor: 2 },
  { provincia: 'San Jose',    canton: 'Moravia',               valor: 2 },
  { provincia: 'San Jose',    canton: 'Puriscal',              valor: 1 },
  { provincia: 'San Jose',    canton: 'Pérez Zeledón',         valor: 3 },
  { provincia: 'San Jose',    canton: 'San José',              valor: 2 },
  { provincia: 'San Jose',    canton: 'Santa Ana',             valor: 2 },
  { provincia: 'San Jose',    canton: 'Tarrazú',               valor: 2 },
  { provincia: 'San Jose',    canton: 'Tibás',                 valor: 2 },
  { provincia: 'San Jose',    canton: 'Turrubares',            valor: 1 },
  { provincia: 'San Jose',    canton: 'Vázquez de Coronado',   valor: 2 },
]

export const PROVINCIAS_CR = [...new Set(CANTONES_CR.map(c => c.provincia))]

// ------------------------------------
// PAÍSES — Lista de riesgo de la Unidad de Inteligencia Financiera (UIF)
// Fuente: LISTA_DE_PAISES_NIVEL_DE_RIESGO.xlsx · Actualizada 2026-08-11
// Calificación: 1=Bajo, 2=Medio, 3=Alto
// ------------------------------------
export const PAISES_RIESGO = [
  // Bajo (1)
  { pais: 'Andorra', riesgo: 1 },
  { pais: 'Bután', riesgo: 1 },
  { pais: 'Dinamarca', riesgo: 1 },
  { pais: 'Finlandia', riesgo: 1 },
  { pais: 'Nueva Zelanda', riesgo: 1 },
  { pais: 'Puerto Rico', riesgo: 1 },
  // Medio (2)
  { pais: 'Alemania', riesgo: 2 },
  { pais: 'Antigua y Barbuda', riesgo: 2 },
  { pais: 'Arabia Saudita', riesgo: 2 },
  { pais: 'Armenia', riesgo: 2 },
  { pais: 'Australia', riesgo: 2 },
  { pais: 'Austria', riesgo: 2 },
  { pais: 'Aruba', riesgo: 2 },
  { pais: 'Bahamas', riesgo: 2 },
  { pais: 'Bahrein', riesgo: 2 },
  { pais: 'Barbados', riesgo: 2 },
  { pais: 'Bélgica', riesgo: 2 },
  { pais: 'Bielorrusia', riesgo: 2 },
  { pais: 'Bosnia-Herzegovina', riesgo: 2 },
  { pais: 'Botswana', riesgo: 2 },
  { pais: 'Brunei Darussalam', riesgo: 2 },
  { pais: 'Bulgaria', riesgo: 2 },
  { pais: 'Burundi', riesgo: 2 },
  { pais: 'Cabo Verde', riesgo: 2 },
  { pais: 'Camerún', riesgo: 2 },
  { pais: 'Canadá', riesgo: 2 },
  { pais: 'Chad', riesgo: 2 },
  { pais: 'Chile', riesgo: 2 },
  { pais: 'Chipre', riesgo: 2 },
  { pais: 'Comores', riesgo: 2 },
  { pais: 'Corea del Sur', riesgo: 2 },
  { pais: 'Croacia', riesgo: 2 },
  { pais: 'Cuba', riesgo: 2 },
  { pais: 'Djibouti, Yibuti', riesgo: 2 },
  { pais: 'Dominica', riesgo: 2 },
  { pais: 'Eritrea', riesgo: 2 },
  { pais: 'Eslovaquia', riesgo: 2 },
  { pais: 'Eslovenia', riesgo: 2 },
  { pais: 'Estados Unidos', riesgo: 2 },
  { pais: 'Estonia', riesgo: 2 },
  { pais: 'Francia', riesgo: 2 },
  { pais: 'Gabón', riesgo: 2 },
  { pais: 'Georgia', riesgo: 2 },
  { pais: 'Gibraltar', riesgo: 2 },
  { pais: 'Granada', riesgo: 2 },
  { pais: 'Guinea Ecuatorial', riesgo: 2 },
  { pais: 'Hong Kong', riesgo: 2 },
  { pais: 'Hungría', riesgo: 2 },
  { pais: 'Irlanda', riesgo: 2 },
  { pais: 'Islas Marshall', riesgo: 2 },
  { pais: 'Israel', riesgo: 2 },
  { pais: 'Jamaica', riesgo: 2 },
  { pais: 'Jordania', riesgo: 2 },
  { pais: 'Kosovo', riesgo: 2 },
  { pais: 'Letonia', riesgo: 2 },
  { pais: 'Libia', riesgo: 2 },
  { pais: 'Lituania', riesgo: 2 },
  { pais: 'Luxemburgo', riesgo: 2 },
  { pais: 'Macedonia', riesgo: 2 },
  { pais: 'Madagascar', riesgo: 2 },
  { pais: 'Malawi', riesgo: 2 },
  { pais: 'Malta', riesgo: 2 },
  { pais: 'Mauricio', riesgo: 2 },
  { pais: 'Montenegro', riesgo: 2 },
  { pais: 'Omán', riesgo: 2 },
  { pais: 'Países Bajos, Holanda', riesgo: 2 },
  { pais: 'Perú', riesgo: 2 },
  { pais: 'Polonia', riesgo: 2 },
  { pais: 'Portugal', riesgo: 2 },
  { pais: 'Qatar', riesgo: 2 },
  { pais: 'Reino Unido', riesgo: 2 },
  { pais: 'República Centroafricana', riesgo: 2 },
  { pais: 'República Checa', riesgo: 2 },
  { pais: 'República del Congo', riesgo: 2 },
  { pais: 'República Democrática del Congo', riesgo: 2 },
  { pais: 'Ruanda', riesgo: 2 },
  { pais: 'Rumanía', riesgo: 2 },
  { pais: 'San Vincente y Granadinas', riesgo: 2 },
  { pais: 'Santa Lucía', riesgo: 2 },
  { pais: 'Senegal', riesgo: 2 },
  { pais: 'Serbia', riesgo: 2 },
  { pais: 'Singapur', riesgo: 2 },
  { pais: 'Sudáfrica', riesgo: 2 },
  { pais: 'Sudán', riesgo: 2 },
  { pais: 'Sudán del Sur', riesgo: 2 },
  { pais: 'Suiza', riesgo: 2 },
  { pais: 'Taiwan', riesgo: 2 },
  { pais: 'Timor Oriental', riesgo: 2 },
  { pais: 'Túnez', riesgo: 2 },
  { pais: 'Turkmenistan', riesgo: 2 },
  { pais: 'Uruguay', riesgo: 2 },
  { pais: 'Uzbekistán', riesgo: 2 },
  { pais: 'Zimbabwe', riesgo: 2 },
  // Alto (3)
  { pais: 'Afganistán', riesgo: 3 },
  { pais: 'Albania', riesgo: 3 },
  { pais: 'Angola', riesgo: 3 },
  { pais: 'Argelia', riesgo: 3 },
  { pais: 'Argentina', riesgo: 3 },
  { pais: 'Azerbaiyán', riesgo: 3 },
  { pais: 'Bangladesh', riesgo: 3 },
  { pais: 'Benín', riesgo: 3 },
  { pais: 'Bolivia', riesgo: 3 },
  { pais: 'Brasil', riesgo: 3 },
  { pais: 'Burkina Faso', riesgo: 3 },
  { pais: 'Camboya', riesgo: 3 },
  { pais: 'China', riesgo: 3 },
  { pais: 'Colombia', riesgo: 3 },
  { pais: 'Corea del Norte', riesgo: 3 },
  { pais: 'Costa Rica', riesgo: 1 }, // Ajustado a Bajo: no penalizar a la cartera local por el índice internacional
  { pais: 'Dominicana, República', riesgo: 3 },
  { pais: 'Ecuador', riesgo: 3 },
  { pais: 'Egipto', riesgo: 3 },
  { pais: 'El Salvador', riesgo: 3 },
  { pais: 'Emiratos Árabes Unidos', riesgo: 3 },
  { pais: 'España', riesgo: 3 },
  { pais: 'Etiopía', riesgo: 3 },
  { pais: 'Federación Rusa', riesgo: 3 },
  { pais: 'Filipinas', riesgo: 3 },
  { pais: 'Gambia', riesgo: 3 },
  { pais: 'Ghana', riesgo: 3 },
  { pais: 'Grecia', riesgo: 3 },
  { pais: 'Guatemala', riesgo: 3 },
  { pais: 'Guayana Francesa', riesgo: 3 },
  { pais: 'Guinea Bissau', riesgo: 3 },
  { pais: 'Haiti', riesgo: 3 },
  { pais: 'Honduras', riesgo: 3 },
  { pais: 'India', riesgo: 3 },
  { pais: 'Indonesia', riesgo: 3 },
  { pais: 'Irán', riesgo: 3 },
  { pais: 'Iraq', riesgo: 3 },
  { pais: 'Italia', riesgo: 3 },
  { pais: 'Japón', riesgo: 3 },
  { pais: 'Kazajstán', riesgo: 3 },
  { pais: 'Kenia', riesgo: 3 },
  { pais: 'Kirguistán', riesgo: 3 },
  { pais: 'Kuwait', riesgo: 3 },
  { pais: 'Laos; oficialmente: República Democrática Popular Lao', riesgo: 3 },
  { pais: 'Lesotho', riesgo: 3 },
  { pais: 'Líbano', riesgo: 3 },
  { pais: 'Liberia', riesgo: 3 },
  { pais: 'Malasia', riesgo: 3 },
  { pais: 'Malí', riesgo: 3 },
  { pais: 'Marruecos', riesgo: 3 },
  { pais: 'Mauritania', riesgo: 3 },
  { pais: 'México', riesgo: 3 },
  { pais: 'Moldavia', riesgo: 3 },
  { pais: 'Mongolia', riesgo: 3 },
  { pais: 'Mozambique', riesgo: 3 },
  { pais: 'Myanmar, Birmania', riesgo: 3 },
  { pais: 'Namibia', riesgo: 3 },
  { pais: 'Nepal', riesgo: 3 },
  { pais: 'Nicaragua', riesgo: 3 },
  { pais: 'Niger', riesgo: 3 },
  { pais: 'Nigeria', riesgo: 3 },
  { pais: 'Pakistán', riesgo: 3 },
  { pais: 'Panamá', riesgo: 3 },
  { pais: 'Papúa-Nueva Guinea', riesgo: 3 },
  { pais: 'Paraguay', riesgo: 3 },
  { pais: 'Santo Tomé y Príncipe', riesgo: 3 },
  { pais: 'Seychelles', riesgo: 3 },
  { pais: 'Sierra Leona', riesgo: 3 },
  { pais: 'Siria', riesgo: 3 },
  { pais: 'Somalia', riesgo: 3 },
  { pais: 'Sri Lanka', riesgo: 3 },
  { pais: 'Surinam', riesgo: 3 },
  { pais: 'Swazilandia', riesgo: 3 },
  { pais: 'Tadjikistan', riesgo: 3 },
  { pais: 'Tailandia', riesgo: 3 },
  { pais: 'Tanzania', riesgo: 3 },
  { pais: 'Togo', riesgo: 3 },
  { pais: 'Trinidad y Tobago', riesgo: 3 },
  { pais: 'Turquía', riesgo: 3 },
  { pais: 'Ucrania', riesgo: 3 },
  { pais: 'Uganda', riesgo: 3 },
  { pais: 'Venezuela', riesgo: 3 },
  { pais: 'Vietnam', riesgo: 3 },
  { pais: 'Yemen', riesgo: 3 },
  { pais: 'Zambia', riesgo: 3 },
].sort((a, b) => a.pais.localeCompare(b.pais, 'es'))

// GAFI/FATF — Jurisdicciones de alto riesgo FT (usar SOLO para sujetos obligados ONG/OSFL)
// Grey list (mayor monitoreo) + Black list (llamado a la acción). Fuente: FATF, junio 2026.
// Nombres alineados con PAISES_RIESGO para que el cruce por país funcione.
export const PAISES_ALTO_RIESGO_FT = [
  // Grey list (jurisdicciones bajo mayor monitoreo)
  'Angola', 'Bolivia', 'Bosnia-Herzegovina', 'Bulgaria', 'Camerún',
  'Costa de Marfil', 'República Democrática del Congo', 'Haiti', 'Iraq', 'Kenia',
  'Kuwait', 'Laos; oficialmente: República Democrática Popular Lao', 'Líbano',
  'Mónaco', 'Nepal', 'Papúa-Nueva Guinea', 'Sudán del Sur', 'Siria',
  'Venezuela', 'Vietnam', 'Islas Vírgenes Británicas', 'Yemen',
  // Black list (llamado a la acción)
  'Irán', 'Corea del Norte', 'Myanmar, Birmania',
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
export function calcularScoreTotal(scores, tipo, pesosOverride) {
  const pesos = pesosOverride || PESOS_CONSOLIDADO[tipo]
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

// ============================================================
// PERFIL DE RIESGO POR SUJETO OBLIGADO (clave = clase_dato)
// ------------------------------------------------------------
// Cada actividad modula la calificación en 4 dimensiones:
//   · pesos          → peso de cada factor (cliente/geo/productos/canales)
//   · listaPais      → 'LC' (UIF), 'FT' (GAFI sobre LC) o 'FT+LC'
//   · pisoRiesgo     → nivel mínimo que no puede bajar la calificación
//   · ocultar        → criterios que NO se muestran para esta actividad
//   · pesosCriterio  → override del peso de un criterio puntual
//   · labels         → terminología específica de la actividad
// El perfil `default` reproduce el comportamiento base (sin sujeto obligado).
// NOTA: los pesos son una propuesta inicial pensada para calibrarse.
// ============================================================
export const PERFIL_SUJETO_OBLIGADO = {
  // 40 — Metales y Piedras Preciosas
  40: {
    nombre: 'Metales y Piedras Preciosas', listaPais: 'LC', pisoRiesgo: null,
    pesos: {
      fisica:   { cliente: 0.45, geo: 0.25, productos: 0.20, canales: 0.10 },
      juridica: { cliente: 0.40, geo: 0.15, productos: 0.30, canales: 0.15 },
    },
    ocultar: { cliente: ['protectoras'] },
    pesosCriterio: { cliente: { efectivo: 0.15 } },
    labels: {
      efectivo:  'Pago en efectivo por bienes de alto valor',
      servicios: 'Tipo de bien (metal / piedra) comercializado',
    },
  },
  // 41 — Casas de Empeño
  41: {
    nombre: 'Casas de Empeño', listaPais: 'LC', pisoRiesgo: null,
    pesos: {
      fisica:   { cliente: 0.55, geo: 0.20, productos: 0.15, canales: 0.10 },
      juridica: { cliente: 0.45, geo: 0.10, productos: 0.25, canales: 0.20 },
    },
    pesosCriterio: { cliente: { efectivo: 0.15 } },
    labels: {
      efectivo:  'Efectivo en operaciones de empeño',
      servicios: 'Bienes recibidos en garantía',
    },
  },
  // 42 — Organizaciones Sin Fines de Lucro (ONG) — riesgo FT
  //   Alineado con la metodología N04 y el formulario F08 de Fundación Visión Mundial:
  //   - Sub-tipos (categorías del cliente): Donante (>= $1.000 / mayor),
  //     Donante Cooperación Internacional y Beneficiario Externo.
  //   - Persona física: solo 6 criterios de cliente (se ocultan protectoras,
  //     info del ingreso y estructura administrativa).
  //   - "Aparece negativo en el BPS" = listas de observados.
  //   Los umbrales que definen si un donante se califica o es bajo automático
  //   (anónimo < $300; por debajo < $1.000) son una regla de negocio aparte.
  42: {
    nombre: 'Organizaciones Sin Fines de Lucro', listaPais: 'FT', pisoRiesgo: 'medio',
    // Esquema base = Donante / Beneficiario externo (lo sobreescribe cada variante)
    pesos: {
      fisica:   { cliente: 0.40, geo: 0.20, productos: 0.20, canales: 0.20 },
      juridica: { cliente: 0.50, geo: 0.15, productos: 0.20, canales: 0.15 },
    },
    ocultar: { cliente: ['protectoras', 'info_ingreso'] },
    ocultarPorTipo: {
      fisica:   { cliente: ['struct_admin'] },   // física FVM usa 6 criterios
      juridica: { geo: ['op_nacional'] },         // FVM jurídica no usa operación nacional
    },
    // Pesos de criterio exactos de la metodología FVM (por tipo de persona)
    pesosCriterioPorTipo: {
      fisica: {
        cliente: { acceso_info: 0.15, pep: 0.20, listas_obs: 0.15, profesion: 0.20, ingreso_mensual: 0.15, efectivo: 0.15 },
      },
      juridica: {
        cliente: { acceso_info: 0.10, pep: 0.10, actividad_eco: 0.10, listas_obs: 0.10, struct_acc: 0.10, struct_admin: 0.10, anos_operacion: 0.10, ingreso_mensual: 0.10, efectivo: 0.10, vol_trans: 0.05, cant_trans: 0.05 },
        geo:     { ubicacion_geo: 0.30, casa_matriz: 0.30, transfronterizo: 0.20, op_internacional: 0.20 },
      },
    },
    labels: {
      listas_obs:      'Aparece negativo en el BPS',
      ingreso_mensual: 'Ingreso / monto promedio mensual',
      actividad_eco:   'Actividad económica',
      efectivo:        'Dinero en efectivo',
      transfronterizo: 'Dinero transfronterizo',
      anos_operacion:  'Años de operación',
    },
    // Categorías del cliente de la ONG (F02–F05). Cada una cambia foco y pesos.
    variantes: {
      donante: {
        etiqueta: 'Donante (≥ $1.000 / mayor)',
        pesos: {
          fisica:   { cliente: 0.40, geo: 0.20, productos: 0.20, canales: 0.20 },
          juridica: { cliente: 0.50, geo: 0.15, productos: 0.20, canales: 0.15 },
        },
        labels: {
          ingreso_mensual: 'Monto y origen de la donación',
          profesion:       'Actividad económica del donante',
          actividad_eco:   'Actividad económica del donante',
          pais_origen:     'País de origen de los fondos',
          ubicacion_geo:   'País de origen de los fondos',
          transfronterizo: 'Origen transfronterizo de los fondos',
        },
      },
      coop_internacional: {
        etiqueta: 'Cooperación Internacional',
        // FVM: la zona geográfica domina para la cooperación internacional
        pesos: {
          fisica:   { cliente: 0.30, geo: 0.40, productos: 0.15, canales: 0.15 },
          juridica: { cliente: 0.30, geo: 0.40, productos: 0.15, canales: 0.15 },
        },
        labels: {
          actividad_eco:   'Tipo de cooperante (gobierno / organismo / fundación)',
          ubicacion_geo:   'País / sede del cooperante',
          casa_matriz:     'País de la casa matriz del cooperante',
          transfronterizo: 'Fondos transfronterizos de cooperación',
        },
      },
      beneficiario: {
        etiqueta: 'Beneficiario Externo',
        pesos: {
          fisica:   { cliente: 0.40, geo: 0.20, productos: 0.20, canales: 0.20 },
          juridica: { cliente: 0.50, geo: 0.15, productos: 0.20, canales: 0.15 },
        },
        labels: {
          ingreso_mensual: 'Monto de fondos recibidos del proyecto',
          profesion:       'Destino / uso de los fondos',
          actividad_eco:   'Destino / uso de los fondos',
          pais_origen:     'País de destino de los fondos',
          ubicacion_geo:   'País de destino de los fondos',
          transfronterizo: 'Destino transfronterizo de los fondos',
        },
      },
    },
  },
  // 43 — Casinos
  43: {
    nombre: 'Casinos', listaPais: 'LC', pisoRiesgo: 'medio',
    pesos: {
      fisica:   { cliente: 0.40, geo: 0.15, productos: 0.15, canales: 0.30 },
      juridica: { cliente: 0.35, geo: 0.10, productos: 0.20, canales: 0.35 },
    },
    ocultar: { cliente: ['protectoras'] },
    pesosCriterio: { cliente: { efectivo: 0.15 } },
    labels: {
      efectivo:    'Uso de efectivo / compra de fichas',
      como_labor:  'Modalidad de juego',
      servicios:   'Tipo de juego ofrecido',
    },
  },
  // 44 — Administración de Dinero
  44: {
    nombre: 'Administración de Dinero', listaPais: 'LC', pisoRiesgo: 'medio',
    pesos: {
      fisica:   { cliente: 0.40, geo: 0.25, productos: 0.15, canales: 0.20 },
      juridica: { cliente: 0.35, geo: 0.15, productos: 0.20, canales: 0.30 },
    },
    labels: {
      vol_trans:  'Volumen de fondos administrados por terceros',
      cant_trans: 'Cantidad de operaciones por cuenta de terceros',
    },
  },
  // 45 — Remesas y Transferencias
  45: {
    nombre: 'Remesas y Transferencias', listaPais: 'FT+LC', pisoRiesgo: 'medio',
    pesos: {
      fisica:   { cliente: 0.30, geo: 0.45, productos: 0.05, canales: 0.20 },
      juridica: { cliente: 0.30, geo: 0.35, productos: 0.10, canales: 0.25 },
    },
    labels: {
      transfronterizo: 'Corredor de envío / recepción',
      tipo_vendedor:   'Agentes / subagentes',
      cant_lugares:    'Puntos de envío distintos',
    },
  },
  // 46 — Emisión / Operación de Tarjetas
  46: {
    nombre: 'Emisión / Operación de Tarjetas', listaPais: 'LC', pisoRiesgo: null,
    pesos: {
      fisica:   { cliente: 0.45, geo: 0.20, productos: 0.20, canales: 0.15 },
      juridica: { cliente: 0.40, geo: 0.10, productos: 0.30, canales: 0.20 },
    },
    labels: {
      servicios: 'Tipo de tarjeta (prepago / anónima / recargable)',
    },
  },
  // 47 — Facilidades Crediticias
  47: {
    nombre: 'Facilidades Crediticias', listaPais: 'LC', pisoRiesgo: null,
    pesos: {
      fisica:   { cliente: 0.55, geo: 0.20, productos: 0.15, canales: 0.10 },
      juridica: { cliente: 0.50, geo: 0.10, productos: 0.25, canales: 0.15 },
    },
    labels: {
      ingreso_mensual: 'Capacidad y origen de pago',
      efectivo:        'Cancelaciones anticipadas en efectivo',
    },
  },
  // 48 — Servicios Fiduciarios
  48: {
    nombre: 'Servicios Fiduciarios', listaPais: 'LC', pisoRiesgo: 'medio',
    pesos: {
      fisica:   { cliente: 0.55, geo: 0.30, productos: 0.15, canales: 0 },
      juridica: { cliente: 0.55, geo: 0.15, productos: 0.15, canales: 0.15 },
    },
    pesosCriterio: { cliente: { struct_acc: 0.25, acceso_info: 0.15 } },
    labels: {
      struct_acc:  'Capas societarias hasta el beneficiario final',
      acceso_info: 'Transparencia del beneficiario final',
    },
  },
  // 49 — Bienes Inmuebles
  49: {
    nombre: 'Bienes Inmuebles', listaPais: 'LC', pisoRiesgo: 'medio',
    pesos: {
      fisica:   { cliente: 0.40, geo: 0.25, productos: 0.25, canales: 0.10 },
      juridica: { cliente: 0.35, geo: 0.15, productos: 0.35, canales: 0.15 },
    },
    labels: {
      servicios:       'Valor y tipo de inmueble',
      efectivo:        '% de la operación pagado en efectivo',
      ingreso_mensual: 'Origen de fondos para la compra',
    },
  },
  // Por defecto: metodología base sin diferenciación por actividad
  default: { nombre: 'General', listaPais: 'LC', pisoRiesgo: null },
}

const _BASE_CRITERIOS = {
  cliente:   CRITERIOS_CLIENTE,
  geo:       CRITERIOS_GEO,
  productos: CRITERIOS_PRODUCTOS,
  canales:   CRITERIOS_CANALES,
}

// Devuelve el perfil de la actividad (o el `default`)
export function perfilSujeto(claseDato) {
  return PERFIL_SUJETO_OBLIGADO[Number(claseDato)] || PERFIL_SUJETO_OBLIGADO.default
}

// Sub-tipos disponibles del cliente para esta actividad (p. ej. donante/beneficiario en ONG)
export function variantesDe(claseDato) {
  const v = perfilSujeto(claseDato).variantes
  return v ? Object.keys(v).map(k => ({ key: k, etiqueta: v[k].etiqueta || k })) : []
}

// Perfil efectivo = perfil de la actividad con la variante (sub-tipo) fusionada encima
export function perfilEfectivo(claseDato, variante) {
  const base = perfilSujeto(claseDato)
  const v = variante && base.variantes && base.variantes[variante]
  if (!v) return base
  const mergeFactorMap = (a = {}, b = {}) => {
    const out = {}
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (Array.isArray(a[k]) || Array.isArray(b[k])) out[k] = [...(a[k] || []), ...(b[k] || [])]
      else out[k] = { ...(a[k] || {}), ...(b[k] || {}) }
    }
    return out
  }
  return {
    ...base,
    listaPais:     v.listaPais || base.listaPais,
    pisoRiesgo:    v.pisoRiesgo !== undefined ? v.pisoRiesgo : base.pisoRiesgo,
    pesos:         v.pesos || base.pesos,
    ocultar:       mergeFactorMap(base.ocultar, v.ocultar),
    pesosCriterio: mergeFactorMap(base.pesosCriterio, v.pesosCriterio),
    labels:        { ...(base.labels || {}), ...(v.labels || {}) },
  }
}

// Pesos de factores para (actividad, tipo de persona, variante)
export function pesosPerfil(claseDato, tipo, variante) {
  const p = perfilEfectivo(claseDato, variante)
  return (p.pesos && p.pesos[tipo]) || PESOS_CONSOLIDADO[tipo]
}

// Lista de país aplicable ('LC' | 'FT' | 'FT+LC')
export function listaPaisPerfil(claseDato, variante) {
  return perfilEfectivo(claseDato, variante).listaPais || 'LC'
}

// Criterios visibles de un factor, ya con ocultamiento, pesos y terminología aplicados.
// El ocultamiento y los pesos por criterio pueden ser compartidos (por factor) o
// específicos por tipo de persona (ocultarPorTipo / pesosCriterioPorTipo).
export function criteriosPerfil(claseDato, tipo, factor, variante) {
  const base = (_BASE_CRITERIOS[factor] && _BASE_CRITERIOS[factor][tipo]) || []
  const p = perfilEfectivo(claseDato, variante)
  const ocultar = [
    ...((p.ocultar && p.ocultar[factor]) || []),
    ...((p.ocultarPorTipo && p.ocultarPorTipo[tipo] && p.ocultarPorTipo[tipo][factor]) || []),
  ]
  const pesosOv = {
    ...((p.pesosCriterio && p.pesosCriterio[factor]) || {}),
    ...((p.pesosCriterioPorTipo && p.pesosCriterioPorTipo[tipo] && p.pesosCriterioPorTipo[tipo][factor]) || {}),
  }
  const labels  = p.labels || {}
  return base
    .filter(c => !ocultar.includes(c.key))
    .map(c => ({
      ...c,
      peso:  pesosOv[c.key] != null ? pesosOv[c.key] : c.peso,
      label: labels[c.key] || c.label,
    }))
}

// Eleva la calificación al piso de riesgo de la actividad si cae por debajo
export function aplicarPisoRiesgo(nivel, piso) {
  if (!piso || !nivel) return nivel
  const orden = { bajo: 1, medio: 2, alto: 3 }
  return (orden[nivel] || 0) >= (orden[piso] || 0) ? nivel : piso
}
