import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { SITE_ROLES } from '#lib/server/auth-options.js';
import { auth } from '#lib/server/auth.js';
import { listUsers } from '#lib/server/db/users.js';
import { authorize, can, siteRoleOf } from '#lib/server/permissions.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

const filterSchema = z.object({
	q: z.string().trim().max(100).optional().catch(undefined),
	role: z.enum(SITE_ROLES).optional().catch(undefined)
});

export const load: PageServerLoad = async (event) => {
	const user = await authorize(event, 'users:view');
	const filters = filterSchema.parse(Object.fromEntries(event.url.searchParams));
	const users = await listUsers({ q: filters.q || undefined, role: filters.role });
	return {
		filters,
		users: users.map((u) => ({ ...u, role: siteRoleOf(u) })),
		canManage: await can(user, 'users:manage'),
		currentUserId: user.id,
		roles: SITE_ROLES
	};
};

const createSchema = z.object({
	name: formFields.trimmed(120),
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	password: z.string().min(8, 'Use at least 8 characters').max(128),
	role: z.enum(SITE_ROLES)
});

const userIdSchema = z.object({ userId: formFields.uuid() });
const roleSchema = userIdSchema.extend({ role: z.enum(SITE_ROLES) });
const banSchema = userIdSchema.extend({ reason: formFields.optionalText(200) });

/** Better Auth errors carry a user-facing message; anything else is a real failure. */
function apiFailure(action: string, err: unknown, id?: string) {
	if (err instanceof APIError) {
		return fail(400, { action, id, ...formError(err.message || 'The request was rejected.') });
	}
	throw err;
}

export const actions: Actions = {
	create: async (event) => {
		await authorize(event, 'users:manage');
		const parsed = parseForm(createSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'create', ...parsed });

		try {
			// Calls go through Better Auth's admin plugin, which applies its own role checks.
			await auth.api.createUser({ body: parsed.data, headers: event.request.headers });
		} catch (err) {
			return apiFailure('create', err);
		}
		return { action: 'create', ok: true, message: `Created ${parsed.data.email}.` };
	},

	setRole: async (event) => {
		const me = await authorize(event, 'users:manage');
		const parsed = parseForm(roleSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'setRole', ...parsed });
		if (parsed.data.userId === me.id) {
			return fail(400, {
				action: 'setRole',
				id: parsed.data.userId,
				...formError('You cannot change your own role.')
			});
		}

		try {
			await auth.api.setRole({
				body: { userId: parsed.data.userId, role: parsed.data.role },
				headers: event.request.headers
			});
		} catch (err) {
			return apiFailure('setRole', err, parsed.data.userId);
		}
		return { action: 'setRole', id: parsed.data.userId, ok: true, message: 'Role updated.' };
	},

	ban: async (event) => {
		const me = await authorize(event, 'users:manage');
		const parsed = parseForm(banSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'ban', ...parsed });
		if (parsed.data.userId === me.id) {
			return fail(400, {
				action: 'ban',
				id: parsed.data.userId,
				...formError('You cannot ban yourself.')
			});
		}

		try {
			// Banning also revokes the user's sessions.
			await auth.api.banUser({
				body: { userId: parsed.data.userId, banReason: parsed.data.reason || undefined },
				headers: event.request.headers
			});
		} catch (err) {
			return apiFailure('ban', err, parsed.data.userId);
		}
		return { action: 'ban', id: parsed.data.userId, ok: true, message: 'User banned.' };
	},

	unban: async (event) => {
		await authorize(event, 'users:manage');
		const parsed = parseForm(userIdSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'unban', ...parsed });

		try {
			await auth.api.unbanUser({
				body: { userId: parsed.data.userId },
				headers: event.request.headers
			});
		} catch (err) {
			return apiFailure('unban', err, parsed.data.userId);
		}
		return { action: 'unban', id: parsed.data.userId, ok: true, message: 'User unbanned.' };
	}
};
