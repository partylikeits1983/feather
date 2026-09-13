import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, use: { baseURL: 'http://127.0.0.1:1420', channel: process.env.PLAYWRIGHT_CHANNEL, viewport: { width: 1380, height: 900 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
