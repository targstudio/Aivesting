import type { Config } from "tailwindcss";

// Tokens do design system (dashboard escuro, ver globals.css). Cores via variáveis CSS.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: token("primary"),
        "on-primary": token("on-primary"),
        background: token("background"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        border: token("border"),
        text: token("text"),
        muted: token("text-muted"),
        "accent-bg": token("accent-bg"),
        "accent-text": token("accent-text"),
        track: token("track"),
        positive: token("positive"),
        negative: token("negative"),
        "chart-1": token("chart-1"),
        "chart-2": token("chart-2"),
        "chart-3": token("chart-3"),
        "chart-4": token("chart-4"),
        "chart-5": token("chart-5"),
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { card: "1.25rem" },
    },
  },
  plugins: [],
};
export default config;
