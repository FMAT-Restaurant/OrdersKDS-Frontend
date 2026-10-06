/** @type {import('tailwindcss').Config} */
module.exports = {
  // Aísla todos los estilos de Tailwind bajo la clase .orders-kds-root
  important: '.orders-kds-root',

  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  corePlugins: {
    // Evita que Tailwind modifique estilos globales de body, html, h1, button, etc.
    preflight: false,
  },

  theme: {
    extend: {
      colors: {
        fmat: {
          primary: '#1E40AF',
          secondary: '#DB2777',
        },
      },
      borderRadius: {
        fmat: '8px',
      },
    },
  },
  plugins: [],
};
