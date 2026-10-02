/**
 * Config used only by the Better Auth CLI to generate the Drizzle auth schema:
 *   pnpm auth:generate
 * The running app builds its instance in src/lib/server/auth.ts.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { adminPlugin, baseAuthOptions } from './src/lib/server/auth-options';

export const auth = betterAuth({
	...baseAuthOptions,
	// The CLI only reads table definitions; it never connects.
	database: drizzleAdapter({} as never, { provider: 'pg' }),
	plugins: [adminPlugin]
});
