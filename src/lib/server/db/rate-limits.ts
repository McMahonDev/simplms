import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { type RateLimit, type RateLimitResult, decideRateLimit } from '../rate-limit.js';
import { db } from './index.js';
import { rateLimitHit } from './schema.js';

/**
 * Counts one try against every limit, or none if any limit is already used up. Runs in one
 * transaction holding an advisory lock per key, so concurrent tries are counted one at a time
 * and a burst of parallel requests can't all pass. Refused tries aren't counted.
 */
export async function consumeRateLimit(limits: RateLimit[], now = new Date()) {
	return db.transaction(async (tx): Promise<RateLimitResult> => {
		// Lock in a fixed order so two requests sharing keys can't deadlock.
		for (const key of limits.map((l) => l.key).toSorted()) {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
		}

		let retryAfterMs = 0;
		for (const limit of limits) {
			const hits = await tx
				.select({ at: rateLimitHit.createdAt })
				.from(rateLimitHit)
				.where(
					and(
						eq(rateLimitHit.key, limit.key),
						gt(rateLimitHit.createdAt, new Date(now.getTime() - limit.windowMs))
					)
				)
				.orderBy(asc(rateLimitHit.createdAt));
			const result = decideRateLimit(
				hits.map((h) => h.at),
				limit,
				now
			);
			if (!result.allowed) retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs);
		}
		if (retryAfterMs > 0) return { allowed: false, retryAfterMs };

		await tx.insert(rateLimitHit).values(limits.map((l) => ({ key: l.key, createdAt: now })));
		return { allowed: true };
	});
}

/** Forgets the tries counted for these keys, e.g. after a correct enrollment code. */
export async function resetRateLimit(keys: string[]) {
	if (keys.length === 0) return;
	await db.delete(rateLimitHit).where(inArray(rateLimitHit.key, keys));
}

/** Deletes tries older than the cutoff. Returns how many were removed. */
export async function pruneRateLimitHits(before: Date) {
	const rows = await db
		.delete(rateLimitHit)
		.where(lt(rateLimitHit.createdAt, before))
		.returning({ id: rateLimitHit.id });
	return rows.length;
}
