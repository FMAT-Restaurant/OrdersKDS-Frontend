// ESLint flat config (ESLint 9+). The legacy .eslintrc format is no longer supported.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // Enforces the Rules of Hooks and exhaustive-deps (required by TanStack Query usage).
      reactHooks.configs.flat.recommended,
      // Warns when a component exported by a module is not suitable for Fast Refresh,
      // which would cause full-page reloads during development instead of HMR.
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
