import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Separa las dependencias pesadas en chunks propios.
 * Cada grupo cambia con poca frecuencia, así que el navegador los mantiene en
 * caché entre despliegues: al publicar una versión nueva solo se vuelve a
 * descargar el código de la aplicación, no las librerías.
 */
function manualChunks(id) {
  if (!id.includes('node_modules')) return

  // xlsx — el más pesado; solo lo usan carga masiva, plantillas y exportaciones
  if (id.includes('/xlsx/') || id.includes('\\xlsx\\')) return 'vendor-xlsx'

  // Gráficas del dashboard (recharts arrastra d3-*)
  if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|delaunator|robust-predicates)/.test(id)) {
    return 'vendor-charts'
  }

  // React y enrutador — juntos con sus dependencias directas: separarlos rompe
  // el orden de inicialización y crea un ciclo entre chunks
  if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run|use-sync-external-store|react-is|loose-envify|js-tokens|object-assign)[\\/]/.test(id)) {
    return 'vendor-react'
  }

  if (id.includes('@supabase')) return 'vendor-supabase'
  if (id.includes('lucide-react')) return 'vendor-icons'
  if (/[\\/]node_modules[\\/](date-fns|csv-parse|@emailjs)/.test(id)) return 'vendor-utils'

  return 'vendor'
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
})
