import { and, count, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { NewNotification } from '../notifications.js';
import { db } from './index.js';
import { notification } from './schema.js';

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
