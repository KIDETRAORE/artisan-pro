import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    // Force Vite à charger PostCSS pour traiter Tailwind
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
  resolve: {
    alias: {
      // Permet d'utiliser '@' pour pointer vers 'src' (très courant en React)
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Important pour le Monorepo : surveiller les changements dans les packages partagés
    watch: {
      usePolling: true,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});