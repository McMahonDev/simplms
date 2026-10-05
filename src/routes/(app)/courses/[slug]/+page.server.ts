import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { describeCriteria } from '#lib/server/completion.js';
import { findCourse, requireSelfEnroll } from '#lib/server/course-context.js';
import { checkEnrollmentKey } from '#lib/server/db/courses.js';
import { startNewAttempt } from '#lib/server/db/attempts.js';
import { EnrollmentError, enrollUser } from '#lib/server/db/enrollments.js';
import { activitiesWithProgress } from '#lib/server/db/progress.js';
import { consumeRateLimit, resetRateLimit } from '#lib/server/db/rate-limits.js';
import { can, capabilitiesFor } from '#lib/server/permissions.js';
import { type RateLimit, describeWait } from '#lib/server/rate-limit.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await findCourse(event);
	const caps = await capabilitiesFor(
		user,
		[
			'course:view',
			'course:edit',
			'course:enrollments:manage',
			'course:reports:view',
			'scorm:launch'
		],
		course.id
	);

	// Not in the course yet: show a join panel when they may enroll themselves, else 403.
	if (!caps['course:view']) {
		await requireSelfEnroll(user.id, course);
		return { course, activities: [], caps, join: { method: course.enrollmentMethod } };
	}

	const activities = (await activitiesWithProgress(course.id, user.id)).map((a) => ({
		...a,
		criteria: describeCriteria(a)
	}));
	return { course, activities, caps, join: null };
};

const KEY_WINDOW_MS = 15 * 60_000;

/**
 * Enrollment-code guesses: 5 per learner per course, and 30 per IP address across all courses
 * so making extra accounts doesn't help. Both within 15 minutes.
 */
function enrollmentKeyLimits(userId: string, courseId: string, ip: string): RateLimit[] {
	return [
		{ key: `enroll-key:user:${userId}:${courseId}`, max: 5, windowMs: KEY_WINDOW_MS },
		{ key: `enroll-key:ip:${ip}`, max: 30, windowMs: KEY_WINDOW_MS }
	];
}

const joinSchema = z.object({
	key: z.string().trim().max(100).optional()
});

const retakeSchema = z.object({ activityId: formFields.uuid() });

export const actions: Actions = {
	retake: async (event) => {
		const { course, user } = await findCourse(event);
		if (!(await can(user, 'scorm:launch', course.id))) {
			return fail(403, {
				action: 'retake',
				...formError('You do not have access to this course.')
			});
		}
		const parsed = parseForm(retakeSchema, await event.request.formData());
		const activity = parsed.ok
			? (await activitiesWithProgress(course.id, user.id)).find(
					(a) => a.id === parsed.data.activityId
				)
			: undefined;
		if (!activity) return fail(404, { action: 'retake', ...formError('Activity not found.') });

		const staff = await can(user, 'course:edit', course.id);
		if (activity.lockedBy.length > 0 && !staff) {
			return fail(403, {
				action: 'retake',
				id: activity.id,
				...formError('This activity is locked.')
			});
		}
		if (!activity.canRetake) {
			return fail(400, {
				action: 'retake',
				id: activity.id,
				...formError(
					activity.finished
						? 'You have used all your attempts.'
						: 'Finish your current attempt first.'
				)
			});
		}
		await startNewAttempt(activity.id, user.id);
		redirect(303, `/courses/${course.slug}/activities/${activity.id}`);
	},

	join: async (event) => {
		const { course, user } = await findCourse(event);
		if (await can(user, 'course:view', course.id)) redirect(303, `/courses/${course.slug}`);
		await requireSelfEnroll(user.id, course);

		if (course.enrollmentMethod === 'key') {
			const parsed = parseForm(joinSchema, await event.request.formData());
			if (!parsed.ok || !parsed.data.key) {
				return fail(400, { action: 'join', ...formError('Enter the enrollment code.') });
			}
			// Count the try before checking the code, so parallel guesses can't skip the limit.
			const limits = enrollmentKeyLimits(user.id, course.id, event.getClientAddress());
			const limit = await consumeRateLimit(limits);
			if (!limit.allowed) {
				return fail(429, {
					action: 'join',
					...formError(
						`Too many tries. Try again in ${describeWait(limit.retryAfterMs)}, or ask your teacher for the code.`
					)
				});
			}
			if (!(await checkEnrollmentKey(course.id, parsed.data.key))) {
				return fail(400, {
					action: 'join',
					...formError('That code is not right. Check it with your teacher.')
				});
			}
			// The IP limit keeps counting; it's shared with everyone on that address.
			await resetRateLimit([limits[0]!.key]);
		}

		try {
			await enrollUser(course.id, user.id, 'student');
		} catch (err) {
			// A double submit already enrolled them; either way they're in.
			if (!(err instanceof EnrollmentError)) throw err;
		}
		redirect(303, `/courses/${course.slug}`);
	}
};
