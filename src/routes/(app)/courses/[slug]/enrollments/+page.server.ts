import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { loadCourseFor } from '#lib/server/course-context.js';
import { getEnrollmentKey, setEnrollmentMethod } from '#lib/server/db/courses.js';
import {
	EnrollmentError,
	countEnrollments,
	enrollUser,
	findUserIdByEmail,
	listEnrollments,
	removeEnrollment,
	updateEnrollment
} from '#lib/server/db/enrollments.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

const roleSchema = z.enum(['teacher', 'student']);
const statusSchema = z.enum(['active', 'suspended']);

const filterSchema = z.object({
	q: z.string().trim().max(100).optional().catch(undefined),
	role: roleSchema.optional().catch(undefined),
	status: statusSchema.optional().catch(undefined)
});

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'course:enrollments:manage');
	const filters = filterSchema.parse(Object.fromEntries(event.url.searchParams));

	const [enrollments, counts, enrollmentKey] = await Promise.all([
		listEnrollments(course.id, { ...filters, q: filters.q || undefined }),
		countEnrollments(course.id),
		getEnrollmentKey(course.id)
	]);

	return {
		course: { title: course.title, slug: course.slug, visible: course.visible },
		method: { method: course.enrollmentMethod, key: enrollmentKey ?? '' },
		enrollments,
		counts,
		filters,
		currentUserId: user.id
	};
};

const enrollSchema = z.object({
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	role: roleSchema
});

const enrollmentChangeSchema = z.object({
	enrollmentId: formFields.uuid(),
	role: roleSchema.optional(),
	status: statusSchema.optional()
});

const methodSchema = z
	.object({
		method: z.enum(['manual', 'open', 'key']),
		key: z.string().trim().max(100).optional()
	})
	.refine((v) => v.method !== 'key' || (v.key?.length ?? 0) >= 4, {
		path: ['key'],
		message: 'Use at least 4 characters'
	});

export const actions: Actions = {
	setMethod: async (event) => {
		const { course } = await loadCourseFor(event, 'course:enrollments:manage');
		const parsed = parseForm(methodSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'setMethod', ...parsed });

		await setEnrollmentMethod(course.id, parsed.data.method, parsed.data.key);
		return { action: 'setMethod', ok: true, message: 'Enrollment method saved.' };
	},

	enroll: async (event) => {
		const { course } = await loadCourseFor(event, 'course:enrollments:manage');
		const parsed = parseForm(enrollSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'enroll', ...parsed });

		const values = { email: parsed.data.email, role: parsed.data.role };
		const userId = await findUserIdByEmail(parsed.data.email);
		if (!userId) {
			return fail(404, {
				action: 'enroll',
				...formError('No user has that email address.', values)
			});
		}
		try {
			await enrollUser(course.id, userId, parsed.data.role);
		} catch (err) {
			if (err instanceof EnrollmentError) {
				return fail(409, { action: 'enroll', ...formError(err.message, values) });
			}
			throw err;
		}
		return { action: 'enroll', ok: true, message: `Enrolled ${parsed.data.email}.` };
	},

	updateEnrollment: async (event) => {
		const { course } = await loadCourseFor(event, 'course:enrollments:manage');
		const parsed = parseForm(enrollmentChangeSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'updateEnrollment', ...parsed });

		const { enrollmentId, role, status } = parsed.data;
		const found = await updateEnrollment(course.id, enrollmentId, { role, status });
		if (!found) {
			return fail(404, { action: 'updateEnrollment', ...formError('Enrollment not found.') });
		}
		return { action: 'updateEnrollment', id: enrollmentId, ok: true, message: 'Updated.' };
	},

	unenroll: async (event) => {
		const { course } = await loadCourseFor(event, 'course:enrollments:manage');
		const parsed = parseForm(enrollmentChangeSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'unenroll', ...parsed });

		const found = await removeEnrollment(course.id, parsed.data.enrollmentId);
		if (!found) return fail(404, { action: 'unenroll', ...formError('Enrollment not found.') });
		return { action: 'unenroll', ok: true, message: 'Removed from course.' };
	}
};
