import { describe, expect, it } from 'vitest';
import { decideRateLimit, describeWait } from './rate-limit.js';

const now = new Date('2026-10-05T12:00:00Z');
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);
const limit = { max: 3, windowMs: 15 * 60_000 };

describe('decideRateLimit', () => {
	it('allows tries until the limit is reached', () => {
		expect(decideRateLimit([], limit, now)).toEqual({ allowed: true });
		expect(decideRateLimit([minutesAgo(5), minutesAgo(1)], limit, now)).toEqual({ allowed: true });
	});

	it('refuses once full, until the oldest try that matters ages out', () => {
		const result = decideRateLimit([minutesAgo(10), minutesAgo(5), minutesAgo(1)], limit, now);
		expect(result).toEqual({ allowed: false, retryAfterMs: 5 * 60_000 });
	});

	it('with more hits than the max, waits for enough of them to expire', () => {
		// Four hits, max three: two must age out, so the second-oldest decides.
		const hits = [minutesAgo(14), minutesAgo(12), minutesAgo(2), minutesAgo(1)];
		expect(decideRateLimit(hits, limit, now)).toEqual({ allowed: false, retryAfterMs: 3 * 60_000 });
	});

	it('never asks to retry in under a second', () => {
		const hits = [minutesAgo(15), minutesAgo(1), minutesAgo(1)];
		expect(decideRateLimit(hits, limit, now)).toEqual({ allowed: false, retryAfterMs: 1000 });
	});
});

describe('describeWait', () => {
	it('rounds up to whole minutes', () => {
		expect(describeWait(1000)).toBe('1 minute');
		expect(describeWait(60_001)).toBe('2 minutes');
		expect(describeWait(15 * 60_000)).toBe('15 minutes');
	});
});
