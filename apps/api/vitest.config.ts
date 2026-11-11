import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC instead of esbuild: Nest's DI needs emitDecoratorMetadata, which esbuild doesn't emit.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
