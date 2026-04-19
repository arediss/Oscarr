/**
 * Shared Tailwind preset for Oscarr — colors, fonts, animations.
 *
 * Used by the core frontend (packages/frontend/tailwind.config.js) and intended to be copied
 * verbatim into any plugin that wants to use Oscarr's design language while self-compiling its
 * own CSS bundle. Plugins ship with this file inline so they stay portable (no require to the
 * core repo from ~/Oscarr/plugins/).
 *
 * Keep this in sync with the Oscarr major version: a color rename here = a plugin visual regression
 * after the next core upgrade. Version the preset with the core if you rename anything.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  theme: {
    extend: {
      colors: {
        ndp: {
          bg: '#0a0e17',
          surface: '#111827',
          'surface-light': '#1f2937',
          'surface-hover': '#283548',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          'accent-dark': '#4f46e5',
          gold: '#f59e0b',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          text: '#f3f4f6',
          'text-muted': '#9ca3af',
          'text-dim': '#6b7280',
          border: '#1f2937',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        shimmer: 'shimmer 2s infinite',
        shake: 'shake 0.4s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '15%, 45%, 75%': { transform: 'translateX(-6px)' },
          '30%, 60%, 90%': { transform: 'translateX(6px)' },
        },
      },
    },
  },
};
