import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { describeCriteria, findCycle } from '#lib/server/completion.js';
import { loadCourseFor } from '#lib/server/course-context.js';
import { flattenTree, getCategoryTree } from '#lib/server/db/categories.js';
import { deleteCourse, updateCourse } from '#lib/server/db/courses.js';
import {
	deletePackage,
	movePackage,
	renamePackage,
	updateActivitySettings
} from '#lib/server/db/packages.js';
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
	const [tree, packages] = await Promise.all([getCategoryTree(), listPackages(course.id)]);
	const titles = new Map(packages.map((p) => [p.id, p.title]));
	return {
		course,
		caps,
		packages: packages.map((p) => ({
			...p,
			criteria: describeCriteria(p),
			requiresTitles: p.requires.map((id) => titles.get(id)).filter((t) => t !== undefined)
		})),
		maxUploadMb: Math.round(maxUploadBytes / 1024 / 1024),
		categories: flattenTree(tree).map((c) => ({ id: c.id, name: c.name, depth: c.depth }))
	};
};

const packageSchema = z.object({
	packageId: formFields.uuid(),
	direction: z.enum(['up', 'down']).optional(),
	title: z.string().trim().min(1, 'Required').max(200).optional()
});

const activitySettingsSchema = z.object({
	packageId: formFields.uuid(),
	completionRule: z.enum(['viewed', 'completed', 'passed']),
	completionMinScore: z
		.string()
		.trim()
		.transform((v) => (v === '' ? null : Number(v)))
		.pipe(z.number('Enter a number').min(0).max(1000).nullable()),
	maxAttempts: z
		.string()
		.trim()
		.transform((v) => (v === '' ? null : Number(v)))
		.pipe(z.number().int().min(1).max(100).nullable()),
	requires: z.array(formFields.uuid()).max(100)
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

	activitySettings: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const formData = await event.request.formData();
		const parsed = activitySettingsSchema.safeParse({
			packageId: formData.get('packageId'),
			completionRule: formData.get('completionRule'),
			completionMinScore: formData.get('completionMinScore') ?? '',
			maxAttempts: formData.get('maxAttempts') ?? '',
			requires: formData.getAll('requires')
		});
		if (!parsed.success) {
			const id = String(formData.get('packageId') ?? '');
			const field = parsed.error.issues[0]?.path[0];
			return fail(400, {
				action: 'activitySettings',
				id,
				...formError(
					field === 'completionMinScore'
						? 'Passing score must be a number from 0 to 1000.'
						: field === 'maxAttempts'
							? 'Attempts must be a whole number from 1 to 100, or blank for unlimited.'
							: 'Invalid request.'
				)
			});
		}

		const { packageId, completionRule, completionMinScore, maxAttempts, requires } = parsed.data;
		const activities = await listPackages(course.id);
		const fail400 = (message: string) =>
			fail(400, { action: 'activitySettings', id: packageId, ...formError(message) });
		const inCourse = new Set(activities.map((a) => a.id));
		if (!inCourse.has(packageId)) {
			return fail(404, { action: 'activitySettings', ...formError('Activity not found.') });
		}
		if (requires.some((id) => !inCourse.has(id)))
			return fail400('Pick prerequisites from this course.');
		if (findCycle(activities, packageId, requires)) {
			return fail400(
				'Those prerequisites would create a loop, so the activities could never unlock.'
			);
		}

		await updateActivitySettings(course.id, packageId, {
			completionRule,
			// The passing score only applies to the "passes it" rule.
			completionMinScore: completionRule === 'passed' ? completionMinScore : null,
			maxAttempts,
			requires: [...new Set(requires)]
		});
		return { action: 'activitySettings', id: packageId, ok: true, message: 'Settings saved.' };
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
	}
};
