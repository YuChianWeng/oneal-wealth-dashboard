import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
