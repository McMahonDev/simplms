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

/**
 * True when a state-changing request comes from our own pages. SvelteKit's CSRF check
 * covers form actions; +server.ts endpoints that accept text/plain (sendBeacon) need this.
 * Browsers send Origin on POST and Sec-Fetch-Site on all requests.
 */
export function isSameOrigin(request: Request, url: URL): boolean {
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return false;
	const site = request.headers.get('sec-fetch-site');
	if (site && site !== 'same-origin') return false;
	return true;
}
