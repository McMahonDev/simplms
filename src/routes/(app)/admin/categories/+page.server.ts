import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	CategoryError,
	courseCountsByCategory,
	createCategory,
	deleteCategory,
	flattenTree,
	getCategoryTree,
	updateCategory
} from '#lib/server/db/categories.js';
import { authorize } from '#lib/server/permissions.js';
import { formError, formFields, parseForm } from '#lib/server/validation.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	await authorize(event, 'categories:manage');
	const [tree, counts] = await Promise.all([getCategoryTree(), courseCountsByCategory()]);
	return {
		tree,
		options: flattenTree(tree).map((c) => ({ id: c.id, name: c.name, depth: c.depth })),
		courseCounts: Object.fromEntries(counts)
	};
};

const categorySchema = z.object({
	name: formFields.trimmed(120),
	slug: formFields.optionalSlug(),
	description: formFields.optionalText(2000),
	parentId: formFields.optionalUuid(),
	sortOrder: formFields.sortOrder()
});

const idSchema = z.object({ id: formFields.uuid() });

export const actions: Actions = {
	create: async (event) => {
		await authorize(event, 'categories:manage');
		const parsed = parseForm(categorySchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'create', ...parsed });

		const row = await createCategory(parsed.data);
		return { action: 'create', ok: true, message: `Created “${row.name}”.` };
	},

	update: async (event) => {
		await authorize(event, 'categories:manage');
		const formData = await event.request.formData();
		const ids = parseForm(idSchema, formData);
		if (!ids.ok) return fail(400, { action: 'update', ...ids });
		const parsed = parseForm(categorySchema, formData);
		if (!parsed.ok) return fail(400, { action: 'update', id: ids.data.id, ...parsed });

		try {
			await updateCategory(ids.data.id, parsed.data);
		} catch (err) {
			if (err instanceof CategoryError) {
				return fail(400, { action: 'update', id: ids.data.id, ...formError(err.message) });
			}
			throw err;
		}
		return { action: 'update', id: ids.data.id, ok: true, message: 'Saved.' };
	},

	delete: async (event) => {
		await authorize(event, 'categories:manage');
		const parsed = parseForm(idSchema, await event.request.formData());
		if (!parsed.ok) return fail(400, { action: 'delete', ...parsed });

		try {
			await deleteCategory(parsed.data.id);
		} catch (err) {
			if (err instanceof CategoryError) {
				return fail(409, { action: 'delete', id: parsed.data.id, ...formError(err.message) });
			}
			throw err;
		}
		return { action: 'delete', ok: true, message: 'Category deleted.' };
	}
};
