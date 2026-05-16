import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    maxWorkers: 4,
    setupFiles: ["test/setup-tempdir.ts"],
    testTimeout: 120_000
  }
});
