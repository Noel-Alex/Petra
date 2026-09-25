import { isAbsolute, relative, resolve } from "node:path";

import { defineConfig } from "vite";

const ROOT = process.cwd();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} must be supplied by the local dataset launcher`);
  }
  return value;
}

function repositoryEntry(name: string): string {
  const raw = requiredEnv(name);
  const absolute = resolve(ROOT, raw);
  const rel = relative(ROOT, absolute);
  if (
    rel.length === 0 ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  ) {
    throw new Error(`${name} must resolve to a repository file`);
  }
  return absolute;
}

const artifactDir = resolve(requiredEnv("PETRA_LOCAL_ARTIFACT_DIR"));
const packageEntry = repositoryEntry("PETRA_ML_DATASET_PACKAGE_ENTRY");

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: resolve(artifactDir, "ml-mechanistic-dataset-bundle"),
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      input: {
        runner: resolve(
          ROOT,
          "experiments/ml_mechanistic_dataset_runtime.runner.ts",
        ),
        package: packageEntry,
        worker: resolve(
          ROOT,
          "src/ml/node/datasetWorkerExecutor.ts",
        ),
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
