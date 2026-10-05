/**
 * Zod schemas for every environment variable the app reads.
 *
 * Shared by `src/env.ts` (SvelteKit validates these at startup and exposes them via
 * `$app/env/private`) and by Node scripts (`drizzle.config.ts`, `scripts/seed.ts`) that
 * run outside SvelteKit and parse `process.env` directly.
 *
 * Every variable has a local-dev default so a fresh clone runs without a .env file.
 * Production-only requirements are enforced where the value is used (see auth.ts).
 */
import { z } from 'zod';

export const DEV_AUTH_SECRET = 'dev-only-secret-change-me-dev-only-secret';

const booleanString = z
	.enum(['true', 'false', '1', '0', 'yes', 'no'])
	.transform((v) => v === 'true' || v === '1' || v === 'yes');

/** Env values arrive as strings; parse an optional positive integer with a fallback. */
const positiveInt = (fallback: number) =>
	z
		.string()
		.optional()
		.transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
		.pipe(z.number().int().positive());

const megabytes = (fallback: number) => positiveInt(fallback).transform((mb) => mb * 1024 * 1024);

export const envSchema = {
	DATABASE_URL: z.url().default('postgres://simplms:simplms@localhost:5432/simplms'),
	BETTER_AUTH_SECRET: z.string().min(32).default(DEV_AUTH_SECRET),
	/** Public origin of the app; Better Auth uses it for origin checks and callbacks. */
	BETTER_AUTH_URL: z.url().default('http://localhost:5173'),
	ALLOW_SIGNUP: booleanString.default(true),
	STORAGE_DIR: z.string().min(1).default('./storage'),
	/** Exposed in bytes, configured in MB. */
	SCORM_MAX_UPLOAD_MB: megabytes(500),
	SCORM_MAX_UNCOMPRESSED_MB: megabytes(2000),
	SCORM_MAX_FILES: positiveInt(20000),
	/** Run scheduled jobs inside the app server (see src/lib/server/jobs). */
	JOBS_SCHEDULER: booleanString.default(true),
	/** Bearer token for POST /api/jobs/run (external cron). Unset disables the endpoint. */
	CRON_SECRET: z.string().min(16).optional()
} as const;

export const envObjectSchema = z.object(envSchema);
export type Env = z.infer<typeof envObjectSchema>;

/** For scripts running outside SvelteKit: load .env if present, then validate. */
export function loadScriptEnv(): Env {
	try {
		process.loadEnvFile('.env');
	} catch {
		// No .env file: defaults apply.
	}
	return envObjectSchema.parse(process.env);
}
