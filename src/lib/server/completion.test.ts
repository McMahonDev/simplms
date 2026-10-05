import { describe, expect, it } from 'vitest';
import {
	type ActivityRules,
	canStartNewAttempt,
	describeCriteria,
	evaluateActivities,
	findCycle,
	isActivityComplete,
	isFinished,
	resultAttempt,
	resultOf
} from './completion.js';
import type { CompletionStatus, SuccessStatus } from './db/schema.js';

const attempt = (
	completionStatus: CompletionStatus,
	successStatus: SuccessStatus = 'unknown',
	scoreRaw: number | null = null
) => ({ completionStatus, successStatus, scoreRaw });

const rule = (
	completionRule: ActivityRules['completionRule'],
	completionMinScore = null as number | null
) => ({ completionRule, completionMinScore });

describe('resultOf', () => {
	it("uses the package's own verdict when there is no passing score", () => {
		expect(resultOf(attempt('completed', 'failed', 60), rule('passed'))).toBe('failed');
		expect(resultOf(attempt('completed', 'passed'), rule('passed'))).toBe('passed');
		expect(resultOf(attempt('incomplete'), rule('passed'))).toBeNull();
	});

	it("lets the activity's passing score override the package's pass mark", () => {
		// The Golf quiz reports failed against its own mastery score, but 60 clears a 50.
		expect(resultOf(attempt('completed', 'failed', 60), rule('passed', 50))).toBe('passed');
		expect(resultOf(attempt('completed', 'passed', 40), rule('passed', 50))).toBe('failed');
		expect(resultOf(attempt('completed', 'passed', null), rule('passed', 50))).toBeNull();
	});
});

describe('isActivityComplete', () => {
	it('is never complete without an attempt', () => {
		for (const r of ['viewed', 'completed', 'passed'] as const) {
			expect(isActivityComplete(null, rule(r))).toBe(false);
		}
	});

	it('viewed: any attempt counts, even before the SCO reports anything', () => {
		expect(isActivityComplete(attempt('not attempted'), rule('viewed'))).toBe(true);
	});

	it('completed: completed or passed counts, incomplete does not', () => {
		expect(isActivityComplete(attempt('completed'), rule('completed'))).toBe(true);
		expect(isActivityComplete(attempt('incomplete', 'passed'), rule('completed'))).toBe(true);
		expect(isActivityComplete(attempt('incomplete'), rule('completed'))).toBe(false);
	});

	it('passed: needs a pass by the package, or by the passing score when set', () => {
		expect(isActivityComplete(attempt('completed'), rule('passed'))).toBe(false);
		expect(isActivityComplete(attempt('completed', 'failed'), rule('passed'))).toBe(false);
		expect(isActivityComplete(attempt('completed', 'passed'), rule('passed'))).toBe(true);
		expect(isActivityComplete(attempt('completed', 'failed', 50), rule('passed', 50))).toBe(true);
		expect(isActivityComplete(attempt('completed', 'passed', 49.5), rule('passed', 50))).toBe(
			false
		);
	});
});

describe('attempts', () => {
	it('an attempt is finished once completed, passed, or failed', () => {
		expect(isFinished(attempt('incomplete'))).toBe(false);
		expect(isFinished(attempt('not attempted'))).toBe(false);
		expect(isFinished(attempt('completed'))).toBe(true);
		expect(isFinished(attempt('incomplete', 'failed'))).toBe(true);
	});

	it('new attempts need a finished latest attempt and attempts left', () => {
		const failed = attempt('completed', 'failed');
		expect(canStartNewAttempt([], 3)).toBe(false);
		expect(canStartNewAttempt([attempt('incomplete')], 3)).toBe(false);
		expect(canStartNewAttempt([failed], 3)).toBe(true);
		expect(canStartNewAttempt([failed, failed, failed], 3)).toBe(false);
		expect(canStartNewAttempt([failed, failed, failed], null)).toBe(true);
		expect(canStartNewAttempt([failed, attempt('incomplete')], null)).toBe(false);
	});

	it('shows the first attempt that met the rule, otherwise the latest', () => {
		const passed = attempt('completed', 'unknown', 80);
		const later = attempt('completed', 'unknown', 20);
		expect(
			resultAttempt([attempt('completed', 'unknown', 10), passed, later], rule('passed', 50))
		).toBe(passed);
		expect(resultAttempt([passed, later], rule('passed', 90))).toBe(later);
		expect(resultAttempt([], rule('passed'))).toBeNull();
	});
});

describe('evaluateActivities', () => {
	const activities: ActivityRules[] = [
		{ id: 'a', title: 'Intro', ...rule('completed'), requires: [] },
		{ id: 'b', title: 'Quiz', ...rule('passed', 70), requires: ['a'] },
		{ id: 'c', title: 'Final', ...rule('completed'), requires: ['a', 'b'] }
	];

	it('locks activities until their prerequisites are complete', () => {
		const states = evaluateActivities(activities, () => []);
		expect(states.get('a')).toEqual({ complete: false, lockedBy: [] });
		expect(states.get('b')).toEqual({ complete: false, lockedBy: ['Intro'] });
		expect(states.get('c')).toEqual({ complete: false, lockedBy: ['Intro', 'Quiz'] });
	});

	it('unlocks as prerequisites meet their own rules, across attempts', () => {
		const attempts: Record<string, ReturnType<typeof attempt>[]> = {
			a: [attempt('completed')],
			b: [attempt('completed', 'passed', 60)]
		};
		const states = evaluateActivities(activities, (id) => attempts[id] ?? []);
		expect(states.get('b')).toEqual({ complete: false, lockedBy: [] });
		// The package said passed, but 60 is under the quiz's passing score of 70.
		expect(states.get('c')!.lockedBy).toEqual(['Quiz']);

		// A second attempt that clears 70 completes the quiz, even if a later one does worse.
		attempts.b!.push(attempt('completed', 'failed', 75), attempt('incomplete', 'unknown', 10));
		expect(evaluateActivities(activities, (id) => attempts[id] ?? []).get('c')!.lockedBy).toEqual(
			[]
		);
	});

	it('ignores prerequisites that are not in the list', () => {
		const states = evaluateActivities(
			[{ id: 'x', title: 'X', ...rule('viewed'), requires: ['gone'] }],
			() => []
		);
		expect(states.get('x')!.lockedBy).toEqual([]);
	});
});

describe('findCycle', () => {
	const graph = [
		{ id: 'a', requires: [] },
		{ id: 'b', requires: ['a'] },
		{ id: 'c', requires: ['b'] }
	];

	it('allows acyclic requirements', () => {
		expect(findCycle(graph, 'c', ['a', 'b'])).toBeNull();
		expect(findCycle(graph, 'a', [])).toBeNull();
	});

	it('rejects an activity requiring itself, directly or through others', () => {
		expect(findCycle(graph, 'a', ['a'])).toBe('a');
		expect(findCycle(graph, 'a', ['c'])).toBe('a');
	});
});

describe('describeCriteria', () => {
	it('reads naturally', () => {
		expect(describeCriteria(rule('viewed'))).toBe('Open it');
		expect(describeCriteria(rule('passed'))).toBe('Pass it');
		expect(describeCriteria(rule('passed', 80))).toBe('Score at least 80');
	});
});
