/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      animation: {
        'bounce': 'bounce 0.5s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'head': 'head 0.3s steps(1) infinite',
      },
      keyframes: {
        bounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        },
        head: {
          '0%, 100%': { backgroundPosition: 'top' },
          '50%': { backgroundPosition: 'bottom' },
        },
      },
      boxShadow: {
        'inner-lg': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
} 