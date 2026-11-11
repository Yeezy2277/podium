import { Box } from "@mui/material";
import { tokens } from "./theme";

/** The podium mark: three steps, gold in the middle. Decorative; the wordmark carries the name. */
export function PodiumMark({ size = 28 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 30 24" width={size} height={(size * 24) / 30} aria-hidden="true" sx={{ flexShrink: 0 }}>
      <rect x="0" y="12" width="9" height="12" rx="1" fill={tokens.silver} />
      <rect x="10.5" y="2" width="9" height="22" rx="1" fill={tokens.gold} />
      <rect x="21" y="16" width="9" height="8" rx="1" fill={tokens.bronze} />
    </Box>
  );
}

const PLACE = {
  1: { bg: tokens.gold, label: "1st place" },
  2: { bg: tokens.silver, label: "2nd place" },
  3: { bg: tokens.bronze, label: "3rd place" },
} as const;

/** Rank cell: gold, silver and bronze discs for the podium places, a plain number after that. */
export function Rank({ rank }: { rank: number }) {
  const place = PLACE[rank as 1 | 2 | 3];
  if (!place) return <Box component="span" sx={{ fontWeight: 600, pl: "9px" }}>{rank}</Box>;
  return (
    <Box
      component="span"
      role="img"
      aria-label={place.label}
      sx={{
        display: "inline-grid",
        placeItems: "center",
        width: 26,
        height: 26,
        borderRadius: "50%",
        bgcolor: place.bg,
        color: tokens.navyInk,
        fontWeight: 800,
        fontSize: 13,
        lineHeight: 1,
        verticalAlign: "middle",
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.18)",
      }}
    >
      {rank}
    </Box>
  );
}
