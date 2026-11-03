import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // La versión que enseña «Acerca de».
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // jsdom: el código del OPF usa DOMParser y XMLSerializer, que en Node no existen.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
