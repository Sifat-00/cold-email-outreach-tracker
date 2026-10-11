/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        accent: {
          50: "#f3f0ff", 100: "#e9e3ff", 200: "#d4caff", 300: "#b5a1ff", 400: "#9471ff",
          500: "#7c4dff", 600: "#6a35f5", 700: "#5a26d6", 800: "#4a21ad", 900: "#3e1f8a",
        },
        ink: { 950: "#0b0b14", 900: "#11111c", 850: "#161624", 800: "#1c1c2e", 700: "#2a2a40", 600: "#3a3a55" },
      },
      boxShadow: { glow: "0 0 0 1px rgba(124,77,255,.25), 0 8px 30px -8px rgba(124,77,255,.45)" },
    },
  },
  plugins: [],
};
