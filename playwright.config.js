import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 15_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--enable-logging=stderr',
        '--log-level=2',
      ],
    },
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm.cmd run start --workspace=server',
      cwd: '.',
      url: 'http://127.0.0.1:3000/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'npm.cmd run dev --workspace=client -- --host 127.0.0.1 --port 4173 --strictPort',
      cwd: '.',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
})
