/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Add this section
      fontFamily: {
        'sans': ['Inter', 'sans-serif'], // Keeps Inter as the default
        'franklin': ['"Libre Franklin"', 'sans-serif']
      }
    },
  },
  plugins: [],
}
