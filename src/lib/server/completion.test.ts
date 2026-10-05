import { describe, expect, it } from 'vitest';
import {
	type ActivityRules,
	describeCriteria,
	evaluateActivities,
	findCycle,
	isActivityComplete
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

	it('passed: completed alone or failed does not count', () => {
		expect(isActivityComplete(attempt('completed'), rule('passed'))).toBe(false);
		expect(isActivityComplete(attempt('completed', 'failed'), rule('passed'))).toBe(false);
		expect(isActivityComplete(attempt('completed', 'passed'), rule('passed'))).toBe(true);
	});

	it('minimum score must also be met, and a missing score never meets it', () => {
		const strict = rule('completed', 80);
		expect(isActivityComplete(attempt('completed', 'unknown', 80), strict)).toBe(true);
		expect(isActivityComplete(attempt('completed', 'unknown', 79.5), strict)).toBe(false);
		expect(isActivityComplete(attempt('completed', 'passed', null), strict)).toBe(false);
		expect(isActivityComplete(attempt('incomplete', 'unknown', 95), strict)).toBe(false);
		expect(isActivityComplete(attempt('incomplete', 'unknown', 95), rule('viewed', 90))).toBe(true);
	});
});

describe('evaluateActivities', () => {
	const activities: ActivityRules[] = [
		{ id: 'a', title: 'Intro', ...rule('completed'), requires: [] },
		{ id: 'b', title: 'Quiz', ...rule('passed', 70), requires: ['a'] },
		{ id: 'c', title: 'Final', ...rule('completed'), requires: ['a', 'b'] }
	];

	it('locks activities until their prerequisites are complete', () => {
		const states = evaluateActivities(activities, () => null);
		expect(states.get('a')).toEqual({ complete: false, lockedBy: [] });
		expect(states.get('b')).toEqual({ complete: false, lockedBy: ['Intro'] });
		expect(states.get('c')).toEqual({ complete: false, lockedBy: ['Intro', 'Quiz'] });
	});

	it('unlocks as prerequisites meet their own rules', () => {
		const attempts: Record<string, ReturnType<typeof attempt>> = {
			a: attempt('completed'),
			b: attempt('completed', 'passed', 60)
		};
		const states = evaluateActivities(activities, (id) => attempts[id]);
		expect(states.get('b')).toEqual({ complete: false, lockedBy: [] });
		// The quiz was passed but under the minimum score, so Final stays locked.
		expect(states.get('c')!.lockedBy).toEqual(['Quiz']);
	});

	it('ignores prerequisites that are not in the list', () => {
		const states = evaluateActivities(
			[{ id: 'x', title: 'X', ...rule('viewed'), requires: ['gone'] }],
			() => null
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
		expect(describeCriteria(rule('passed', 80))).toBe('Pass it with a score of at least 80');
	});
});
