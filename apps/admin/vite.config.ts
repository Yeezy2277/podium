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
      output: {
        // Function form: only modules the app actually imports land in each chunk
        // (the object form pulls in a package's whole entry, i.e. all of MUI).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mui/x-data-grid")) return "grid";
          if (/@mui|@emotion/.test(id)) return "mui";
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
