import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests run the real services against the Postgres in DATABASE_URL (.env).
 * `pnpm test:integration` — needs `docker compose up db -d` and applied migrations.
 * Each test creates its own company and deletes it afterwards.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@/lib/session": path.resolve(import.meta.dirname, "tests/integration/session-stub.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { TZ: "UTC" },
  },
});
