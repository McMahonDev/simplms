import { loadCourseFor } from '#lib/server/course-context.js';
import { listStudents } from '#lib/server/db/enrollments.js';
import { latestAttempts, listPackages } from '#lib/server/db/progress.js';
import { describeCriteria, evaluateActivities } from '#lib/server/completion.js';
import { summarizeProgress } from '#lib/server/progress-summary.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course } = await loadCourseFor(event, 'course:reports:view');
	const [students, packages] = await Promise.all([
		listStudents(course.id),
		listPackages(course.id)
	]);
	const attempts = await latestAttempts(
		packages.map((p) => p.id),
		students.map((s) => s.userId)
	);

	const rows = students.map((s) => {
		const states = evaluateActivities(packages, (id) => attempts.get(`${id}:${s.userId}`));
		const cells = packages.map((p) => {
			const a = attempts.get(`${p.id}:${s.userId}`);
			const { complete, lockedBy } = states.get(p.id)!;
			return {
				complete,
				locked: lockedBy.length > 0,
				attempt: a
					? {
							completionStatus: a.completionStatus,
							successStatus: a.successStatus,
							scoreRaw: a.scoreRaw
						}
					: null
			};
		});
		const mine = packages
			.map((p) => attempts.get(`${p.id}:${s.userId}`))
			.filter((a) => a !== undefined);
		const lastAccess = mine
			.map((a) => a.lastAccessedAt)
			.filter((d): d is Date => d !== null)
			.sort((a, b) => b.getTime() - a.getTime())[0];

		return {
			userId: s.userId,
			name: s.name,
			email: s.email,
			status: s.status,
			progress: summarizeProgress(packages, attempts, s.userId),
			cells,
			totalTime: mine.reduce((sum, a) => sum + a.totalTime, 0),
			lastAccess: lastAccess ?? null
		};
	});

	return {
		course: { title: course.title, slug: course.slug },
		packages: packages.map((p) => ({
			id: p.id,
			title: p.title,
			version: p.version,
			criteria: describeCriteria(p)
		})),
		rows
	};
};
