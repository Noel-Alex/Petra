import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['experiments/flagship_runtime_smoke.experiment.ts'],
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
})
