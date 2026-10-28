import type { Config } from "tailwindcss";

// Tokens do design system (ver proposta, seção 7). Cores via variáveis CSS para suportar modo escuro.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        primary: token("primary"),
        "on-primary": token("on-primary"),
        background: token("background"),
        surface: token("surface"),
        border: token("border"),
        text: token("text"),
        muted: token("text-muted"),
        "accent-bg": token("accent-bg"),
        "accent-text": token("accent-text"),
        track: token("track"),
        positive: token("positive"),
        negative: token("negative"),
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { card: "2rem" },
    },
  },
  plugins: [],
};
export default config;
