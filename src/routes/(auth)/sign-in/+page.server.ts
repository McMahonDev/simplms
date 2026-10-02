import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { ALLOW_SIGNUP } from '$app/env/private';
import { auth } from '#lib/server/auth.js';
import { safeRedirectTarget } from '#lib/server/guards.js';
import { formError, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
	return { allowSignup: ALLOW_SIGNUP };
};

const signInSchema = z.object({
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	password: z.string().min(1, 'Enter your password')
});

export const actions: Actions = {
	default: async ({ request, url }) => {
		const parsed = parseForm(signInSchema, await request.formData());
		if (!parsed.ok) return fail(400, parsed);

		try {
			await auth.api.signInEmail({ body: parsed.data, headers: request.headers });
		} catch (err) {
			if (err instanceof APIError) {
				return fail(
					400,
					formError(err.message || 'Invalid email or password.', { email: parsed.data.email })
				);
			}
			throw err;
		}

		redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
	}
};
