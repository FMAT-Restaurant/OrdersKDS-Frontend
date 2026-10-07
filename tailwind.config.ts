import type { Config } from 'tailwindcss';

/**
 * TASK-08 — Tailwind CSS scoping for Module Federation
 *
 * Isolation rules:
 *  - `preflight: false`   → does not overwrite host's body/html/h1/button
 *  - `important: '.orders-kds-root'` → generates rules with higher specificity
 *    without using `!important` (e.g. `.orders-kds-root .text-red-500 { ... }`)
 *  - NO `important: true` → that would add !important to all utilities
 *
 * Semantic tokens for Success/Warning/Error/Info are pending OP-03
 * (to be agreed upon with other teams). Placeholders are left with comments.
 */
const config: Config = {
  // Isolates all Tailwind styles under the .orders-kds-root class
  important: '.orders-kds-root',

  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  corePlugins: {
    // Prevents Tailwind from modifying global styles on body, html, h1, button, etc.
    preflight: false,
  },

  theme: {
    extend: {
      colors: {
        fmat: {
          // Base tokens for FMAT design
          primary: '#1E40AF',
          secondary: '#DB2777',

          // Semantic tokens — pending OP-03 (to be agreed upon with other teams)
          // success: '#???',
          // warning: '#???',
          // error:   '#???',
          // info:    '#???',
        },
      },
      borderRadius: {
        fmat: '8px',
      },
    },
  },

  plugins: [],
};

export default config;
