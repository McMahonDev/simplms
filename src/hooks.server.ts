import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	if (!building) {
		const result = await auth.api.getSession({ headers: event.request.headers });
		if (result) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}

	// Routes /api/auth/* to Better Auth; everything else to SvelteKit.
	return svelteKitHandler({ event, resolve, auth, building });
};
