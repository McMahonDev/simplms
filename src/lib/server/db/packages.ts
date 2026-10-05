import { and, asc, eq, max } from 'drizzle-orm';
import { db } from './index.js';
import {
	type CompletionRule,
	type ScormVersion,
	activityPrerequisite,
	scormPackage
} from './schema.js';

export async function getPackage(id: string) {
	const [row] = await db.select().from(scormPackage).where(eq(scormPackage.id, id)).limit(1);
	return row ?? null;
}

/** A package by id, but only if it belongs to the given course. */
export async function getCoursePackage(courseId: string, packageId: string) {
	const [row] = await db
		.select()
		.from(scormPackage)
		.where(and(eq(scormPackage.id, packageId), eq(scormPackage.courseId, courseId)))
		.limit(1);
	return row ?? null;
}

export async function createPackage(input: {
	id: string;
	courseId: string;
	title: string;
	version: ScormVersion;
	entryHref: string;
	storageKey: string;
	manifestJson: unknown;
}) {
	const [{ next }] = await db
		.select({ next: max(scormPackage.sortOrder) })
		.from(scormPackage)
		.where(eq(scormPackage.courseId, input.courseId));
	const [row] = await db
		.insert(scormPackage)
		.values({ ...input, sortOrder: (next ?? -1) + 1 })
		.returning();
	return row;
}

export async function renamePackage(courseId: string, packageId: string, title: string) {
	const [row] = await db
		.update(scormPackage)
		.set({ title })
		.where(and(eq(scormPackage.id, packageId), eq(scormPackage.courseId, courseId)))
		.returning({ id: scormPackage.id });
	return Boolean(row);
}

export type ActivitySettings = {
	completionRule: CompletionRule;
	completionMinScore: number | null;
	maxAttempts: number | null;
	/** Must already be checked to belong to the same course and not form a cycle. */
	requires: string[];
};

/** Saves an activity's completion rule and prerequisites. False when it isn't in the course. */
export async function updateActivitySettings(
	courseId: string,
	packageId: string,
	settings: ActivitySettings
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(scormPackage)
			.set({
				completionRule: settings.completionRule,
				completionMinScore: settings.completionMinScore,
				maxAttempts: settings.maxAttempts
			})
			.where(and(eq(scormPackage.id, packageId), eq(scormPackage.courseId, courseId)))
			.returning({ id: scormPackage.id });
		if (!row) return false;

		await tx.delete(activityPrerequisite).where(eq(activityPrerequisite.packageId, packageId));
		if (settings.requires.length > 0) {
			await tx
				.insert(activityPrerequisite)
				.values(settings.requires.map((requiredPackageId) => ({ packageId, requiredPackageId })));
		}
		return true;
	});
}

/** Swaps a package with its neighbour and renumbers the course's packages 0..n-1. */
export async function movePackage(courseId: string, packageId: string, direction: 'up' | 'down') {
	await db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: scormPackage.id })
			.from(scormPackage)
			.where(eq(scormPackage.courseId, courseId))
			.orderBy(asc(scormPackage.sortOrder), asc(scormPackage.createdAt));
		const ids = rows.map((r) => r.id);
		const i = ids.indexOf(packageId);
		const j = direction === 'up' ? i - 1 : i + 1;
		if (i === -1 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		for (const [sortOrder, id] of ids.entries()) {
			await tx.update(scormPackage).set({ sortOrder }).where(eq(scormPackage.id, id));
		}
	});
}

/** Deletes the package row (attempts cascade). Returns its storage key for cleanup. */
export async function deletePackage(courseId: string, packageId: string) {
	const [row] = await db
		.delete(scormPackage)
		.where(and(eq(scormPackage.id, packageId), eq(scormPackage.courseId, courseId)))
		.returning({ storageKey: scormPackage.storageKey });
	return row?.storageKey ?? null;
}
