import { authorize, capabilitiesFor } from '#lib/server/permissions.js';
import type { LayoutServerLoad } from './$types';

// Gate for page loads under /admin. Form actions authorize themselves, since
// layout loads don't run for action requests.
export const load: LayoutServerLoad = async (event) => {
	const user = await authorize(event, 'admin:access');
	return {
		adminCaps: await capabilitiesFor(user, [
			'users:view',
			'users:manage',
			'categories:manage',
			'courses:create',
			'jobs:manage'
		])
	};
};
