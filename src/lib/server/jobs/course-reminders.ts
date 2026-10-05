/**
 * Reminds learners about courses they've left unfinished: at most once per course per ISO week,
 * once they haven't opened any of its activities for IDLE_DAYS (or since enrolling).
 */
import { activeStudentEnrollments } from '../db/enrollments.js';
import { attemptHistory, activitiesForCourses } from '../db/progress.js';
import { messages, notify } from '../notifications.js';
import { type CourseProgress, summarizeProgress } from '../progress-summary.js';
import type { Job } from './types.js';

export const IDLE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 8601 week, e.g. "2026-W41", so the reminder repeats at most weekly. */
export function isoWeek(date: Date): string {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the year.
	const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * A learner needs a reminder when the course has something left they can do now and they've
 * been idle for IDLE_DAYS, counting from their last activity or, if none, from enrolling.
 */
export function needsReminder(
	progress: CourseProgress,
	lastActivity: Date,
	now: Date,
	idleDays = IDLE_DAYS
): boolean {
	if (progress.total === 0 || progress.completed === progress.total) return false;
	if (!progress.nextActivityId) return false; // Everything left is locked.
	return now.getTime() - lastActivity.getTime() >= idleDays * DAY_MS;
}

export const courseReminders: Job = {
	name: 'course-reminders',
	description: `Reminds learners about unfinished courses they haven't opened in ${IDLE_DAYS} days (weekly at most).`,
	everyMinutes: 60 * 24,
	async run(now) {
		const enrollments = await activeStudentEnrollments();
		const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
		const activities = await activitiesForCourses(courseIds);
		const history = await attemptHistory(
			activities.map((p) => p.id),
			[...new Set(enrollments.map((e) => e.userId))]
		);

		const due = enrollments.filter((e) => {
			const courseActivities = activities.filter((p) => p.courseId === e.courseId);
			const accesses = courseActivities
				.flatMap((p) => history.get(`${p.id}:${e.userId}`) ?? [])
				.map((a) => a.lastAccessedAt?.getTime() ?? 0);
			const last = new Date(Math.max(e.enrolledAt.getTime(), ...accesses));
			return needsReminder(summarizeProgress(courseActivities, history, e.userId), last, now);
		});

		const week = isoWeek(now);
		const sent = await notify(
			due.map((e) =>
				messages.courseReminder(e.userId, { id: e.courseId, title: e.title, slug: e.slug }, week)
			)
		);
		return `${due.length} idle learner-course pairs, ${sent} new reminders`;
	}
};
