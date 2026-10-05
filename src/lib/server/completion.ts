/**
 * Activity completion and locking rules. Pure functions, so the course page, dashboard, report,
 * and launch guard all agree and every rule is unit-testable.
 *
 * An activity is complete when its latest attempt meets the activity's rule (viewed, completed,
 * or passed) and, if set, its minimum raw score. An activity is locked for a learner until every
 * prerequisite activity is complete.
 */
import type { CompletionRule, CompletionStatus, SuccessStatus } from './db/schema.js';

export type CompletionCriteria = {
	completionRule: CompletionRule;
	completionMinScore: number | null;
};

export type ActivityRules = CompletionCriteria & {
	id: string;
	title: string;
	/** Ids of activities in the same course that must be complete first. */
	requires: string[];
};

type AttemptLike = {
	completionStatus: CompletionStatus;
	successStatus: SuccessStatus;
	scoreRaw: number | null;
};

export function isActivityComplete(
	attempt: AttemptLike | null | undefined,
	criteria: CompletionCriteria
): boolean {
	if (!attempt) return false;
	const ruleMet =
		criteria.completionRule === 'viewed' ||
		(criteria.completionRule === 'completed' &&
			(attempt.completionStatus === 'completed' || attempt.successStatus === 'passed')) ||
		(criteria.completionRule === 'passed' && attempt.successStatus === 'passed');
	if (!ruleMet) return false;
	if (criteria.completionMinScore == null) return true;
	return attempt.scoreRaw != null && attempt.scoreRaw >= criteria.completionMinScore;
}

export type ActivityState = {
	complete: boolean;
	/** Titles of the prerequisites still to complete; empty when unlocked. */
	lockedBy: string[];
};

/** Completion and lock state for each activity, keyed by activity id. */
export function evaluateActivities(
	activities: ActivityRules[],
	attemptFor: (activityId: string) => AttemptLike | null | undefined
): Map<string, ActivityState> {
	const complete = new Map(activities.map((a) => [a.id, isActivityComplete(attemptFor(a.id), a)]));
	const titles = new Map(activities.map((a) => [a.id, a.title]));

	return new Map(
		activities.map((a) => [
			a.id,
			{
				complete: complete.get(a.id)!,
				// A prerequisite that no longer exists can't hold an activity locked.
				lockedBy: a.requires
					.filter((id) => titles.has(id) && !complete.get(id))
					.map((id) => titles.get(id)!)
			}
		])
	);
}

/** Describes a criteria setting for learners, e.g. "Pass it with a score of at least 80". */
export function describeCriteria(criteria: CompletionCriteria): string {
	const base = {
		viewed: 'Open it',
		completed: 'Complete it',
		passed: 'Pass it'
	}[criteria.completionRule];
	return criteria.completionMinScore == null
		? base
		: `${base} with a score of at least ${criteria.completionMinScore}`;
}

/**
 * Returns the id of an activity that would end up requiring itself if `activityId` required
 * `requires`, or null when the graph stays acyclic. Cycles would lock activities forever.
 */
export function findCycle(
	activities: Pick<ActivityRules, 'id' | 'requires'>[],
	activityId: string,
	requires: string[]
): string | null {
	const edges = new Map(activities.map((a) => [a.id, a.requires]));
	edges.set(activityId, requires);

	// Walk everything reachable from the new requirements; reaching activityId closes a loop.
	const seen = new Set<string>();
	const stack = [...requires];
	while (stack.length > 0) {
		const id = stack.pop()!;
		if (id === activityId) return id;
		if (seen.has(id)) continue;
		seen.add(id);
		stack.push(...(edges.get(id) ?? []));
	}
	return null;
}
