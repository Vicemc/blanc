import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Libs pesadas usadas só em rotas específicas (Mapas / grafo da Wiki).
          // As rotas já são lazy em App.tsx, então esses chunks só baixam ao entrar nelas.
          if (id.includes('leaflet')) return 'maps'
          if (id.includes('force-graph') || id.includes('d3-force') || id.includes('d3-')) return 'graph'
          return 'vendor'
        },
      },
    },
  },
})
