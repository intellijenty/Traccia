import { defineConfig } from "vitest/config"
import { resolve } from "path"

// Kept separate from vite.config.ts on purpose: that config loads the Electron
// plugins, which would try to build and launch the app for a unit-test run.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
})
