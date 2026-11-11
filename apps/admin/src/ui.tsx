import { Box, CircularProgress, Typography } from "@mui/material";

export function Loading({ what }: { what: string }) {
  return (
    <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 4 }}>
      <CircularProgress size={22} aria-hidden="true" />
      <Typography color="text.secondary">Loading {what}…</Typography>
    </Box>
  );
}

export function SkipLink() {
  return (
    <Box
      component="a"
      href="#main"
      sx={{
        position: "absolute",
        left: 12,
        top: -48,
        zIndex: 2000,
        px: 1.5,
        py: 1,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        fontWeight: 600,
        "&:focus": { top: 12 },
      }}
    >
      Skip to content
    </Box>
  );
}
