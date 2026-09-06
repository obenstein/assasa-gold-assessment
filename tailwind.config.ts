import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--surface-0)",
        foreground: "var(--text-primary)",
        teal: {
          deep: "#0D4A46",
          mid: "#145F5A",
          light: "#1A7A74",
        },
        lime: {
          accent: "#8CCB50",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
