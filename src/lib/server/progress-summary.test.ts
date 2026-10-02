import { describe, expect, it, vi } from 'vitest';
import type { AttemptSummary } from './db/progress.js';

// progress.ts imports the database client; only the pure isComplete helper is needed here.
vi.mock('./db/index.js', () => ({ db: {} }));
const { summarizeProgress } = await import('./progress-summary.js');

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

const packages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

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
});
