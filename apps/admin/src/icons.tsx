import { createSvgIcon } from "@mui/material/utils";

// Line icons drawn with the same stroke as the rest of the UI; no icon package needed for two glyphs.
const line = (d: string) => <path d={d} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />;

export const ArrowBackIcon = createSvgIcon(line("M19 12H5M11 6l-6 6 6 6"), "ArrowBack");
export const CloseIcon = createSvgIcon(line("M6 6l12 12M18 6 6 18"), "Close");
