import { createTheme } from "@mui/material";

/**
 * Podium identity: a prize-giving back office.
 *
 * - Type: Archivo for headings and data (sturdy, condensed-friendly grotesk with
 *   a heavy 800 for titles) + Archivo Narrow, uppercase and tracked, for labels
 *   and column headers, the way a results board sets its captions.
 * - Color: navy as the dominant, gold as the one sharp accent, the podium's own
 *   palette. Neutrals lean warm (paper) in light and navy-black in dark.
 * - Signature: the three-step podium mark and gold/silver/bronze places on the
 *   leaderboard. Semantic colors (live, scheduled, cancelled) stay separate from
 *   the gold.
 */
export const tokens = {
  navy: "#16223f",
  navyInk: "#0c1222",
  gold: "#e3b341",
  goldInk: "#8a6412", // gold dark enough to be text on paper (4.9:1)
  silver: "#c9ced8",
  bronze: "#c98a52",
  paper: "#f6f4ee",
  darkPaper: "#131b30",
};

export const FONT_SANS = '"Archivo", "Helvetica Neue", Arial, sans-serif';
export const FONT_NARROW = '"Archivo Narrow", "Arial Narrow", "Helvetica Neue", sans-serif';

const label = {
  fontFamily: FONT_NARROW,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: tokens.navy, contrastText: "#ffffff" },
        secondary: { main: tokens.gold, contrastText: tokens.navyInk },
        // MUI's default info/warning put white chip text under 4.5:1.
        info: { main: "#0b6bcb" },
        warning: { main: "#b45309" },
        background: { default: tokens.paper, paper: "#ffffff" },
        text: { primary: "#141a2b", secondary: "#4b5468" },
        divider: "rgba(22, 34, 63, 0.14)",
      },
    },
    dark: {
      palette: {
        // On navy-black, gold carries the brand and navy steps back.
        primary: { main: tokens.gold, contrastText: tokens.navyInk },
        secondary: { main: tokens.gold, contrastText: tokens.navyInk },
        background: { default: tokens.navyInk, paper: tokens.darkPaper },
        text: { primary: "#e8eaf2", secondary: "#9aa3b8" },
        divider: "rgba(232, 234, 242, 0.12)",
      },
    },
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: FONT_SANS,
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 800, letterSpacing: "-0.015em" },
    h6: { fontWeight: 800, letterSpacing: "-0.01em" },
    button: { ...label, fontSize: "0.82rem" },
    overline: label,
    caption: { ...label, fontSize: "0.72rem" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Figures line up in columns of money and ranks.
        body: { fontVariantNumeric: "tabular-nums" },
        ".MuiDataGrid-columnHeaderTitle": { ...label, fontSize: "0.75rem" },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": { animationDuration: "0.01ms !important", transitionDuration: "0.01ms !important" },
        },
      },
    },
    MuiChip: { styleOverrides: { root: { ...label, fontSize: "0.7rem", letterSpacing: "0.06em" } } },
    MuiCard: { defaultProps: { variant: "outlined" } },
  },
});
