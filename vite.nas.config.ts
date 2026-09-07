import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';

// Static React assets plus a PHP/MySQL API, portable to the user's virtual host.
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  build: { outDir: 'dist-nas', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5174, strictPort: true,
    proxy: { '/api/': { target: 'http://127.0.0.1:8088' } } },
});
