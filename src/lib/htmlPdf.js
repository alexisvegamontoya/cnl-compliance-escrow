// Convierte un HTML autocontenido en un Blob PDF, sin dejar nada en el servidor.
// Carga html2pdf.js de forma diferida (solo cuando se usa) para no engordar la app.
export async function htmlAPdfBlob(html, { filenameHint = 'informe' } = {}) {
  const html2pdf = (await import('html2pdf.js')).default
  const cont = document.createElement('div')
  cont.style.cssText = 'position:fixed; left:-99999px; top:0; width:794px; background:#fff; z-index:-1;'
  cont.innerHTML = html
  document.body.appendChild(cont)
  try {
    return await html2pdf().set({
      margin: [10, 10, 12, 10],
      filename: `${filenameHint}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(cont).outputPdf('blob')
  } finally {
    document.body.removeChild(cont)
  }
}
