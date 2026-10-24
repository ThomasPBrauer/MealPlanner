import type { Config } from "tailwindcss";

// Reads a CSS variable holding "R G B" (space-separated) and produces a
// Tailwind color function that still supports opacity modifiers, e.g.
// `bg-gold/40`. Needed because these colors are user-customizable at
// runtime (see lib/theme.ts) — a plain hex string in this config can't be
// changed after the CSS is built, but a CSS variable can.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withOpacity(varName: string): any {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue === undefined) return `rgb(var(${varName}))`;
    return `rgb(var(${varName}) / ${opacityValue})`;
  };
}

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // customizable via Settings -> stored per-user in the database
        board: {
          DEFAULT: withOpacity("--color-board-rgb"),
          panel: withOpacity("--color-panel-rgb"),
          rail: withOpacity("--color-rail-rgb"),
        },
        gold: withOpacity("--color-gold-rgb"),
        tomato: withOpacity("--color-tomato-rgb"),
        chalk: withOpacity("--color-chalk-rgb"),

        // fixed, not user-customizable: recipe cards always use a cream
        // card with dark "ink" text, independent of the page theme, so
        // contrast can't break no matter what background color someone picks
        paper: "#FAF3E4",
        ink: "#2B2620",

        // fixed neutral used for muted/secondary UI text
        sage: "#8FA998",
      },
      fontFamily: {
        display: ["var(--font-display)", "cursive"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        card: "0 6px 16px -4px rgba(0,0,0,0.45)",
        pin: "0 2px 4px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
