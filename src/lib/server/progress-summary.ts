import { type AttemptSummary, isComplete } from './db/progress.js';

export type CourseProgress = {
	total: number;
	completed: number;
	percent: number;
	/** First activity that isn't complete yet, for the Continue button. */
	nextPackageId: string | null;
	started: boolean;
};

/**
 * Summarizes one learner's progress through a course's activities (in course order).
 * An activity counts as done when completed or passed.
 */
export function summarizeProgress(
	packages: { id: string }[],
	attempts: Map<string, AttemptSummary>,
	userId: string
): CourseProgress {
	let completed = 0;
	let started = false;
	let nextPackageId: string | null = null;
	for (const p of packages) {
		const attempt = attempts.get(`${p.id}:${userId}`);
		if (attempt && attempt.completionStatus !== 'not attempted') started = true;
		if (attempt && isComplete(attempt)) completed += 1;
		else nextPackageId ??= p.id;
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
