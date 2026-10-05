import { unreadCount } from '#lib/server/db/notifications.js';
import { requireUser } from '#lib/server/guards.js';
import { can, siteRoleOf } from '#lib/server/permissions.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const user = requireUser(event);
	return {
		user: { id: user.id, name: user.name, email: user.email, role: siteRoleOf(user) },
		nav: { admin: await can(user, 'admin:access'), unread: await unreadCount(user.id) }
	};
};
