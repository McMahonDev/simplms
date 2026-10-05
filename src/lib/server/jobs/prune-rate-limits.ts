import { pruneRateLimitHits } from '../db/rate-limits.js';
import type { Job } from './types.js';

/** Longer than any rate-limit window, so pruning never frees a slot early. */
const KEEP_HOURS = 24;

export const pruneRateLimits: Job = {
	name: 'prune-rate-limits',
	description: `Deletes rate-limit records older than ${KEEP_HOURS} hours.`,
	everyMinutes: 60,
	async run(now) {
		const removed = await pruneRateLimitHits(new Date(now.getTime() - KEEP_HOURS * 3_600_000));
		return `${removed} removed`;
	}
};
