import { loadCourseFor } from '#lib/server/course-context.js';
import { packagesWithProgress } from '#lib/server/db/progress.js';
import { capabilitiesFor } from '#lib/server/permissions.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'course:view');
	const [activities, caps] = await Promise.all([
		packagesWithProgress(course.id, user.id),
		capabilitiesFor(user, ['course:edit', 'course:reports:view', 'scorm:launch'], course.id)
	]);
	return { course, activities, caps };
};
