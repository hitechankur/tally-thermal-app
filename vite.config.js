import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    origin: 'http://0.0.0.0:5000',
    // --- ADD THIS SECTION ---
    hmr: {
      clientPort: 443 // Important for Replit's HMR over HTTPS
    },
    allowedHosts: [
      // Add the specific host from the error message if you want to be precise
      '45b26750-a1b4-447f-ab7f-15ea3b204954-00-1rvfjr5dis12t.sisko.replit.dev',
      // Or, for more general Replit compatibility, use a wildcard:
      '*'
    ]
    // --- END ADDED SECTION ---
  }
})