import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['experiments/flagship_long_soak.experiment.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
})
