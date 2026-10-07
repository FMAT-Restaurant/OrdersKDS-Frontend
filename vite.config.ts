import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

// @originjs/vite-plugin-federation ships CJS only. createRequire bridges the
// ESM/CJS boundary so TypeScript's nodenext module resolution stays happy.
const require = createRequire(import.meta.url);
const federation = (require('@originjs/vite-plugin-federation') as typeof import('@originjs/vite-plugin-federation')).default;



export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'ordersKds',
      filename: 'remoteEntry.js',
      exposes: {
        './KdsApp': './src/KdsApp.tsx',
        './IntermediateDishesApp': './src/IntermediateDishesApp.tsx',
        './OrderTicketWidget': './src/OrderTicketWidget.tsx',
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: 'reports/junit.xml',
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'cobertura'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', '.eslintrc.cjs'],
    },
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-site',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  },
  preview: {
    cors: true,
    port: 4173,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-site',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  },
});
