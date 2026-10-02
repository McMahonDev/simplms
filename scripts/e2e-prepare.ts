/**
 * Creates a fresh `simplms_e2e` database next to the dev database, migrates it, and seeds
 * it with a known password. Run by Playwright's webServer before the app starts, so the
 * end-to-end tests never touch development data.
 */
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import postgres from 'postgres';
import { loadScriptEnv } from '../src/lib/server/env-schema';

// Hard-coded so this script can never drop the development database.
const E2E_DATABASE = 'simplms_e2e';

const env = loadScriptEnv();
const e2eUrl = new URL(env.DATABASE_URL);
e2eUrl.pathname = `/${E2E_DATABASE}`;
const adminUrl = new URL(env.DATABASE_URL);
adminUrl.pathname = '/postgres';

const sql = postgres(adminUrl.toString(), { onnotice: () => {} });
await sql.unsafe(`drop database if exists ${E2E_DATABASE} with (force)`);
await sql.unsafe(`create database ${E2E_DATABASE}`);
await sql.end();

// Also hard-coded, so the rm below can never touch the dev storage folder.
const storageDir = './.e2e-storage';
await rm(storageDir, { recursive: true, force: true });

const childEnv = {
	...process.env,
	DATABASE_URL: e2eUrl.toString(),
	STORAGE_DIR: storageDir,
	SEED_PASSWORD: process.env.SEED_PASSWORD ?? 'e2e-password'
};
execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], { env: childEnv, stdio: 'inherit' });
execFileSync('pnpm', ['exec', 'tsx', 'scripts/seed.ts'], { env: childEnv, stdio: 'inherit' });
