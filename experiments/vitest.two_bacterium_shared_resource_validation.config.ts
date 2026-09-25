import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'experiments/two_bacterium_shared_resource_validation.experiment.ts',
    ],
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
})
