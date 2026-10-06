/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: { 950: "#050a14", 900: "#0a1220", 800: "#101b2e", 700: "#1a2740" },
      },
      keyframes: {
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,.6)" }, "100%": { boxShadow: "0 0 0 14px rgba(239,68,68,0)" } },
        slideIn: { "0%": { transform: "translateX(110%)" }, "100%": { transform: "translateX(0)" } },
      },
      animation: { pulseRing: "pulseRing 1.4s ease-out infinite", slideIn: "slideIn .25s ease-out" },
    },
  },
  plugins: [],
};
