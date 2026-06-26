/**
 * Alertas automáticas por correo usando EmailJS
 * Reutiliza las variables de entorno de CanalDenuncias
 */

const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

async function sendEmail(variables) {
  try {
    const { default: emailjs } = await import('@emailjs/browser')
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, variables, PUBLIC_KEY)
  } catch (err) {
    console.warn('EmailJS error:', err)
  }
}

/** Alerta cuando se crea un nuevo ROS */
export async function alertaROS({ nombreReportado, monto, moneda, descripcion, fecha, userEmail }) {
  await sendEmail({
    tipo:        'ALERTA — Nuevo Reporte de Operación Sospechosa',
    sujeto:      `ROS creado: ${nombreReportado}`,
    descripcion: `Se ha registrado un nuevo ROS.\n\nReportado: ${nombreReportado}\nMonto: ${monto} ${moneda}\nFecha: ${fecha}\nDescripción: ${descripcion}`,
    fecha_hecho: fecha,
    area:        'Operaciones Sospechosas',
    confidencial: 'Sí',
    denunciante:  userEmail || 'Sistema',
    fecha_envio:  new Date().toLocaleString('es-CR'),
  })
}

/** Alerta cuando un cliente aparece en listas internacionales */
export async function alertaListasCliente({ nombreCliente, identificacion, userEmail }) {
  await sendEmail({
    tipo:        'ALERTA — Cliente en Listas Internacionales',
    sujeto:      `Cliente en listas: ${nombreCliente}`,
    descripcion: `El cliente ${nombreCliente} (ID: ${identificacion}) ha sido marcado como APARECE EN LISTAS INTERNACIONALES DE INVESTIGACIÓN. Se requiere revisión inmediata conforme al Artículo 15 de la Ley 7786.`,
    fecha_hecho: new Date().toLocaleDateString('es-CR'),
    area:        'Debida Diligencia / Base de Clientes',
    confidencial: 'Sí',
    denunciante:  userEmail || 'Sistema',
    fecha_envio:  new Date().toLocaleString('es-CR'),
  })
}

/** Alerta cuando se asigna un cuestionario */
export async function alertaCuestionario({ titulo, tenantNombre, fechaLimite, userEmail }) {
  await sendEmail({
    tipo:        'AVISO — Nuevo Cuestionario de Evaluación Asignado',
    sujeto:      `Cuestionario asignado: ${titulo}`,
    descripcion: `Se ha asignado el cuestionario "${titulo}" a ${tenantNombre}.\n\nFecha límite: ${fechaLimite || 'Sin fecha límite'}\n\nIngrese a la plataforma CNL en la sección Cuestionarios para descargarlo y completarlo.`,
    fecha_hecho: new Date().toLocaleDateString('es-CR'),
    area:        'Cuestionarios de Evaluación',
    confidencial: 'No',
    denunciante:  userEmail || 'Sistema',
    fecha_envio:  new Date().toLocaleString('es-CR'),
  })
}
