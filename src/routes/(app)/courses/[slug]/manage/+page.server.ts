import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { describeCriteria, findCycle } from '#lib/server/completion.js';
import { loadCourseFor } from '#lib/server/course-context.js';
import { flattenTree, getCategoryTree } from '#lib/server/db/categories.js';
import { deleteCourse, updateCourse } from '#lib/server/db/courses.js';
import {
	deleteActivity,
	moveActivity,
	renameActivity,
	updateActivitySettings
} from '#lib/server/db/activities.js';
import { listActivities } from '#lib/server/db/progress.js';
import { courseSchema } from '#lib/server/form-schemas.js';
import { capabilitiesFor } from '#lib/server/permissions.js';
import { ScormImportError } from '#lib/server/scorm/errors.js';
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
	const [tree, activities] = await Promise.all([getCategoryTree(), listActivities(course.id)]);
	const titles = new Map(activities.map((p) => [p.id, p.title]));
	return {
		course,
		caps,
		activities: activities.map((p) => ({
			...p,
			criteria: describeCriteria(p),
			requiresTitles: p.requires.map((id) => titles.get(id)).filter((t) => t !== undefined)
		})),
		maxUploadMb: Math.round(maxUploadBytes / 1024 / 1024),
		categories: flattenTree(tree).map((c) => ({ id: c.id, name: c.name, depth: c.depth }))
	};
};

const packageSchema = z.object({
	activityId: formFields.uuid(),
	direction: z.enum(['up', 'down']).optional(),
	title: z.string().trim().min(1, 'Required').max(200).optional()
});

const activitySettingsSchema = z.object({
	activityId: formFields.uuid(),
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
		const storageKeys = await deleteCourse(course.id);
		await Promise.all(storageKeys.map((key) => storage.deletePrefix(key)));
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
			const added = await ingestScormUpload(course.id, file, title.data || undefined);
			return {
				action: 'upload',
				ok: true,
				message: `Added “${added.title}” (SCORM ${added.scorm.version}).`
			};
		} catch (err) {
			if (err instanceof ScormImportError) {
				return fail(400, { action: 'upload', ...formError(err.message) });
			}
			throw err;
		}
	},

	moveActivity: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok || !parsed.data.direction) {
			return fail(400, { action: 'moveActivity', ...formError('Invalid request.') });
		}
		await moveActivity(course.id, parsed.data.activityId, parsed.data.direction);
		return { action: 'moveActivity', ok: true };
	},

	renameActivity: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok || !parsed.data.title) {
			return fail(400, { action: 'renameActivity', ...formError('Enter a title.') });
		}
		const found = await renameActivity(course.id, parsed.data.activityId, parsed.data.title);
		if (!found) return fail(404, { action: 'renameActivity', ...formError('Activity not found.') });
		return { action: 'renameActivity', id: parsed.data.activityId, ok: true, message: 'Renamed.' };
	},

	activitySettings: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const formData = await event.request.formData();
		const parsed = activitySettingsSchema.safeParse({
			activityId: formData.get('activityId'),
			completionRule: formData.get('completionRule'),
			completionMinScore: formData.get('completionMinScore') ?? '',
			maxAttempts: formData.get('maxAttempts') ?? '',
			requires: formData.getAll('requires')
		});
		if (!parsed.success) {
			const id = String(formData.get('activityId') ?? '');
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

		const { activityId, completionRule, completionMinScore, maxAttempts, requires } = parsed.data;
		const activities = await listActivities(course.id);
		const fail400 = (message: string) =>
			fail(400, { action: 'activitySettings', id: activityId, ...formError(message) });
		const inCourse = new Set(activities.map((a) => a.id));
		if (!inCourse.has(activityId)) {
			return fail(404, { action: 'activitySettings', ...formError('Activity not found.') });
		}
		if (requires.some((id) => !inCourse.has(id)))
			return fail400('Pick prerequisites from this course.');
		if (findCycle(activities, activityId, requires)) {
			return fail400(
				'Those prerequisites would create a loop, so the activities could never unlock.'
			);
		}

		await updateActivitySettings(course.id, activityId, {
			completionRule,
			// The passing score only applies to the "passes it" rule.
			completionMinScore: completionRule === 'passed' ? completionMinScore : null,
			maxAttempts,
			requires: [...new Set(requires)]
		});
		return { action: 'activitySettings', id: activityId, ok: true, message: 'Settings saved.' };
	},

	deleteActivity: async (event) => {
		const { course } = await loadCourseFor(event, 'course:edit');
		const parsed = parseForm(packageSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'deleteActivity', ...parsed });
		const deleted = await deleteActivity(course.id, parsed.data.activityId);
		if (!deleted) {
			return fail(404, { action: 'deleteActivity', ...formError('Activity not found.') });
		}
		if (deleted.storageKey) await storage.deletePrefix(deleted.storageKey);
		return { action: 'deleteActivity', ok: true, message: 'Activity deleted.' };
	}
};
