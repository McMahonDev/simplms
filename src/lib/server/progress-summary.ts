import { type ActivityRules, evaluateActivities } from './completion.js';
import type { AttemptSummary } from './db/progress.js';

export type CourseProgress = {
	total: number;
	completed: number;
	percent: number;
	/** First activity that isn't complete and isn't locked, for the Continue button. */
	nextPackageId: string | null;
	started: boolean;
};

/**
 * Summarizes one learner's progress through a course's activities (in course order).
 * An activity counts as done when it meets its own completion rule.
 */
export function summarizeProgress(
	packages: ActivityRules[],
	attempts: Map<string, AttemptSummary>,
	userId: string
): CourseProgress {
	const states = evaluateActivities(packages, (id) => attempts.get(`${id}:${userId}`));
	let completed = 0;
	let started = false;
	let nextPackageId: string | null = null;
	for (const p of packages) {
		const attempt = attempts.get(`${p.id}:${userId}`);
		const state = states.get(p.id)!;
		if (attempt && attempt.completionStatus !== 'not attempted') started = true;
		if (state.complete) completed += 1;
		else if (state.lockedBy.length === 0) nextPackageId ??= p.id;
	}
	const total = packages.length;
	return {
		total,
		completed,
		percent: total === 0 ? 0 : Math.round((completed / total) * 100),
		nextPackageId,
		started
	};
}
