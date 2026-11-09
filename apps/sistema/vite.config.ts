import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // En producción cada front cuelga de una ruta (VITE_BASE=/admin/, etc.); en desarrollo, la raíz.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del .env de la raíz (solo las VITE_ llegan al navegador).
  envDir: '../..',
  server: { port: 5177, proxy: { '/api': 'http://localhost:3001' } },
});
