import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql
} from 'drizzle-orm';
import type { NewNotification } from '../notifications.js';
import { db } from './index.js';
import { notification, notificationPreference, user } from './schema.js';

/** Inserts notifications, skipping ones whose dedupe key the user already has. */
export async function createNotifications(items: NewNotification[]) {
	const rows = await db
		.insert(notification)
		.values(items)
		.onConflictDoNothing()
		.returning({ id: notification.id });
	return rows.length;
}

export async function listNotifications(userId: string, limit = 50) {
	return db
		.select({
			id: notification.id,
			type: notification.type,
			title: notification.title,
			body: notification.body,
			link: notification.link,
			readAt: notification.readAt,
			createdAt: notification.createdAt
		})
		.from(notification)
		.where(eq(notification.userId, userId))
		.orderBy(desc(notification.createdAt))
		.limit(limit);
}

export async function unreadCount(userId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(notification)
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
	return row?.n ?? 0;
}

/** Marks one of the user's notifications read and returns its link (null if not theirs). */
export async function markRead(userId: string, id: string) {
	const [row] = await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.id, id), eq(notification.userId, userId)))
		.returning({ link: notification.link });
	return row ?? null;
}

export async function markAllRead(userId: string) {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

/** Deletes read notifications older than the cutoff. Returns how many were removed. */
export async function pruneReadNotifications(before: Date) {
	const rows = await db
		.delete(notification)
		.where(and(isNotNull(notification.readAt), lt(notification.readAt, before)))
		.returning({ id: notification.id });
	return rows.length;
}

/**
 * Notifications waiting to be emailed (and due, if retrying), oldest first, with the
 * recipient and whether they turned email off for that type.
 */
export async function pendingEmails(now: Date, limit: number) {
	return db
		.select({
			id: notification.id,
			type: notification.type,
			title: notification.title,
			body: notification.body,
			link: notification.link,
			attempts: notification.emailAttempts,
			email: user.email,
			name: user.name,
			banned: user.banned,
			emailOn: notificationPreference.email
		})
		.from(notification)
		.innerJoin(user, eq(user.id, notification.userId))
		.leftJoin(
			notificationPreference,
			and(
				eq(notificationPreference.userId, notification.userId),
				eq(notificationPreference.type, notification.type)
			)
		)
		.where(
			and(
				isNull(notification.emailStatus),
				or(isNull(notification.emailRetryAt), lte(notification.emailRetryAt, now))
			)
		)
		.orderBy(asc(notification.createdAt))
		.limit(limit);
}

export async function markEmailSent(id: string, at: Date) {
	await db
		.update(notification)
		.set({
			emailStatus: 'sent',
			emailedAt: at,
			emailAttempts: sql`${notification.emailAttempts} + 1`,
			emailError: null
		})
		.where(eq(notification.id, id));
}

export async function markEmailSkipped(ids: string[]) {
	if (ids.length === 0) return;
	await db
		.update(notification)
		.set({ emailStatus: 'skipped' })
		.where(inArray(notification.id, ids));
}

/** Records a failed send: retry at `retryAt`, or mark failed when it's null. */
export async function markEmailFailed(
	id: string,
	attempts: number,
	retryAt: Date | null,
	error: string
) {
	await db
		.update(notification)
		.set({
			emailAttempts: attempts,
			emailRetryAt: retryAt,
			emailStatus: retryAt ? null : 'failed',
			emailError: error.slice(0, 500)
		})
		.where(eq(notification.id, id));
}

/** The types this person turned email off for (everything else is on). */
export async function emailOptOuts(userId: string) {
	const rows = await db
		.select({ type: notificationPreference.type })
		.from(notificationPreference)
		.where(and(eq(notificationPreference.userId, userId), eq(notificationPreference.email, false)));
	return new Set(rows.map((r) => r.type));
}

export async function setEmailPreferences(
	userId: string,
	choices: { type: string; email: boolean }[]
) {
	if (choices.length === 0) return;
	await db
		.insert(notificationPreference)
		.values(choices.map((c) => ({ userId, ...c })))
		.onConflictDoUpdate({
			target: [notificationPreference.userId, notificationPreference.type],
			set: { email: sql`excluded.email`, updatedAt: new Date() }
		});
}
