import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// 127.0.0.1, not localhost: Playwright's request client (page.request) can stall ~10s opening
// a connection to "localhost" on some setups (seen on WSL), which breaks timing-sensitive tests.
const baseURL = `http://127.0.0.1:${PORT}`;

// The e2e run uses its own database and storage folder (see scripts/e2e-prepare.ts).
const DEV_DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgres://simplms:simplms@localhost:5432/simplms';
const e2eDatabaseUrl = new URL(DEV_DATABASE_URL);
e2eDatabaseUrl.pathname = '/simplms_e2e';

export const E2E_PASSWORD = 'e2e-password';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'pnpm exec tsx scripts/e2e-prepare.ts && pnpm build && pnpm preview --port 4173',
		url: `${baseURL}/sign-in`,
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe',
		env: {
			DATABASE_URL: e2eDatabaseUrl.toString(),
			STORAGE_DIR: './.e2e-storage',
			SEED_PASSWORD: E2E_PASSWORD,
			BETTER_AUTH_URL: baseURL,
			BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only',
			ALLOW_SIGNUP: 'true'
		}
	}
});
