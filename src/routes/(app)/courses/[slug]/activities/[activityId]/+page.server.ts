import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { isFinished } from '#lib/server/completion.js';
import { loadCourseFor } from '#lib/server/course-context.js';
import { getCourseActivity } from '#lib/server/db/activities.js';
import { getOrCreateCurrentAttempt, touchAttempt } from '#lib/server/db/attempts.js';
import { activitiesWithProgress } from '#lib/server/db/progress.js';
import { can } from '#lib/server/permissions.js';
import { buildLaunchCmi } from '#lib/server/scorm/cmi.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'scorm:launch');

	const activityId = z.uuid().safeParse(event.params.activityId);
	const activity = activityId.success ? await getCourseActivity(course.id, activityId.data) : null;
	// Only SCORM activities can be opened so far; other types arrive with issue #13.
	const scorm = activity?.scorm;
	if (!activity || !scorm) error(404, 'Activity not found');

	const progress = (await activitiesWithProgress(course.id, user.id)).find(
		(a) => a.id === activity.id
	)!;
	// Learners can't open an activity until its prerequisites are complete; staff can preview.
	if (progress.lockedBy.length > 0 && !(await can(user, 'course:edit', course.id))) {
		error(403, `This activity is locked. Complete ${progress.lockedBy.join(', ')} first.`);
	}

	const attempt = await getOrCreateCurrentAttempt(activity.id, user.id);
	await touchAttempt(attempt.id);
	// A finished attempt reopens read-only; retakes start a new attempt from the course page.
	const review = isFinished(attempt);
	const attemptsUsed = Math.max(progress.attemptCount, 1);

	// Each page load is one SCORM session; the id lets the commit endpoint accumulate time.
	const sessionId = randomUUID();
	const encodedHref = scorm.entryHref
		.split('/')
		.map((segment, i, all) =>
			// Keep any query string on the last segment intact.
			i === all.length - 1 ? segment : encodeURIComponent(segment)
		)
		.join('/');

	return {
		course: { slug: course.slug, title: course.title },
		activity: { id: activity.id, title: activity.title, version: scorm.version },
		attempt: {
			number: attempt.attemptNumber,
			max: progress.attemptsAllowed,
			review,
			canRetake:
				review && (progress.attemptsAllowed == null || attemptsUsed < progress.attemptsAllowed)
		},
		launchUrl: `/scorm/content/${activity.id}/${encodedHref}`,
		commitUrl: `/api/scorm/attempts/${attempt.id}/commit?session=${sessionId}`,
		cmi: buildLaunchCmi(
			scorm.version,
			attempt.data as Record<string, unknown>,
			attempt.totalTime,
			{ id: user.id, name: user.name },
			review ? 'review' : 'normal'
		)
	};
};
