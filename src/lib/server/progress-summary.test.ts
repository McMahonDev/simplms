import { describe, expect, it } from 'vitest';
import type { ActivityRules } from './completion.js';
import type { AttemptSummary } from './db/progress.js';
import { summarizeProgress } from './progress-summary.js';

const attempt = (
	activityId: string,
	completionStatus: AttemptSummary['completionStatus'],
	successStatus: AttemptSummary['successStatus'] = 'unknown'
): AttemptSummary => ({
	activityId,
	userId: 'u',
	attemptNumber: 1,
	completionStatus,
	successStatus,
	scoreRaw: null,
	totalTime: 0,
	lastAccessedAt: null
});

const activity = (id: string, rules: Partial<ActivityRules> = {}): ActivityRules => ({
	id,
	title: id.toUpperCase(),
	completionRule: 'completed',
	completionMinScore: null,
	requires: [],
	...rules
});

const activities = [activity('a'), activity('b'), activity('c')];

describe('summarizeProgress', () => {
	it('handles courses with no activities', () => {
		expect(summarizeProgress([], new Map(), 'u')).toEqual({
			total: 0,
			completed: 0,
			percent: 0,
			nextActivityId: null,
			started: false
		});
	});

	it('counts completed and passed activities and finds the next one', () => {
		const attempts = new Map([
			['a:u', [attempt('a', 'incomplete', 'passed')]],
			['b:u', [attempt('b', 'incomplete')]]
		]);
		expect(summarizeProgress(activities, attempts, 'u')).toEqual({
			total: 3,
			completed: 1,
			percent: 33,
			nextActivityId: 'b',
			started: true
		});
	});

	it('reports 100% with no next activity when everything is done', () => {
		const attempts = new Map(activities.map((p) => [`${p.id}:u`, [attempt(p.id, 'completed')]]));
		const result = summarizeProgress(activities, attempts, 'u');
		expect(result.percent).toBe(100);
		expect(result.nextActivityId).toBeNull();
	});

	it("applies each activity's own rule", () => {
		const strict = [activity('a', { completionRule: 'passed' }), activity('b')];
		const attempts = new Map([
			['a:u', [attempt('a', 'completed', 'failed')]],
			['b:u', [attempt('b', 'completed')]]
		]);
		const result = summarizeProgress(strict, attempts, 'u');
		expect(result.completed).toBe(1);
		expect(result.nextActivityId).toBe('a');
	});

	it('skips locked activities when choosing the next one', () => {
		// a needs a pass; b is locked behind a; c is free.
		const gated = [
			activity('a', { completionRule: 'passed' }),
			activity('b', { requires: ['a'] }),
			activity('c')
		];
		const failed = new Map([['a:u', [attempt('a', 'completed', 'failed')]]]);
		expect(summarizeProgress(gated, failed, 'u').nextActivityId).toBe('a');

		// With a done-but-not-passed a moved last, b is still locked, so c is next.
		const reordered = [gated[1]!, gated[2]!, gated[0]!];
		expect(summarizeProgress(reordered, failed, 'u').nextActivityId).toBe('c');
	});
});
