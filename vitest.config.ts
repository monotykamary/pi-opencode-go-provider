import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The other tests/*.test.ts files are node:test suites run by `node --test`.
    include: ["tests/sync-policy.test.ts", "tests/quiet-startup-sync.test.ts", "tests/usage-sync.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
