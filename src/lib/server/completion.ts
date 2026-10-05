/**
 * Activity completion and locking rules. Pure functions, so the course page, dashboard, report,
 * and launch guard all agree and every rule is unit-testable.
 *
 * Pass/fail: when the activity has a passing score, it alone decides pass/fail (the package's own
 * mastery score is ignored); otherwise the package's reported success status is used.
 *
 * An activity is complete when any attempt meets its rule: opened (viewed), completed or passed
 * (completed), or passed. An activity is locked for a learner until every prerequisite activity
 * is complete.
 */
import type { CompletionRule, CompletionStatus, SuccessStatus } from './db/schema.js';

export type CompletionCriteria = {
	completionRule: CompletionRule;
	/** Passing score for the 'passed' rule; when set it replaces the package's own pass mark. */
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

/** Passed or failed for one attempt, or null while there's no verdict yet. */
export function resultOf(
	attempt: AttemptLike,
	criteria: CompletionCriteria
): 'passed' | 'failed' | null {
	if (criteria.completionMinScore != null) {
		if (attempt.scoreRaw == null) return null;
		return attempt.scoreRaw >= criteria.completionMinScore ? 'passed' : 'failed';
	}
	return attempt.successStatus === 'unknown' ? null : attempt.successStatus;
}

export function isActivityComplete(
	attempt: AttemptLike | null | undefined,
	criteria: CompletionCriteria
): boolean {
	if (!attempt) return false;
	const result = resultOf(attempt, criteria);
	switch (criteria.completionRule) {
		case 'viewed':
			return true;
		case 'completed':
			return attempt.completionStatus === 'completed' || result === 'passed';
		case 'passed':
			return result === 'passed';
	}
}

/**
 * Whether an attempt is over: the SCO reported it completed, passed, or failed. Finished attempts
 * reopen in review mode, and a retake starts a new attempt.
 */
export function isFinished(attempt: Pick<AttemptLike, 'completionStatus' | 'successStatus'>) {
	return attempt.completionStatus === 'completed' || attempt.successStatus !== 'unknown';
}

/** The activity's attempt limit plus any granted to this learner; null means unlimited. */
export function attemptsAllowed(maxAttempts: number | null, granted = 0): number | null {
	return maxAttempts == null ? null : maxAttempts + granted;
}

/**
 * Whether a learner may start another attempt: their latest one is finished and they haven't
 * used up their allowance (null means unlimited). With no attempts, they just start #1.
 */
export function canStartNewAttempt(
	attempts: Pick<AttemptLike, 'completionStatus' | 'successStatus'>[],
	allowed: number | null
): boolean {
	const latest = attempts.at(-1);
	if (!latest || !isFinished(latest)) return false;
	return allowed == null || attempts.length < allowed;
}

/**
 * The attempt to show for an activity: the first one that made it complete, otherwise the
 * latest. `attempts` must be in attempt order.
 */
export function resultAttempt<A extends AttemptLike>(
	attempts: A[],
	criteria: CompletionCriteria
): A | null {
	return attempts.find((a) => isActivityComplete(a, criteria)) ?? attempts.at(-1) ?? null;
}

export type ActivityState = {
	complete: boolean;
	/** Titles of the prerequisites still to complete; empty when unlocked. */
	lockedBy: string[];
};

/** Completion and lock state for each activity, keyed by activity id. */
export function evaluateActivities(
	activities: ActivityRules[],
	attemptsFor: (activityId: string) => AttemptLike[]
): Map<string, ActivityState> {
	const complete = new Map(
		activities.map((a) => [a.id, attemptsFor(a.id).some((t) => isActivityComplete(t, a))])
	);
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

/** Describes a criteria setting for learners, e.g. "Score at least 80". */
export function describeCriteria(criteria: CompletionCriteria): string {
	if (criteria.completionRule === 'passed' && criteria.completionMinScore != null) {
		return `Score at least ${criteria.completionMinScore}`;
	}
	return { viewed: 'Open it', completed: 'Complete it', passed: 'Pass it' }[
		criteria.completionRule
	];
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
