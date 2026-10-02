import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { ALLOW_SIGNUP } from '$app/env/private';
import { auth } from '#lib/server/auth.js';
import { formError, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!ALLOW_SIGNUP) error(404, 'Sign-up is disabled');
	if (locals.user) redirect(303, '/');
};

const signUpSchema = z.object({
	name: z.string().trim().min(1, 'Enter your name').max(120),
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	password: z.string().min(8, 'Use at least 8 characters').max(128)
});

export const actions: Actions = {
	default: async ({ request }) => {
		if (!ALLOW_SIGNUP) error(404, 'Sign-up is disabled');

		const parsed = parseForm(signUpSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);

		try {
			// New accounts always get the default "user" site role (see auth-options.ts).
			await auth.api.signUpEmail({ body: parsed.data, headers: request.headers });
		} catch (err) {
			if (err instanceof APIError) {
				return fail(
					400,
					formError(err.message || 'Could not create the account.', {
						name: parsed.data.name,
						email: parsed.data.email
					})
				);
			}
			throw err;
		}

		redirect(303, '/');
	}
};
