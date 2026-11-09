import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // En producción cada front cuelga de una ruta (VITE_BASE=/admin/, etc.); en desarrollo, la raíz.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
