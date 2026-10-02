import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

// Signing out is POST-only; a GET just bounces home.
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/sign-in');
	}
};
