import { resolve } from "node:path";

import { defineConfig } from "vite";

const artifactDir = process.env.PETRA_LOCAL_ARTIFACT_DIR;
if (artifactDir === undefined || artifactDir.trim().length === 0) {
  throw new Error(
    "PETRA_LOCAL_ARTIFACT_DIR must be supplied by run_local_experiments.py",
  );
}

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: resolve(
      artifactDir,
      "ml-node-authoritative-profile-bundle",
    ),
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      input: {
        runner: resolve(
          process.cwd(),
          "experiments/ml_node_authoritative_profile.runner.ts",
        ),
        worker: resolve(
          process.cwd(),
          "experiments/ml_node_authoritative_profile.worker.ts",
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
