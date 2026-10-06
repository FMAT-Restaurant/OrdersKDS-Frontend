import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    (federation as any)({
      name: 'ordersKds',
      filename: 'remoteEntry.js',
      exposes: {
        './KdsApp': './src/KdsApp.tsx',
        './IntermediateDishesApp': './src/IntermediateDishesApp.tsx',
        './OrderTicketwidget': './src/OrderTicketwidget.tsx',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  // CONFIGURACIÓN PARA FIX DE VITEST:
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    exclude: ['**/node_modules/**', '**/e2e/**'], // Ignora los tests e2e de Playwright
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  preview: {
    cors: true,
    port: 4173,
  },
});