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
}

export {};
