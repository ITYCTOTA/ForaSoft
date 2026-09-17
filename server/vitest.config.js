import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage/server',
      reporter: ['text', 'html'],
      include: ['src/rooms/**/*.js'],
      thresholds: {
        branches: 80,
      },
    },
  },
})
