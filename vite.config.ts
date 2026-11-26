import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { createRequire } from 'node:module';

// @originjs/vite-plugin-federation ships CJS only. createRequire bridges the
// ESM/CJS boundary so TypeScript's nodenext module resolution stays happy.
const require = createRequire(import.meta.url);
const federation = require('@originjs/vite-plugin-federation') as typeof import('@originjs/vite-plugin-federation')['default'];



const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const LOCAL_FEDERATION_ORIGINS = [
  'http://localhost:5177',
  'http://127.0.0.1:5177',
  'http://localhost:5179',
  'http://127.0.0.1:5179',
];

function parseList(value: string | undefined, fallback: readonly string[]): string[] {
  const parsed = value?.split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
  return parsed.length > 0 ? parsed : [...fallback];
}

function addUrlOrigin(sources: Set<string>, value: string | undefined): void {
  if (!value || value.toLowerCase() === 'auto') return;
  try {
    const url = new URL(value);
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      sources.add(`${url.protocol}//${url.host}`);
      if (url.protocol === 'http:') sources.add(`ws://${url.host}`);
      if (url.protocol === 'https:') sources.add(`wss://${url.host}`);
    }
  } catch {
    return;
  }
}

function buildContentSecurityPolicy(
  env: Record<string, string>,
  defaultPort: number,
  isDevelopment: boolean,
): string {
  const connectSources = new Set([
    "'self'",
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'ws://localhost:8000',
    'ws://127.0.0.1:8000',
    `ws://localhost:${defaultPort}`,
    `ws://127.0.0.1:${defaultPort}`,
    ...parseList(env.VITE_CSP_CONNECT_SRC, []),
  ]);
  addUrlOrigin(connectSources, env.VITE_API_URL);
  addUrlOrigin(connectSources, env.VITE_API_BASE_URL);
  addUrlOrigin(connectSources, env.VITE_WS_URL);

  const federationSources = [
    ...LOCAL_FEDERATION_ORIGINS,
    ...parseList(env.VITE_CSP_FEDERATION_SRC, []),
  ].join(' ');
  const scriptSources = [
    "'self'",
    ...(isDevelopment ? ["'unsafe-inline'"] : []),
    federationSources,
  ].join(' ');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources}`,
    `style-src 'self' 'unsafe-inline' ${federationSources}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    "worker-src 'self' blob:",
  ].join('; ');
}

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
  const env = loadEnv(mode, process.cwd(), '');
  const allowedOrigins = parseList(env.VITE_CORS_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  if (allowedOrigins.includes('*')) {
    throw new Error('VITE_CORS_ALLOWED_ORIGINS must not contain a wildcard origin.');
  }

  const isCocina = mode === 'cocina' || env.VITE_FEDERATION_NAME === 'cocinaApp';
  const federationName = isCocina
    ? 'cocinaApp'
    : (env.VITE_FEDERATION_NAME || 'ordenesApp');
  const defaultPort = isCocina ? 5179 : 5177;
  const outDir = isCocina ? 'dist-cocina' : 'dist';
  const sharedHeaders = {
    'Content-Security-Policy': buildContentSecurityPolicy(
      env,
      defaultPort,
      mode === 'development',
    ),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };

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
      cors: { origin: allowedOrigins },
      host: '0.0.0.0',
      headers: sharedHeaders,
      proxy: sharedProxy,
    },
    preview: {
      cors: { origin: allowedOrigins },
      port: defaultPort,
      strictPort: true,
      host: '0.0.0.0',
      headers: sharedHeaders,
      proxy: sharedProxy,
    },
  };
});
