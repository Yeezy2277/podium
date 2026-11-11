import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: Vitest 2 ships its own Vite, whose plugin types
// don't match the app's Vite 6. Tests only need JSX and the shared alias.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@podium/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)) } },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], server: { deps: { inline: [/@mui/] } } },
});
