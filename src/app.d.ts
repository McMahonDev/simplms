// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session, SessionUser } from '#lib/server/auth.js';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			session: Session | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		/** SCORM 1.2 runtime API, found by SCOs walking window.parent. */
		API?: unknown;
		/** SCORM 2004 runtime API. */
		API_1484_11?: unknown;
	}
}

export {};
