/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['default', 'junit'],
    outputFile: 'junit.xml',
    coverage: {
      provider: 'v8',
      // lcov   → consumed by SonarCloud (sonar.javascript.lcov.reportPaths)
      // cobertura → consumed by the GitHub Actions coverage summary step
      reporter: ['text', 'lcov', 'cobertura'],
      // main.tsx is the app entry point; vite-env.d.ts is a generated type declaration.
      // Neither contains testable logic, so both are excluded from the coverage gate.
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', '.eslintrc.cjs']
    }
  },
  // Security headers applied during local development (pnpm dev).
  // Mirrors production headers set by the Nginx config in the Docker image.
  // COEP + COOP are required for SharedArrayBuffer (used by some Playwright helpers).
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-site',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    }
  },
  // The same headers must be present on the preview server (pnpm preview) because
  // E2E tests and the ZAP baseline scan run against it, not against the dev server.
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-site',
      'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    }
  }
})
