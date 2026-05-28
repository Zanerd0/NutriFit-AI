import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward all /api/* requests from the browser to the backend service.
      // In Docker Compose the backend container is reachable at http://backend:5000.
      // Outside Docker (plain `npm run dev`) it resolves to http://localhost:5000.
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
    },
  },
})

