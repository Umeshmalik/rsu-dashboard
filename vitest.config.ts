import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(root, "./src"),
      "server-only": path.resolve(root, "./tests/empty.ts"),
    },
  },
});
