import { flattenTree, getCategoryTree } from '#lib/server/db/categories.js';
import { listCoursesWithEnrollment } from '#lib/server/db/courses.js';
import { requireUser } from '#lib/server/guards.js';
import { canSelfEnroll, decide, siteRoleOf } from '#lib/server/permissions.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const siteRole = siteRoleOf(user);
	const [tree, courses] = await Promise.all([
		getCategoryTree(),
		listCoursesWithEnrollment(user.id)
	]);

	// Visible courses are listed for everyone; hidden ones only for people who can open them.
	const withAccess = courses
		.map((c) => {
			const enrollment =
				c.enrollmentRole && c.enrollmentStatus
					? { role: c.enrollmentRole, status: c.enrollmentStatus }
					: null;
			const canOpen = decide('course:view', {
				siteRole,
				course: { visible: c.visible },
				enrollment
			});
			return {
				...c,
				canOpen,
				canJoin: !canOpen && canSelfEnroll({ course: c, enrollment })
			};
		})
		.filter((c) => c.visible || c.canOpen);

	const flat = flattenTree(tree);
	const byId = new Map(flat.map((c) => [c.id, c]));
	const pathTo = (id: string) => {
		const names: string[] = [];
		for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) {
			names.unshift(c.name);
		}
		return names.join(' › ');
	};

	const groups = flat
		.map((cat) => ({
			id: cat.id,
			name: cat.name,
			description: cat.description,
			depth: cat.depth,
			path: pathTo(cat.id),
			courses: withAccess.filter((c) => c.categoryId === cat.id)
		}))
		.filter((g) => g.courses.length > 0);

	return { groups };
};
