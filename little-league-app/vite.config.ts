import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL is read from env (e.g. .env files or shell) if set.
// If not set, the hook falls back to "/api" — correct for same-origin Pages deploys.
export default defineConfig({
  plugins: [react()],
})
