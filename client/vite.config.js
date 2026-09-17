import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const socketServerUrl = process.env.VITE_SOCKET_SERVER_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      '/socket.io': {
        target: socketServerUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
