import { describe, expect, it, vi } from 'vitest';
import type { CourseProgress } from '../progress-summary.js';

// The job module imports database queries; only its pure helpers are tested here.
vi.mock('../db/index.js', () => ({ db: {} }));
const { isoWeek, needsReminder } = await import('./course-reminders.js');

const progress = (p: Partial<CourseProgress>): CourseProgress => ({
	total: 3,
	completed: 1,
	percent: 33,
	nextActivityId: 'b',
	started: true,
	...p
});

const now = new Date('2026-10-05T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('needsReminder', () => {
	it('reminds after a week idle with work left', () => {
		expect(needsReminder(progress({}), daysAgo(7), now)).toBe(true);
		expect(needsReminder(progress({}), daysAgo(6), now)).toBe(false);
	});

	it('skips finished courses, empty courses, and courses where everything left is locked', () => {
		expect(needsReminder(progress({ completed: 3, nextActivityId: null }), daysAgo(30), now)).toBe(
			false
		);
		expect(needsReminder(progress({ total: 0, completed: 0 }), daysAgo(30), now)).toBe(false);
		expect(needsReminder(progress({ nextActivityId: null }), daysAgo(30), now)).toBe(false);
	});
});

describe('isoWeek', () => {
	it('numbers weeks the ISO way, including across the year boundary', () => {
		expect(isoWeek(new Date('2026-10-05T00:00:00Z'))).toBe('2026-W41');
		expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
		expect(isoWeek(new Date('2024-12-30T00:00:00Z'))).toBe('2025-W01');
	});
});
