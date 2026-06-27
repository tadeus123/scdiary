import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/cause/',
  plugins: [react()],
  server: {
    port: 5180,
  },
  preview: {
    port: 5180,
  },
})
