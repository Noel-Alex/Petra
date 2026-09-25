import { resolve } from "node:path";

import { defineConfig } from "vite";

const ROOT = process.cwd();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must be supplied by the local benchmark launcher`);
  }
  return value;
}

const artifactDir = resolve(requiredEnv("PETRA_LOCAL_ARTIFACT_DIR"));

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: resolve(artifactDir, "ml-aggregate-benchmark-bundle"),
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      input: {
        runner: resolve(ROOT, "experiments/ml_aggregate_benchmark_runtime.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
