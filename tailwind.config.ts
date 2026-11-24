import type { Config } from 'tailwindcss';

/**
 * TASK-08 — Tailwind CSS scoping for Module Federation & FMAT Design Guide v2.0
 *
 * Isolation rules:
 *  - `preflight: false`   → does not overwrite host's body/html/h1/button
 *  - `important: '.orders-kds-root'` → generates rules with higher specificity
 *    without using `!important` (e.g. `.orders-kds-root .text-red-500 { ... }`)
 *  - Semantic tokens and brand palette match FMAT_RESTAURANT_Guia_Visual_Componentes.md:
 *    Primary: #C2410C, Hover: #9A3412, Accent: #F97316, Soft: #FFF7ED
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
          primary: '#C2410C',
          'primary-hover': '#9A3412',
          accent: 'var(--color-primary-accent)',
          soft: 'var(--color-primary-soft)',
          secondary: '#C2410C',
        },
        primary: {
          DEFAULT: '#C2410C',
          hover: '#9A3412',
          accent: 'var(--color-primary-accent)',
          soft: 'var(--color-primary-soft)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        ink: 'var(--color-ink)',
        body: 'var(--color-body)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
      },
      borderRadius: {
        sm: '4px',
        control: '8px',
        card: '12px',
        fmat: '8px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
    },
  },

  plugins: [],
};

export default config;
