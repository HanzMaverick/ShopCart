import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api se reenvia al backend (sin problemas de CORS). En produccion, servir el build detras del mismo origen
// o definir VITE_API_URL y agregar el origen a CORS_ORIGINS del backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: process.env['VITE_DEV_API'] ?? 'http://localhost:3000', changeOrigin: true } } },
});
