import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sim/flagshipCiprofloxacinValidation.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 2 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
})
