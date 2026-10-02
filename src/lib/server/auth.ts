import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { building, dev } from '$app/env';
import { ALLOW_SIGNUP, BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$app/env/private';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { authPlugins, baseAuthOptions } from './auth-options.js';
import { DEV_AUTH_SECRET } from './env-schema.js';

if (!dev && !building && BETTER_AUTH_SECRET === DEV_AUTH_SECRET) {
	throw new Error('BETTER_AUTH_SECRET must be set to a unique value in production.');
}

export const auth = betterAuth({
	...baseAuthOptions,
	secret: BETTER_AUTH_SECRET,
	baseURL: BETTER_AUTH_URL,
	database: drizzleAdapter(db, { provider: 'pg', schema }),
	emailAndPassword: {
		...baseAuthOptions.emailAndPassword,
		disableSignUp: !ALLOW_SIGNUP
	},
	// sveltekitCookies must be last so it can copy Set-Cookie headers from server-side
	// auth.api calls (sign in from a form action) onto the SvelteKit response.
	plugins: [...authPlugins, sveltekitCookies(getRequestEvent)]
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type Session = typeof auth.$Infer.Session.session;
