import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pin the port to Tauri's `build.devUrl`. Without strictPort Vite silently
  // falls back to another port when 5173 is taken, and `tauri dev` then waits
  // forever for a dev server that never appears on devUrl.
  server: {
    port: 5173,
    strictPort: true,
  },
})
