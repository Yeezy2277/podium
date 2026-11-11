import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";

const theme = createTheme({
  // MUI's default light info (#0288d1) and warning (#ed6c02) put white chip
  // text at 3.9:1 and 3.1:1; these darker shades clear 4.5:1.
  colorSchemes: { light: true, dark: true },
  palette: { primary: { main: "#3b5bdb" }, info: { main: "#0b6bcb" }, warning: { main: "#b45309" } },
  shape: { borderRadius: 6 },
  typography: { fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif' },
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
