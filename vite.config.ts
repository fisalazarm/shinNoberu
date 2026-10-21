import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // jsdom: el código del OPF usa DOMParser y XMLSerializer, que en Node no existen.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
