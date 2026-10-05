import { emailOptOuts, setEmailPreferences } from '#lib/server/db/notifications.js';
import { requireUser } from '#lib/server/guards.js';
import { notificationTypes } from '#lib/server/notifications.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const optOuts = await emailOptOuts(user.id);
	return {
		email: user.email,
		types: notificationTypes.map((t) => ({ ...t, email: !optOuts.has(t.type) }))
	};
};

export const actions: Actions = {
	save: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		// Checkboxes only submit when ticked, so every known type is saved explicitly.
		const on = new Set(formData.getAll('email').map(String));
		await setEmailPreferences(
			user.id,
			notificationTypes.map((t) => ({ type: t.type, email: on.has(t.type) }))
		);
		return { action: 'save', ok: true, message: 'Saved.' };
	}
};
