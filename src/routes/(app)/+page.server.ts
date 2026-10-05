import { activitiesForCourses, attemptHistory, myEnrollments } from '#lib/server/db/progress.js';
import { requireUser } from '#lib/server/guards.js';
import { decide, siteRoleOf } from '#lib/server/permissions.js';
import { summarizeProgress } from '#lib/server/progress-summary.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const siteRole = siteRoleOf(user);

	// Drop enrollments the user can't open (e.g. a student in a hidden course).
	const enrollments = (await myEnrollments(user.id)).filter((e) =>
		decide('course:view', {
			siteRole,
			course: { visible: e.visible },
			enrollment: { role: e.role, status: e.status }
		})
	);

	const activities = await activitiesForCourses(enrollments.map((e) => e.courseId));
	const attempts = await attemptHistory(
		activities.map((p) => p.id),
		[user.id]
	);

	const courses = enrollments.map((e) => {
		const courseActivities = activities.filter((p) => p.courseId === e.courseId);
		const progress = summarizeProgress(courseActivities, attempts, user.id);
		const next = courseActivities.find((p) => p.id === progress.nextActivityId);
		return {
			id: e.courseId,
			title: e.title,
			slug: e.slug,
			summary: e.summary,
			role: e.role,
			progress,
			next: next ? { id: next.id, title: next.title } : null
		};
	});

	return {
		learning: courses.filter((c) => c.role === 'student'),
		teaching: courses.filter((c) => c.role === 'teacher')
	};
};
