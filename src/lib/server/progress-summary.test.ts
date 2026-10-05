import { describe, expect, it } from 'vitest';
import type { ActivityRules } from './completion.js';
import type { AttemptSummary } from './db/progress.js';
import { summarizeProgress } from './progress-summary.js';

const attempt = (
	packageId: string,
	completionStatus: AttemptSummary['completionStatus'],
	successStatus: AttemptSummary['successStatus'] = 'unknown'
): AttemptSummary => ({
	packageId,
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

const packages = [activity('a'), activity('b'), activity('c')];

describe('summarizeProgress', () => {
	it('handles courses with no activities', () => {
		expect(summarizeProgress([], new Map(), 'u')).toEqual({
			total: 0,
			completed: 0,
			percent: 0,
			nextPackageId: null,
			started: false
		});
	});

	it('counts completed and passed activities and finds the next one', () => {
		const attempts = new Map([
			['a:u', attempt('a', 'incomplete', 'passed')],
			['b:u', attempt('b', 'incomplete')]
		]);
		expect(summarizeProgress(packages, attempts, 'u')).toEqual({
			total: 3,
			completed: 1,
			percent: 33,
			nextPackageId: 'b',
			started: true
		});
	});

	it('reports 100% with no next activity when everything is done', () => {
		const attempts = new Map(packages.map((p) => [`${p.id}:u`, attempt(p.id, 'completed')]));
		const result = summarizeProgress(packages, attempts, 'u');
		expect(result.percent).toBe(100);
		expect(result.nextPackageId).toBeNull();
	});

	it("applies each activity's own rule", () => {
		const strict = [activity('a', { completionRule: 'passed' }), activity('b')];
		const attempts = new Map([
			['a:u', attempt('a', 'completed', 'failed')],
			['b:u', attempt('b', 'completed')]
		]);
		const result = summarizeProgress(strict, attempts, 'u');
		expect(result.completed).toBe(1);
		expect(result.nextPackageId).toBe('a');
	});

	it('skips locked activities when choosing the next one', () => {
		// a needs a pass; b is locked behind a; c is free.
		const gated = [
			activity('a', { completionRule: 'passed' }),
			activity('b', { requires: ['a'] }),
			activity('c')
		];
		const failed = new Map([['a:u', attempt('a', 'completed', 'failed')]]);
		expect(summarizeProgress(gated, failed, 'u').nextPackageId).toBe('a');

		// With a done-but-not-passed a moved last, b is still locked, so c is next.
		const reordered = [gated[1]!, gated[2]!, gated[0]!];
		expect(summarizeProgress(reordered, failed, 'u').nextPackageId).toBe('c');
	});
});
