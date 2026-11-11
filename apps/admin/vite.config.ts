import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Import the shared package from source: one set of Zod schemas for the form and the API.
  resolve: { alias: { "@podium/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) } },
  server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
  // Vendor chunks change rarely, so returning visitors keep them cached across deploys.
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ["react", "react-dom", "react-router-dom"], mui: ["@mui/material"], grid: ["@mui/x-data-grid"] } },
    },
  },
});
