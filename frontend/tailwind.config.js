/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mining: {
          dark: '#0F172A',
          card: '#1E293B',
          accent: '#F59E0B',
          danger: '#EF4444',
          success: '#10B981',
          warning: '#F59E0B',
          info: '#3B82F6'
        }
      }
    },
  },
  plugins: [],
}
