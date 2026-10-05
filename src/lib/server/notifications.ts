/**
 * Notifications: one typed builder per kind of message, plus `notify()` to store them.
 *
 * They're shown in the app (the header link and /notifications) and emailed by the
 * deliver-email job, unless the person turned email off for that type. Another channel (push,
 * chat) would be another delivery job with its own sent state; call sites stay the same.
 */
import { createNotifications } from './db/notifications.js';

export type NotificationType = 'enrollment.added' | 'attempt.granted' | 'course.reminder';

/** Every type, with the wording people see on their notification settings page. */
export const notificationTypes: { type: NotificationType; label: string; description: string }[] = [
	{
		type: 'enrollment.added',
		label: 'Added to a course',
		description: 'A teacher or admin enrolled you in a course.'
	},
	{
		type: 'attempt.granted',
		label: 'Extra attempt',
		description: 'A teacher gave you another attempt at an activity.'
	},
	{
		type: 'course.reminder',
		label: 'Course reminders',
		description: "A weekly nudge about a course you haven't finished."
	}
];

export type NewNotification = {
	userId: string;
	type: NotificationType;
	title: string;
	body?: string;
	/** Same-origin path, e.g. /courses/golf-fundamentals. */
	link?: string;
	/** When set, a second notification with the same key for the same user is skipped. */
	dedupeKey?: string;
};

type CourseRef = { title: string; slug: string };

export const messages = {
	enrolled(userId: string, course: CourseRef, role: 'teacher' | 'student'): NewNotification {
		return {
			userId,
			type: 'enrollment.added',
			title: `You were added to ${course.title}`,
			body:
				role === 'teacher' ? 'You can now teach this course.' : 'Open the course to get started.',
			link: `/courses/${course.slug}`
		};
	},

	attemptGranted(userId: string, course: CourseRef, activityTitle: string): NewNotification {
		return {
			userId,
			type: 'attempt.granted',
			title: `You have another attempt at ${activityTitle}`,
			body: `Your teacher gave you an extra attempt in ${course.title}.`,
			link: `/courses/${course.slug}`
		};
	},

	/** `period` keeps it to one reminder per course per period, e.g. an ISO week "2026-W41". */
	courseReminder(userId: string, course: CourseRef & { id: string }, period: string) {
		return {
			userId,
			type: 'course.reminder',
			title: `Pick up where you left off in ${course.title}`,
			body: "You haven't opened this course in a while. You still have activities to finish.",
			link: `/courses/${course.slug}`,
			dedupeKey: `course.reminder:${course.id}:${period}`
		} satisfies NewNotification;
	}
};

/**
 * Stores notifications. Never throws for a duplicate dedupe key; returns how many were new.
 * A failure to notify shouldn't fail the action that caused it, so callers may ignore errors.
 */
export async function notify(items: NewNotification | NewNotification[]): Promise<number> {
	const list = Array.isArray(items) ? items : [items];
	if (list.length === 0) return 0;
	return createNotifications(list);
}
