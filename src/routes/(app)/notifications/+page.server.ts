import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { listNotifications, markAllRead, markRead } from '#lib/server/db/notifications.js';
import { requireUser, safeRedirectTarget } from '#lib/server/guards.js';
import { formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return { notifications: await listNotifications(user.id) };
};

const openSchema = z.object({ id: formFields.uuid() });

export const actions: Actions = {
	/** Marks a notification read and follows its link. */
	open: async (event) => {
		const user = requireUser(event);
		const parsed = parseForm(openSchema, await event.request.formData());
		const row = parsed.ok ? await markRead(user.id, parsed.data.id) : null;
		redirect(303, safeRedirectTarget(row?.link, '/notifications'));
	},

	readAll: async (event) => {
		const user = requireUser(event);
		await markAllRead(user.id);
		return { action: 'readAll', ok: true };
	}
};
