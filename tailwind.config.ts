import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── BeefMaps exact palette ──────────────────────────────────────
        outline: "#a8898c",
        "surface-variant": "#353534",
        "on-secondary": "#442b00",
        "surface-container": "#201f1f",
        "on-surface": "#e5e2e1",
        background: "#131313",
        secondary: "#ffb95f",
        "secondary-container": "#4d3300",
        tertiary: "#4edea3",
        error: "#ffb4ab",
        "on-primary": "#670020",
        "primary-fixed-dim": "#ffb2ba",
        "on-primary-container": "#ffadb6",
        "surface-container-low": "#1c1b1b",
        "surface-container-high": "#2a2a2a",
        "surface-container-lowest": "#0e0e0e",
        "surface-container-highest": "#353534",
        "inverse-primary": "#b32446",
        "primary-container": "#9f1239",
        "outline-variant": "#594143",
        primary: "#ffb2ba",
        surface: "#131313",
        "on-surface-variant": "#e0bec1",
        "inverse-surface": "#e5e2e1",
        "surface-dim": "#131313",
        "surface-bright": "#3a3939",
        "on-background": "#e5e2e1",
        "tertiary-container": "#005d3e",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
      fontFamily: {
        headline: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        label: ["Inter", "sans-serif"],
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pin-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.4)", opacity: "0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "drop-in": {
          "0%": { opacity: "0", transform: "translateY(-48px)" },
          "60%": { opacity: "1", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer-sweep": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
      },
      animation: {
        marquee: "marquee 40s linear infinite",
        "pin-pulse": "pin-pulse 2s ease-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "drop-in": "drop-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer-sweep 4s linear infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
