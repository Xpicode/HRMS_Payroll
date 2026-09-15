import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config.mjs";

/**
 * Load check (Phase 8): `pnpm load-check`. Same wiring as the integration tests but its own
 * entry point, so the 200-employee run never slows down `pnpm test:integration`.
 */
export default defineConfig({
  ...integration,
  test: {
    ...integration.test,
    include: ["tests/load/**/*.test.ts"],
    testTimeout: 10 * 60_000,
    hookTimeout: 10 * 60_000,
  },
});
