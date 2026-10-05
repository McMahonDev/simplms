/**
 * SvelteKit environment variable definitions. Validated with Zod when the app starts
 * and exposed to server code through `$app/env/private`.
 * See https://svelte.dev/docs/kit/environment-variables
 */
import { defineEnvVars } from '@sveltejs/kit/env';
import { envSchema } from '#lib/server/env-schema.js';

export const variables = defineEnvVars({
	DATABASE_URL: { schema: envSchema.DATABASE_URL },
	BETTER_AUTH_SECRET: { schema: envSchema.BETTER_AUTH_SECRET },
	BETTER_AUTH_URL: { schema: envSchema.BETTER_AUTH_URL },
	ALLOW_SIGNUP: { schema: envSchema.ALLOW_SIGNUP },
	STORAGE_DIR: { schema: envSchema.STORAGE_DIR },
	SCORM_MAX_UPLOAD_MB: { schema: envSchema.SCORM_MAX_UPLOAD_MB },
	SCORM_MAX_UNCOMPRESSED_MB: { schema: envSchema.SCORM_MAX_UNCOMPRESSED_MB },
	SCORM_MAX_FILES: { schema: envSchema.SCORM_MAX_FILES },
	JOBS_SCHEDULER: { schema: envSchema.JOBS_SCHEDULER },
	CRON_SECRET: { schema: envSchema.CRON_SECRET }
});
