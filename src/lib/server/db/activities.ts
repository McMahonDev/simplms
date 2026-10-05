import { and, asc, eq, max } from 'drizzle-orm';
import { db } from './index.js';
import {
	type CompletionRule,
	type ScormVersion,
	activity,
	activityPrerequisite,
	scormPackage
} from './schema.js';

/** A SCORM activity with its package details, by activity id. */
export async function getScormActivity(id: string) {
	const [row] = await db
		.select({ activity, scorm: scormPackage })
		.from(activity)
		.innerJoin(scormPackage, eq(scormPackage.activityId, activity.id))
		.where(eq(activity.id, id))
		.limit(1);
	return row ? { ...row.activity, scorm: row.scorm } : null;
}

/**
 * An activity by id, but only if it belongs to the given course, with its SCORM package when it
 * has one.
 */
export async function getCourseActivity(courseId: string, activityId: string) {
	const [row] = await db
		.select({ activity, scorm: scormPackage })
		.from(activity)
		.leftJoin(scormPackage, eq(scormPackage.activityId, activity.id))
		.where(and(eq(activity.id, activityId), eq(activity.courseId, courseId)))
		.limit(1);
	return row ? { ...row.activity, scorm: row.scorm } : null;
}

/** Adds a SCORM activity at the end of the course. `id` also names its storage folder. */
export async function createScormActivity(input: {
	id: string;
	courseId: string;
	title: string;
	version: ScormVersion;
	entryHref: string;
	storageKey: string;
	manifestJson: unknown;
}) {
	return db.transaction(async (tx) => {
		const [{ next }] = await tx
			.select({ next: max(activity.sortOrder) })
			.from(activity)
			.where(eq(activity.courseId, input.courseId));
		const [row] = await tx
			.insert(activity)
			.values({
				id: input.id,
				courseId: input.courseId,
				type: 'scorm',
				title: input.title,
				sortOrder: (next ?? -1) + 1
			})
			.returning();
		const [scorm] = await tx
			.insert(scormPackage)
			.values({
				activityId: input.id,
				version: input.version,
				entryHref: input.entryHref,
				storageKey: input.storageKey,
				manifestJson: input.manifestJson
			})
			.returning();
		return { ...row!, scorm: scorm! };
	});
}

export async function renameActivity(courseId: string, activityId: string, title: string) {
	const [row] = await db
		.update(activity)
		.set({ title })
		.where(and(eq(activity.id, activityId), eq(activity.courseId, courseId)))
		.returning({ id: activity.id });
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
	activityId: string,
	settings: ActivitySettings
) {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.update(activity)
			.set({
				completionRule: settings.completionRule,
				completionMinScore: settings.completionMinScore,
				maxAttempts: settings.maxAttempts
			})
			.where(and(eq(activity.id, activityId), eq(activity.courseId, courseId)))
			.returning({ id: activity.id });
		if (!row) return false;

		await tx.delete(activityPrerequisite).where(eq(activityPrerequisite.activityId, activityId));
		if (settings.requires.length > 0) {
			await tx
				.insert(activityPrerequisite)
				.values(
					settings.requires.map((requiredActivityId) => ({ activityId, requiredActivityId }))
				);
		}
		return true;
	});
}

/** Swaps an activity with its neighbour and renumbers the course's activities 0..n-1. */
export async function moveActivity(courseId: string, activityId: string, direction: 'up' | 'down') {
	await db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: activity.id })
			.from(activity)
			.where(eq(activity.courseId, courseId))
			.orderBy(asc(activity.sortOrder), asc(activity.createdAt));
		const ids = rows.map((r) => r.id);
		const i = ids.indexOf(activityId);
		const j = direction === 'up' ? i - 1 : i + 1;
		if (i === -1 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		for (const [sortOrder, id] of ids.entries()) {
			await tx.update(activity).set({ sortOrder }).where(eq(activity.id, id));
		}
	});
}

/**
 * Deletes the activity (its package details, attempts, prerequisites, and grants cascade).
 * Returns whether it existed and the storage prefix to clean up, if it had files.
 */
export async function deleteActivity(courseId: string, activityId: string) {
	return db.transaction(async (tx) => {
		const [scorm] = await tx
			.select({ storageKey: scormPackage.storageKey })
			.from(scormPackage)
			.innerJoin(activity, eq(activity.id, scormPackage.activityId))
			.where(and(eq(activity.id, activityId), eq(activity.courseId, courseId)));
		const [row] = await tx
			.delete(activity)
			.where(and(eq(activity.id, activityId), eq(activity.courseId, courseId)))
			.returning({ id: activity.id });
		return row ? { storageKey: scorm?.storageKey ?? null } : null;
	});
}
