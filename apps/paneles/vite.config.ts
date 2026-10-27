import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del .env de la raíz (solo las VITE_ llegan al navegador).
  envDir: '../..',
  server: { port: 5176, proxy: { '/api': 'http://localhost:3001' } },
});
