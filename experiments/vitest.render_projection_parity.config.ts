import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['experiments/render_projection_parity.experiment.ts'],
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 60 * 1000,
    hookTimeout: 60 * 1000,
  },
})
