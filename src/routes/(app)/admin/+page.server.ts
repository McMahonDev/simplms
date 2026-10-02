import { redirect } from '@sveltejs/kit';
import { authorize } from '#lib/server/permissions.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await authorize(event, 'admin:access');
	redirect(307, '/admin/courses');
};
