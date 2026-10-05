/**
 * Sliding-window rate limits. The decision is pure (unit-tested here); counting and recording
 * happen atomically in db/rate-limits.ts so parallel requests can't slip past the limit.
 */

export type RateLimit = {
	/** Names the limit and who it applies to, e.g. "enroll-key:user:<id>:<courseId>". */
	key: string;
	/** Tries allowed within the window. */
	max: number;
	windowMs: number;
};

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * Whether one more try fits, given the tries already counted inside the window (oldest first).
 * When it doesn't, the next slot opens as soon as enough of the oldest tries age out.
 */
export function decideRateLimit(
	hits: Date[],
	limit: Pick<RateLimit, 'max' | 'windowMs'>,
	now: Date
): RateLimitResult {
	if (hits.length < limit.max) return { allowed: true };
	const freesUp = hits[hits.length - limit.max]!.getTime() + limit.windowMs;
	return { allowed: false, retryAfterMs: Math.max(freesUp - now.getTime(), 1000) };
}

/** "1 minute", "12 minutes": rounded up so people never retry too early. */
export function describeWait(ms: number): string {
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
