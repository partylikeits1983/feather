import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, use: { baseURL: 'http://127.0.0.1:1420', viewport: { width: 1380, height: 900 }, screenshot: 'only-on-failure' },
  // Tauri uses WebView2 on Windows and WebKit on macOS/Linux.
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL } },
    ...(process.platform === 'win32' ? [] : [{ name: 'webkit', use: { browserName: 'webkit' as const } }]),
  ],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
