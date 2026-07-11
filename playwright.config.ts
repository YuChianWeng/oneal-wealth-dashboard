import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const localBaseURL = `http://127.0.0.1:${port}`;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // An external base URL owns its server lifecycle. Local smoke tests start an
  // isolated server unless reuse is explicitly requested.
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: localBaseURL,
        reuseExistingServer:
          process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true",
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
