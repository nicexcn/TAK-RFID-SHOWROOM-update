import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests — require a running dev server (npm run dev). Opt-in.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 130_000,
    hookTimeout: 130_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
