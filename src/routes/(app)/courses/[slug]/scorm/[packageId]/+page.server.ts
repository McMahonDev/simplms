import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { isFinished } from '#lib/server/completion.js';
import { loadCourseFor } from '#lib/server/course-context.js';
import { getOrCreateCurrentAttempt, touchAttempt } from '#lib/server/db/attempts.js';
import { getCoursePackage } from '#lib/server/db/packages.js';
import { packagesWithProgress } from '#lib/server/db/progress.js';
import { can } from '#lib/server/permissions.js';
import { buildLaunchCmi } from '#lib/server/scorm/cmi.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'scorm:launch');

	const packageId = z.uuid().safeParse(event.params.packageId);
	const pkg = packageId.success ? await getCoursePackage(course.id, packageId.data) : null;
	if (!pkg) error(404, 'Activity not found');

	const activity = (await packagesWithProgress(course.id, user.id)).find((a) => a.id === pkg.id)!;
	// Learners can't open an activity until its prerequisites are complete; staff can preview.
	if (activity.lockedBy.length > 0 && !(await can(user, 'course:edit', course.id))) {
		error(403, `This activity is locked. Complete ${activity.lockedBy.join(', ')} first.`);
	}

	const attempt = await getOrCreateCurrentAttempt(pkg.id, user.id);
	await touchAttempt(attempt.id);
	// A finished attempt reopens read-only; retakes start a new attempt from the course page.
	const review = isFinished(attempt);
	const attemptsUsed = Math.max(activity.attemptCount, 1);

	// Each page load is one SCORM session; the id lets the commit endpoint accumulate time.
	const sessionId = randomUUID();
	const encodedHref = pkg.entryHref
		.split('/')
		.map((segment, i, all) =>
			// Keep any query string on the last segment intact.
			i === all.length - 1 ? segment : encodeURIComponent(segment)
		)
		.join('/');

	return {
		course: { slug: course.slug, title: course.title },
		activity: { id: pkg.id, title: pkg.title, version: pkg.version },
		attempt: {
			number: attempt.attemptNumber,
			max: pkg.maxAttempts,
			review,
			canRetake: review && (pkg.maxAttempts == null || attemptsUsed < pkg.maxAttempts)
		},
		launchUrl: `/scorm/content/${pkg.id}/${encodedHref}`,
		commitUrl: `/api/scorm/attempts/${attempt.id}/commit?session=${sessionId}`,
		cmi: buildLaunchCmi(
			pkg.version,
			attempt.cmiJson as Record<string, unknown>,
			attempt.totalTime,
			{ id: user.id, name: user.name },
			review ? 'review' : 'normal'
		)
	};
};
