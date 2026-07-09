import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Only apply the GitHub Pages subpath during production builds — local dev stays at "/".
  base: command === 'build' ? '/Connections-Test/' : '/',
  plugins: [react()],
}))
