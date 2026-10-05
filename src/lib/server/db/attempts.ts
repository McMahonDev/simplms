import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { NormalizedCommit } from '../scorm/cmi.js';
import { db } from './index.js';
import { activity, activityAttempt, attemptGrant, scormPackage } from './schema.js';

/**
 * Returns the user's latest attempt at an activity, creating attempt #1 if none exists.
 * Learners always reopen their latest attempt; a finished one opens in review mode.
 */
export async function getOrCreateCurrentAttempt(activityId: string, userId: string) {
	const latest = () =>
		db
			.select()
			.from(activityAttempt)
			.where(and(eq(activityAttempt.activityId, activityId), eq(activityAttempt.userId, userId)))
			.orderBy(desc(activityAttempt.attemptNumber))
			.limit(1);

	const [existing] = await latest();
	if (existing) return existing;

	// Two tabs can race here; the unique (activity, user, attempt_number) index settles it.
	await db
		.insert(activityAttempt)
		.values({ activityId, userId, attemptNumber: 1 })
		.onConflictDoNothing();
	const [created] = await latest();
	return created;
}

/**
 * Starts the next attempt for a user (latest + 1). The caller checks the attempt limit and that
 * the latest attempt is finished. A double submit can't create two: the unique
 * (activity, user, attempt_number) index makes the second insert a no-op.
 */
export async function startNewAttempt(activityId: string, userId: string) {
	const [{ latest }] = await db
		.select({ latest: max(activityAttempt.attemptNumber) })
		.from(activityAttempt)
		.where(and(eq(activityAttempt.activityId, activityId), eq(activityAttempt.userId, userId)));
	await db
		.insert(activityAttempt)
		.values({ activityId, userId, attemptNumber: (latest ?? 0) + 1 })
		.onConflictDoNothing();
}

/** Gives one learner one more attempt on an activity, beyond its limit. */
export async function grantAttempt(activityId: string, userId: string) {
	await db
		.insert(attemptGrant)
		.values({ activityId, userId, extraAttempts: 1 })
		.onConflictDoUpdate({
			target: [attemptGrant.activityId, attemptGrant.userId],
			set: { extraAttempts: sql`${attemptGrant.extraAttempts} + 1` }
		});
}

/** Extra attempts granted, keyed "activityId:userId" (missing means none). */
export async function attemptGrants(activityIds: string[], userIds: string[]) {
	const grants = new Map<string, number>();
	if (activityIds.length === 0 || userIds.length === 0) return grants;
	const rows = await db
		.select()
		.from(attemptGrant)
		.where(
			and(inArray(attemptGrant.activityId, activityIds), inArray(attemptGrant.userId, userIds))
		);
	for (const r of rows) grants.set(`${r.activityId}:${r.userId}`, r.extraAttempts);
	return grants;
}

/**
 * True when the user has opened the activity at least once. The launch page creates the attempt
 * after checking locks, so the SCORM content route uses this to keep locked packages closed.
 */
export async function hasAttempt(activityId: string, userId: string) {
	const [row] = await db
		.select({ id: activityAttempt.id })
		.from(activityAttempt)
		.where(and(eq(activityAttempt.activityId, activityId), eq(activityAttempt.userId, userId)))
		.limit(1);
	return Boolean(row);
}

/** The attempt plus the activity and SCORM facts the commit endpoint needs. */
export async function getAttemptForCommit(attemptId: string) {
	const [row] = await db
		.select({
			id: activityAttempt.id,
			userId: activityAttempt.userId,
			completionStatus: activityAttempt.completionStatus,
			successStatus: activityAttempt.successStatus,
			sessionId: activityAttempt.sessionId,
			courseId: activity.courseId,
			version: scormPackage.version
		})
		.from(activityAttempt)
		.innerJoin(activity, eq(activity.id, activityAttempt.activityId))
		.innerJoin(scormPackage, eq(scormPackage.activityId, activityAttempt.activityId))
		.where(eq(activityAttempt.id, attemptId))
		.limit(1);
	return row ?? null;
}

/**
 * Stores a commit: the full CMI for resume plus the normalized reporting columns.
 *
 * total_time accumulates across sessions. Within one player session the SCO reports a
 * growing session_time on every commit, so we replace that session's contribution rather
 * than adding it again.
 */
export async function saveCommit(
	attemptId: string,
	sessionId: string,
	cmi: Record<string, unknown>,
	normalized: NormalizedCommit
) {
	await db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				totalTime: activityAttempt.totalTime,
				sessionId: activityAttempt.sessionId,
				sessionTime: activityAttempt.sessionTime
			})
			.from(activityAttempt)
			.where(eq(activityAttempt.id, attemptId))
			.for('update');
		if (!current) return;

		const sameSession = current.sessionId === sessionId;
		const before = sameSession ? current.totalTime - current.sessionTime : current.totalTime;
		const sessionTime = normalized.sessionSeconds ?? (sameSession ? current.sessionTime : 0);

		await tx
			.update(activityAttempt)
			.set({
				data: cmi,
				completionStatus: normalized.completionStatus,
				successStatus: normalized.successStatus,
				scoreRaw: normalized.scoreRaw,
				// SCORM times have centisecond precision; round away float noise.
				totalTime: Math.round((before + sessionTime) * 100) / 100,
				sessionId,
				sessionTime,
				lastAccessedAt: new Date()
			})
			.where(eq(activityAttempt.id, attemptId));
	});
}

/** Marks the attempt as accessed when the player opens, so reports show recent activity. */
export async function touchAttempt(attemptId: string) {
	await db
		.update(activityAttempt)
		.set({ lastAccessedAt: new Date() })
		.where(eq(activityAttempt.id, attemptId));
}
