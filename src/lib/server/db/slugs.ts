import { and, like, ne } from 'drizzle-orm';
import { slugify } from '../validation.js';
import { db } from './index.js';
import { category, course } from './schema.js';

const tables = { category, course };

/**
 * Returns `base` slugified, suffixed with -2, -3, ... if already taken.
 * `exceptId` lets a row keep its own slug on update.
 */
export async function uniqueSlug(
	table: keyof typeof tables,
	base: string,
	exceptId?: string
): Promise<string> {
	const t = tables[table];
	const root = slugify(base) || table;
	const rows = await db
		.select({ slug: t.slug })
		.from(t)
		.where(and(like(t.slug, `${root}%`), exceptId ? ne(t.id, exceptId) : undefined));
	const taken = new Set(rows.map((r) => r.slug));
	if (!taken.has(root)) return root;
	for (let i = 2; ; i++) {
		const candidate = `${root}-${i}`;
		if (!taken.has(candidate)) return candidate;
	}
}
