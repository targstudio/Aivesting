import type { Config } from "tailwindcss";

// Tokens do design system (ver proposta, seção 7). Cores via variáveis CSS para suportar modo escuro.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--primary) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        "info-bg": "rgb(var(--info-bg) / <alpha-value>)",
        positive: "rgb(var(--positive) / <alpha-value>)",
        negative: "rgb(var(--negative) / <alpha-value>)",
        "nav-active": "rgb(var(--nav-active) / <alpha-value>)",
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
