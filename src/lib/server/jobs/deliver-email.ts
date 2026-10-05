/**
 * Emails pending notifications. Each one is sent at most once: it's marked sent, skipped (the
 * person turned that type off, or is banned), or retried with backoff and finally marked failed.
 */
import { BETTER_AUTH_URL } from '$app/env/private';
import {
	markEmailFailed,
	markEmailSent,
	markEmailSkipped,
	pendingEmails
} from '../db/notifications.js';
import { getMailer } from '../mail/index.js';
import { nextEmailRetry, renderNotificationEmail } from '../mail/notification-email.js';
import type { Job } from './types.js';

const BATCH = 100;

export const deliverEmail: Job = {
	name: 'deliver-email',
	description: 'Emails new notifications to people who have email turned on for that type.',
	everyMinutes: 1,
	async run(now) {
		const pending = await pendingEmails(now, BATCH);
		const skip = pending.filter((n) => n.emailOn === false || n.banned);
		await markEmailSkipped(skip.map((n) => n.id));

		const mailer = getMailer();
		let sent = 0;
		let failed = 0;
		for (const n of pending.filter((p) => !skip.includes(p))) {
			try {
				await mailer.send(renderNotificationEmail(n, n, BETTER_AUTH_URL));
				await markEmailSent(n.id, new Date());
				sent += 1;
			} catch (err) {
				const attempts = n.attempts + 1;
				const message = err instanceof Error ? err.message : String(err);
				await markEmailFailed(n.id, attempts, nextEmailRetry(attempts, new Date()), message);
				failed += 1;
			}
		}
		return `${sent} sent, ${skip.length} skipped, ${failed} failed (via ${mailer.name})`;
	}
};
