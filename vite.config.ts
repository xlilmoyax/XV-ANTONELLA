import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // IPv4 explícito: evita que el navegador falle por resolución IPv6 de localhost.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
