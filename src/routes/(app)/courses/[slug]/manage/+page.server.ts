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
import { deletePackage, movePackage, renamePackage } from '#lib/server/db/packages.js';
import { listPackages } from '#lib/server/db/progress.js';
import { courseSchema } from '#lib/server/form-schemas.js';
import { capabilitiesFor } from '#lib/server/permissions.js';
import { ScormImportError } from '#lib/server/scorm/errors.js';
import { storageKeyFor } from '#lib/server/scorm/import.js';
import { ingestScormUpload, maxUploadBytes } from '#lib/server/scorm/upload.js';
import { storage } from '#lib/server/storage/index.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { course, user } = await loadCourseFor(event, 'course:edit');
	const caps = await capabilitiesFor(
		user,
		['course:delete', 'course:enrollments:manage'],
		course.id
	);
	const [tree, enrollments, packages] = await Promise.all([
		getCategoryTree(),
		caps['course:enrollments:manage'] ? listEnrollments(course.id) : [],
		listPackages(course.id)
	]);
	return {
		course,
		caps,
		enrollments,
		packages,
		maxUploadMb: Math.round(maxUploadBytes / 1024 / 1024),
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

const packageSchema = z.object({
	packageId: formFields.uuid(),
	direction: z.enum(['up', 'down']).optional(),
	title: z.string().trim().min(1, 'Required').max(200).optional()
});

const uploadTitleSchema = z.string().trim().max(200).optional();

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
		const packageIds = await deleteCourse(course.id);
		await Promise.all(packageIds.map((id) => storage.deletePrefix(storageKeyFor(id))));
		redirect(303, '/admin/courses');
	},

	upload: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const formData = await event.request.formData();
		const file = formData.get('package');
		const title = uploadTitleSchema.safeParse(formData.get('title') ?? undefined);
		if (!(file instanceof File) || !title.success) {
			return fail(400, { action: 'upload', ...formError('Choose a .zip file to upload.') });
		}

		try {
			const pkg = await ingestScormUpload(course.id, file, title.data || undefined);
			return {
				action: 'upload',
				ok: true,
				message: `Added “${pkg.title}” (SCORM ${pkg.version}).`
			};
		} catch (err) {
			if (err instanceof ScormImportError) {
				return fail(400, { action: 'upload', ...formError(err.message) });
			}
			throw err;
		}
	},

	movePackage: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok || !parsed.data.direction) {
			return fail(400, { action: 'movePackage', ...formError('Invalid request.') });
		}
		await movePackage(course.id, parsed.data.packageId, parsed.data.direction);
		return { action: 'movePackage', ok: true };
	},

	renamePackage: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok || !parsed.data.title) {
			return fail(400, { action: 'renamePackage', ...formError('Enter a title.') });
		}
		const found = await renamePackage(course.id, parsed.data.packageId, parsed.data.title);
		if (!found) return fail(404, { action: 'renamePackage', ...formError('Activity not found.') });
		return { action: 'renamePackage', id: parsed.data.packageId, ok: true, message: 'Renamed.' };
	},

	deletePackage: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'deletePackage', ...parsed });
		const storageKey = await deletePackage(course.id, parsed.data.packageId);
		if (!storageKey) {
			return fail(404, { action: 'deletePackage', ...formError('Activity not found.') });
		}
		await storage.deletePrefix(storageKey);
		return { action: 'deletePackage', ok: true, message: 'Activity deleted.' };
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
