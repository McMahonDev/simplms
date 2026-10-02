import { asc, count, eq } from 'drizzle-orm';
import { db } from './index.js';
import { type Category, category, course } from './schema.js';
import { uniqueSlug } from './slugs.js';

export type CategoryNode = Category & { children: CategoryNode[]; depth: number };

export async function listCategories(): Promise<Category[]> {
	return db.select().from(category).orderBy(asc(category.sortOrder), asc(category.name));
}

/** Builds a tree from a flat list. Orphans (missing parent) are treated as roots. */
export function buildCategoryTree(rows: Category[]): CategoryNode[] {
	const nodes = new Map<string, CategoryNode>(
		rows.map((r) => [r.id, { ...r, children: [], depth: 0 }])
	);
	const roots: CategoryNode[] = [];
	for (const node of nodes.values()) {
		const parent = node.parentId ? nodes.get(node.parentId) : undefined;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	const setDepth = (list: CategoryNode[], depth: number) => {
		for (const n of list) {
			n.depth = depth;
			setDepth(n.children, depth + 1);
		}
	};
	setDepth(roots, 0);
	return roots;
}

/** Depth-first flattening, handy for <select> options and grouped listings. */
export function flattenTree(tree: CategoryNode[]): CategoryNode[] {
	return tree.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export async function getCategoryTree() {
	return buildCategoryTree(await listCategories());
}

/** Ids of a category and all of its descendants. */
export function descendantIds(rows: Category[], rootId: string): Set<string> {
	const ids = new Set([rootId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const r of rows) {
			if (r.parentId && ids.has(r.parentId) && !ids.has(r.id)) {
				ids.add(r.id);
				grew = true;
			}
		}
	}
	return ids;
}

export type CategoryInput = {
	name: string;
	slug?: string;
	description: string;
	parentId: string | null;
	sortOrder?: number;
};

export async function createCategory(input: CategoryInput) {
	const slug = await uniqueSlug('category', input.slug || input.name);
	const [row] = await db
		.insert(category)
		.values({ ...input, slug, sortOrder: input.sortOrder ?? 0 })
		.returning();
	return row;
}

export class CategoryError extends Error {}

export async function updateCategory(id: string, input: CategoryInput) {
	if (input.parentId) {
		// Moving a category under itself or one of its descendants would create a cycle.
		const all = await listCategories();
		if (descendantIds(all, id).has(input.parentId)) {
			throw new CategoryError('A category cannot be moved inside itself.');
		}
	}
	const slug = await uniqueSlug('category', input.slug || input.name, id);
	const [row] = await db
		.update(category)
		.set({ ...input, slug, sortOrder: input.sortOrder ?? 0 })
		.where(eq(category.id, id))
		.returning();
	return row;
}

export async function deleteCategory(id: string) {
	const [{ courses }] = await db
		.select({ courses: count() })
		.from(course)
		.where(eq(course.categoryId, id));
	if (courses > 0) {
		throw new CategoryError(
			`This category has ${courses} course${courses === 1 ? '' : 's'}. Move or delete them first.`
		);
	}
	const [{ children }] = await db
		.select({ children: count() })
		.from(category)
		.where(eq(category.parentId, id));
	if (children > 0) {
		throw new CategoryError('This category has subcategories. Move or delete them first.');
	}
	await db.delete(category).where(eq(category.id, id));
}

export async function courseCountsByCategory(): Promise<Map<string, number>> {
	const rows = await db
		.select({ categoryId: course.categoryId, n: count() })
		.from(course)
		.groupBy(course.categoryId);
	return new Map(rows.map((r) => [r.categoryId, r.n]));
}
