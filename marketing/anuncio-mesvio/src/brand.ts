import { loadFont } from "@remotion/google-fonts/Manrope";

export const { fontFamily } = loadFont("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin", "latin-ext"] });

export const C = {
  forest: "#062D25",
  deep: "#102C2B",
  mint: "#91E9C3",
  soft: "#C8E9DA",
  white: "#FFFFFF",
  cream: "#F7F5F0",
  ink: "#10211D",
  inkSoft: "#4B5B56",
  // Esplanada (só nas cenas do bar)
  sky: "#FFE7C2",
  sun: "#FFB547",
  sea: "#4FB3BF",
  sand: "#F3DFB8",
  coral: "#F2775B",
  amber: "#F5A623",
};

/** Geometria do logótipo "mesvio." (cópia de src/components/brand/logo-geometry.ts da app). */
export const LOGO = {
  stroke: 9,
  viewBox: "0 -2 288 70",
  paths: [
    "M4.5 60V34a12 12 0 0 1 24 0v26M28.5 34a12 12 0 0 1 24 0v26",
    "M71.5 40h31A15.5 15.5 0 1 0 98 51",
    "M145 26.5c-4-5-10.5-6-15-6-6 0-10.5 3.5-10.5 9 0 11 26 7 26 19.5 0 6-5 10.5-12 10.5-5.5 0-10.5-2.5-13.5-6.5",
    "M162.5 20l16 40 16-40",
    "M212 22v38",
    "M261.5 40a15.5 15.5 0 1 1-31 0 15.5 15.5 0 1 1 31 0",
  ],
  iDot: { cx: 212, cy: 6, r: 5.5 },
  dot: { cx: 279, cy: 58.5, r: 6.5 },
};
