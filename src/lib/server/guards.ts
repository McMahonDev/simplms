import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { SessionUser } from './auth.js';

/** Redirects anonymous users to sign in, remembering where they were going. */
export function requireUser(event: Pick<RequestEvent, 'locals' | 'url'>): SessionUser {
	const user = event.locals.user;
	if (!user) {
		const target = event.url.pathname + event.url.search;
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(target)}`);
	}
	return user;
}

/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeRedirectTarget(target: string | null | undefined, fallback = '/'): string {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	return target;
}
