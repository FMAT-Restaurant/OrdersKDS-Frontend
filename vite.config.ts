import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

// @originjs/vite-plugin-federation ships CJS only. createRequire bridges the
// ESM/CJS boundary so TypeScript's nodenext module resolution stays happy.
const require = createRequire(import.meta.url);
const federation = require('@originjs/vite-plugin-federation') as typeof import('@originjs/vite-plugin-federation')['default'];



const sharedHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const sharedProxy = {
  '/orders': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
  '/kds': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://127.0.0.1:8000',
    ws: true,
  },
};

export default defineConfig(({ mode }) => {
  const isCocina = mode === 'cocina' || process.env.VITE_FEDERATION_NAME === 'cocinaApp';
  const federationName = isCocina
    ? 'cocinaApp'
    : (process.env.VITE_FEDERATION_NAME || 'ordenesApp');
  const defaultPort = isCocina ? 5179 : 5177;
  const outDir = isCocina ? 'dist-cocina' : 'dist';

  return {
    plugins: [
      react(),
      federation({
        name: federationName,
        filename: 'remoteEntry.js',
        exposes: {
          './App': './src/App.tsx',
          './KdsApp': './src/KdsApp.tsx',
          './IntermediateDishesApp': './src/IntermediateDishesApp.tsx',
          './OrderTicketWidget': './src/OrderTicketWidget.tsx',
          './ReadyOrdersAlert': './src/ReadyOrdersAlert.tsx',
        },
        shared: ['react', 'react-dom'],
      }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      testTimeout: 10000,
      setupFiles: ['./src/setupTests.ts'],
      typecheck: {
        tsconfig: './tsconfig.vitest.json',
      },
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
      reporters: ['default', 'junit'],
      outputFile: 'reports/junit.xml',
      exclude: ['**/node_modules/**', '**/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'cobertura'],
        exclude: ['src/main.tsx', 'src/vite-env.d.ts', '.eslintrc.cjs', 'src/setupTests.ts'],
      },
    },
    build: {
      outDir,
      modulePreload: false,
      target: 'esnext',
      minify: false,
      cssCodeSplit: false,
    },
    server: {
      port: defaultPort,
      strictPort: true,
      cors: true,
      host: '0.0.0.0',
      headers: sharedHeaders,
      proxy: sharedProxy,
    },
    preview: {
      cors: true,
      port: defaultPort,
      strictPort: true,
      host: '0.0.0.0',
      headers: sharedHeaders,
      proxy: sharedProxy,
    },
  };
});
