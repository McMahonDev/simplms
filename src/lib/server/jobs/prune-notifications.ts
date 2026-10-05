import { pruneReadNotifications } from '../db/notifications.js';
import type { Job } from './types.js';

const KEEP_DAYS = 90;

export const pruneNotifications: Job = {
	name: 'prune-notifications',
	description: `Deletes notifications that were read more than ${KEEP_DAYS} days ago.`,
	everyMinutes: 60 * 24,
	async run(now) {
		const removed = await pruneReadNotifications(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
		return `${removed} removed`;
	}
};
