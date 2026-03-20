import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0e0e10",
        surface: "#16161a",
        surface2: "#1c1c21",
        surface3: "#232328",
        border: "#2a2a30",
        border2: "#35353d",
        text1: "#f0f0f2",
        text2: "#9898a8",
        text3: "#55555f",
        accent: "#4f7fff",
        accent2: "#6b93ff",
      },
    },
  },
  plugins: [],
};

export default config;
