import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f4f6fb",
          100: "#e6eaf4",
          200: "#c9d1e6",
          300: "#9aa6c8",
          400: "#6c7aa6",
          500: "#4a5a88",
          600: "#34426b",
          700: "#243054",
          800: "#161f3a",
          900: "#0d1530",
          950: "#080d20",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          200: "#bcd2ff",
          400: "#6d9bff",
          500: "#4a7dff",
          600: "#3563f0",
          700: "#2a4ed1",
        },
        violet: {
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { xl: "0.9rem", "2xl": "1.2rem" },
      boxShadow: {
        card: "0 1px 2px rgba(13,21,48,0.04), 0 4px 16px rgba(13,21,48,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
