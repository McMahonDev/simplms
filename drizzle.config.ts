import { defineConfig } from 'drizzle-kit';
import { loadScriptEnv } from './src/lib/server/env-schema';

const env = loadScriptEnv();

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: env.DATABASE_URL },
	strict: true,
	verbose: true
});
