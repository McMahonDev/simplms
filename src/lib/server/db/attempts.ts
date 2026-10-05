import { and, desc, eq, max } from 'drizzle-orm';
import type { NormalizedCommit } from '../scorm/cmi.js';
import { db } from './index.js';
import { scormAttempt, scormPackage } from './schema.js';

/**
 * Returns the user's latest attempt for a package, creating attempt #1 if none exists.
 * Learners always reopen their latest attempt; a finished one opens in review mode.
 */
export async function getOrCreateCurrentAttempt(packageId: string, userId: string) {
	const latest = () =>
		db
			.select()
			.from(scormAttempt)
			.where(and(eq(scormAttempt.packageId, packageId), eq(scormAttempt.userId, userId)))
			.orderBy(desc(scormAttempt.attemptNumber))
			.limit(1);

	const [existing] = await latest();
	if (existing) return existing;

	// Two tabs can race here; the unique (package, user, attempt_number) index settles it.
	await db
		.insert(scormAttempt)
		.values({ packageId, userId, attemptNumber: 1 })
		.onConflictDoNothing();
	const [created] = await latest();
	return created;
}

/**
 * Starts the next attempt for a user (latest + 1). The caller checks the attempt limit and that
 * the latest attempt is finished. A double submit can't create two: the unique
 * (package, user, attempt_number) index makes the second insert a no-op.
 */
export async function startNewAttempt(packageId: string, userId: string) {
	const [{ latest }] = await db
		.select({ latest: max(scormAttempt.attemptNumber) })
		.from(scormAttempt)
		.where(and(eq(scormAttempt.packageId, packageId), eq(scormAttempt.userId, userId)));
	await db
		.insert(scormAttempt)
		.values({ packageId, userId, attemptNumber: (latest ?? 0) + 1 })
		.onConflictDoNothing();
}

/**
 * True when the user has opened the package at least once. The launch page creates the attempt
 * after checking locks, so the content route uses this to keep locked packages closed.
 */
export async function hasAttempt(packageId: string, userId: string) {
	const [row] = await db
		.select({ id: scormAttempt.id })
		.from(scormAttempt)
		.where(and(eq(scormAttempt.packageId, packageId), eq(scormAttempt.userId, userId)))
		.limit(1);
	return Boolean(row);
}

/** The attempt plus the package facts the commit endpoint needs. */
export async function getAttemptForCommit(attemptId: string) {
	const [row] = await db
		.select({
			id: scormAttempt.id,
			userId: scormAttempt.userId,
			completionStatus: scormAttempt.completionStatus,
			successStatus: scormAttempt.successStatus,
			sessionId: scormAttempt.sessionId,
			courseId: scormPackage.courseId,
			version: scormPackage.version
		})
		.from(scormAttempt)
		.innerJoin(scormPackage, eq(scormPackage.id, scormAttempt.packageId))
		.where(eq(scormAttempt.id, attemptId))
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
				totalTime: scormAttempt.totalTime,
				sessionId: scormAttempt.sessionId,
				sessionTime: scormAttempt.sessionTime
			})
			.from(scormAttempt)
			.where(eq(scormAttempt.id, attemptId))
			.for('update');
		if (!current) return;

		const sameSession = current.sessionId === sessionId;
		const before = sameSession ? current.totalTime - current.sessionTime : current.totalTime;
		const sessionTime = normalized.sessionSeconds ?? (sameSession ? current.sessionTime : 0);

		await tx
			.update(scormAttempt)
			.set({
				cmiJson: cmi,
				completionStatus: normalized.completionStatus,
				successStatus: normalized.successStatus,
				scoreRaw: normalized.scoreRaw,
				// SCORM times have centisecond precision; round away float noise.
				totalTime: Math.round((before + sessionTime) * 100) / 100,
				sessionId,
				sessionTime,
				lastAccessedAt: new Date()
			})
			.where(eq(scormAttempt.id, attemptId));
	});
}

/** Marks the attempt as accessed when the player opens, so reports show recent activity. */
export async function touchAttempt(attemptId: string) {
	await db
		.update(scormAttempt)
		.set({ lastAccessedAt: new Date() })
		.where(eq(scormAttempt.id, attemptId));
}
