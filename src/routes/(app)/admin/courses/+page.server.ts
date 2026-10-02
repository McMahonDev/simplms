import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { flattenTree, getCategoryTree } from '#lib/server/db/categories.js';
import { createCourse, listCoursesForAdmin } from '#lib/server/db/courses.js';
import { authorize } from '#lib/server/permissions.js';
import { courseSchema } from '#lib/server/form-schemas.js';
import { parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

const filterSchema = z.object({
	q: z.string().trim().max(100).optional().catch(undefined),
	category: z.uuid().optional().catch(undefined),
	visibility: z.enum(['visible', 'hidden']).optional().catch(undefined)
});

export const load: PageServerLoad = async (event) => {
	await authorize(event, 'admin:access');
	const filters = filterSchema.parse(Object.fromEntries(event.url.searchParams));

	const [courses, tree] = await Promise.all([
		listCoursesForAdmin({
			q: filters.q || undefined,
			categoryId: filters.category,
			visibility: filters.visibility
		}),
		getCategoryTree()
	]);

	return {
		courses,
		filters,
		categories: flattenTree(tree).map((c) => ({ id: c.id, name: c.name, depth: c.depth }))
	};
};

export const actions: Actions = {
	create: async (event) => {
		const user = await authorize(event, 'courses:create');
		const parsed = parseForm(courseSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'create', ...parsed });

		const course = await createCourse(parsed.data, user.id);
		redirect(303, `/courses/${course.slug}/manage`);
	}
};
