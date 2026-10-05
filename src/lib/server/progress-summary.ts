import { type ActivityRules, evaluateActivities } from './completion.js';
import type { AttemptHistory } from './db/progress.js';

export type CourseProgress = {
	total: number;
	completed: number;
	percent: number;
	/** First activity that isn't complete and isn't locked, for the Continue button. */
	nextActivityId: string | null;
	started: boolean;
};

/**
 * Summarizes one learner's progress through a course's activities (in course order).
 * An activity counts as done when it meets its own completion rule.
 */
export function summarizeProgress(
	activities: ActivityRules[],
	attempts: AttemptHistory,
	userId: string
): CourseProgress {
	const attemptsOf = (id: string) => attempts.get(`${id}:${userId}`) ?? [];
	const states = evaluateActivities(activities, attemptsOf);
	let completed = 0;
	let started = false;
	let nextActivityId: string | null = null;
	for (const p of activities) {
		const state = states.get(p.id)!;
		if (attemptsOf(p.id).some((a) => a.completionStatus !== 'not attempted')) started = true;
		if (state.complete) completed += 1;
		else if (state.lockedBy.length === 0) nextActivityId ??= p.id;
	}
	const total = activities.length;
	return {
		total,
		completed,
		percent: total === 0 ? 0 : Math.round((completed / total) * 100),
		nextActivityId,
		started
	};
}
