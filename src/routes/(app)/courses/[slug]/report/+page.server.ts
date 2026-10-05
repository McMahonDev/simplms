import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { loadCourseFor } from '#lib/server/course-context.js';
import { attemptGrants, grantAttempt } from '#lib/server/db/attempts.js';
import { listStudents } from '#lib/server/db/enrollments.js';
import { attemptHistory, listPackages } from '#lib/server/db/progress.js';
import {
	attemptsAllowed,
	describeCriteria,
	isFinished,
	evaluateActivities,
	resultAttempt,
	resultOf
} from '#lib/server/completion.js';
import { summarizeProgress } from '#lib/server/progress-summary.js';
import { notify, messages } from '#lib/server/notifications.js';
import { capabilitiesFor } from '#lib/server/permissions.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'course:reports:view');
	const [students, packages] = await Promise.all([
		listStudents(course.id),
		listPackages(course.id)
	]);
	const packageIds = packages.map((p) => p.id);
	const studentIds = students.map((s) => s.userId);
	const [attempts, grants, caps] = await Promise.all([
		attemptHistory(packageIds, studentIds),
		attemptGrants(packageIds, studentIds),
		capabilitiesFor(user, ['course:edit'], course.id)
	]);

	const rows = students.map((s) => {
		const attemptsOf = (id: string) => attempts.get(`${id}:${s.userId}`) ?? [];
		const states = evaluateActivities(packages, attemptsOf);
		const cells = packages.map((p) => {
			const tries = attemptsOf(p.id);
			const shown = resultAttempt(tries, p);
			const { complete, lockedBy } = states.get(p.id)!;
			const allowed = attemptsAllowed(p.maxAttempts, grants.get(`${p.id}:${s.userId}`));
			return {
				complete,
				locked: lockedBy.length > 0,
				attemptCount: tries.length,
				attemptsAllowed: allowed,
				// Out of attempts without completing: the teacher can give one more.
				outOfAttempts:
					!complete && allowed != null && tries.length >= allowed && isFinished(tries.at(-1)!),
				attempt: shown
					? { completionStatus: shown.completionStatus, scoreRaw: shown.scoreRaw }
					: null,
				result: shown ? resultOf(shown, p) : null
			};
		});
		const mine = packages.flatMap((p) => attemptsOf(p.id));
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
		canGrant: caps['course:edit'],
		packages: packages.map((p) => ({
			id: p.id,
			title: p.title,
			version: p.version,
			criteria: describeCriteria(p)
		})),
		rows
	};
};

const grantSchema = z.object({ packageId: formFields.uuid(), userId: formFields.uuid() });

export const actions: Actions = {
	grantAttempt: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(grantSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'grantAttempt', ...formError('Invalid request.') });

		const { packageId, userId } = parsed.data;
		const [packages, students] = await Promise.all([
			listPackages(course.id),
			listStudents(course.id)
		]);
		const activity = packages.find((p) => p.id === packageId);
		if (!activity || !students.some((s) => s.userId === userId)) {
			return fail(404, { action: 'grantAttempt', ...formError('Learner or activity not found.') });
		}

		await grantAttempt(packageId, userId);
		await notify(messages.attemptGranted(userId, course, activity.title)).catch(() => {});
		return {
			action: 'grantAttempt',
			id: `${packageId}:${userId}`,
			ok: true,
			message: 'Granted one more attempt.'
		};
	}
};
