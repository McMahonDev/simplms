import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { loadCourseFor } from '#lib/server/course-context.js';
import { flattenTree, getCategoryTree } from '#lib/server/db/categories.js';
import { deleteCourse, updateCourse } from '#lib/server/db/courses.js';
import {
	EnrollmentError,
	enrollUser,
	findUserIdByEmail,
	listEnrollments,
	removeEnrollment,
	updateEnrollment
} from '#lib/server/db/enrollments.js';
import { courseSchema } from '#lib/server/form-schemas.js';
import { capabilitiesFor } from '#lib/server/permissions.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'course:edit');
	const caps = await capabilitiesFor(
		user,
		['course:delete', 'course:enrollments:manage'],
		course.id
	);
	const [tree, enrollments] = await Promise.all([
		getCategoryTree(),
		caps['course:enrollments:manage'] ? listEnrollments(course.id) : []
	]);
	return {
		course,
		caps,
		enrollments,
		currentUserId: user.id,
		categories: flattenTree(tree).map((c) => ({ id: c.id, name: c.name, depth: c.depth }))
	};
};

const roleSchema = z.enum(['teacher', 'student']);

const enrollSchema = z.object({
	email: z.email('Enter a valid email address').trim().toLowerCase(),
	role: roleSchema
});

const enrollmentChangeSchema = z.object({
	enrollmentId: formFields.uuid(),
	role: roleSchema.optional(),
	status: z.enum(['active', 'suspended']).optional()
});

export const actions: Actions = {
	details: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(courseSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'details', ...parsed });

		const updated = await updateCourse(course.id, parsed.data);
		if (updated.slug !== course.slug) redirect(303, `/courses/${updated.slug}/manage`);
		return { action: 'details', ok: true, message: 'Course details saved.' };
	},

	delete: async (event) => {
		const { course } = await loadCourseFor(event, 'course:delete');
		await deleteCourse(course.id);
		redirect(303, '/admin/courses');
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
