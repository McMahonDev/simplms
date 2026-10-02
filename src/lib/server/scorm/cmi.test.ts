import { describe, expect, it } from 'vitest';
import {
	buildLaunchCmi,
	formatIso8601Duration,
	formatScorm12Time,
	mapLessonStatus,
	normalizeCommit,
	parseIso8601Duration,
	parseScorm12Time
} from './cmi.js';

describe('time formats', () => {
	it('parses SCORM 1.2 CMITimespan', () => {
		expect(parseScorm12Time('0000:00:05')).toBe(5);
		expect(parseScorm12Time('01:02:03.5')).toBe(3723.5);
		expect(parseScorm12Time('0010:00:00.25')).toBe(36000.25);
		expect(parseScorm12Time('nonsense')).toBeNull();
	});

	it('parses SCORM 2004 ISO 8601 durations', () => {
		expect(parseIso8601Duration('PT5S')).toBe(5);
		expect(parseIso8601Duration('PT1H2M3.5S')).toBe(3723.5);
		expect(parseIso8601Duration('P1DT1M')).toBe(86460);
		expect(parseIso8601Duration('PT0H0M0S')).toBe(0);
		expect(parseIso8601Duration('P')).toBeNull();
		expect(parseIso8601Duration('PT')).toBeNull();
		expect(parseIso8601Duration('5 seconds')).toBeNull();
	});

	it('formats seconds for each version', () => {
		expect(formatScorm12Time(3725.5)).toBe('0001:02:05.50');
		expect(formatScorm12Time(0)).toBe('0000:00:00.00');
		expect(formatIso8601Duration(3725.5)).toBe('PT1H2M5.5S');
		expect(formatIso8601Duration(0)).toBe('PT0H0M0S');
	});

	it('round-trips', () => {
		for (const s of [0, 1.25, 59.99, 3600, 98765.43]) {
			expect(parseScorm12Time(formatScorm12Time(s))).toBeCloseTo(s, 2);
			expect(parseIso8601Duration(formatIso8601Duration(s))).toBeCloseTo(s, 2);
		}
	});
});

describe('mapLessonStatus (SCORM 1.2 -> 2004 fields)', () => {
	it.each([
		['passed', 'completed', 'passed'],
		['failed', 'completed', 'failed'],
		['completed', 'completed', 'unknown'],
		['incomplete', 'incomplete', 'unknown'],
		['browsed', 'incomplete', 'unknown'],
		['not attempted', 'not attempted', 'unknown'],
		['', 'unknown', 'unknown']
	])('%j -> %s / %s', (status, completion, success) => {
		expect(mapLessonStatus(status)).toEqual({
			completionStatus: completion,
			successStatus: success
		});
	});
});

describe('normalizeCommit', () => {
	it('reads SCORM 1.2 commits', () => {
		expect(
			normalizeCommit('1.2', {
				core: {
					lesson_status: 'passed',
					score: { raw: '85', min: '0', max: '100' },
					session_time: '0000:01:30.00'
				}
			})
		).toEqual({
			completionStatus: 'completed',
			successStatus: 'passed',
			scoreRaw: 85,
			sessionSeconds: 90
		});
	});

	it('reads SCORM 2004 commits', () => {
		expect(
			normalizeCommit('2004', {
				completion_status: 'incomplete',
				success_status: 'unknown',
				score: { raw: '' },
				session_time: 'PT45S'
			})
		).toEqual({
			completionStatus: 'incomplete',
			successStatus: 'unknown',
			scoreRaw: null,
			sessionSeconds: 45
		});
	});

	it('treats invalid 2004 values as unknown', () => {
		const n = normalizeCommit('2004', { completion_status: 'done', success_status: 'yes' });
		expect(n.completionStatus).toBe('unknown');
		expect(n.successStatus).toBe('unknown');
		expect(n.sessionSeconds).toBeNull();
	});
});

describe('buildLaunchCmi', () => {
	const learner = { id: 'u1', name: 'Sam Student' };

	it('starts a first SCORM 1.2 launch ab-initio', () => {
		const { cmi } = buildLaunchCmi('1.2', {}, 0, learner);
		expect(cmi.core).toMatchObject({
			entry: 'ab-initio',
			student_id: 'u1',
			student_name: 'Sam Student',
			total_time: '0000:00:00.00'
		});
	});

	it('resumes a suspended SCORM 1.2 session with its bookmark', () => {
		const stored = {
			core: {
				_children: 'student_id,student_name',
				lesson_location: '4',
				lesson_status: 'incomplete',
				exit: 'suspend',
				session_time: '0000:02:00',
				total_time: '0000:00:00'
			},
			suspend_data: 'page=4',
			interactions: { _count: 0 }
		};
		const { cmi } = buildLaunchCmi('1.2', stored, 120, learner);
		expect(cmi.core).toEqual({
			lesson_location: '4',
			lesson_status: 'incomplete',
			student_id: 'u1',
			student_name: 'Sam Student',
			entry: 'resume',
			total_time: '0000:02:00.00'
		});
		expect(cmi.suspend_data).toBe('page=4');
		expect(cmi.interactions).toBeUndefined();
	});

	it('does not mark a normal exit as a resume', () => {
		const { cmi } = buildLaunchCmi(
			'1.2',
			{ core: { exit: '', lesson_location: '2' } },
			10,
			learner
		);
		expect((cmi.core as Record<string, unknown>).entry).toBe('');
	});

	it('resumes a suspended SCORM 2004 session', () => {
		const { cmi } = buildLaunchCmi(
			'2004',
			{ location: '3', exit: 'suspend', session_time: 'PT1M', completion_status: 'incomplete' },
			61,
			learner
		);
		expect(cmi).toEqual({
			location: '3',
			completion_status: 'incomplete',
			learner_id: 'u1',
			learner_name: 'Sam Student',
			entry: 'resume',
			total_time: 'PT0H1M1S'
		});
	});
});
