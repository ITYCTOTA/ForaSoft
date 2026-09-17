import { defineConfig, devices } from "@playwright/test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-logging=stderr",
        "--log-level=2",
      ],
    },
    ...devices["Desktop Chrome"],
  },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  webServer: [
    {
      command: `${npmCommand} run start --workspace=server`,
      cwd: ".",
      env: {
        ...process.env,
        PORT: "3001",
        PUBLIC_ORIGIN: "http://127.0.0.1:4174",
      },
      url: "http://127.0.0.1:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command:
        `${npmCommand} run dev --workspace=client -- --host 127.0.0.1 --port 4174 --strictPort`,
      cwd: ".",
      env: {
        ...process.env,
        VITE_SOCKET_SERVER_URL: "http://127.0.0.1:3001",
      },
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
});
