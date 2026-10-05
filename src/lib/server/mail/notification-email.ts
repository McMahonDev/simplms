/**
 * Turns a notification into an email, and decides when a failed send is retried.
 * Pure functions, unit-tested in notification-email.test.ts.
 */
import type { MailMessage } from './types.js';

export type EmailNotification = {
	title: string;
	body: string;
	/** Same-origin path, made absolute with the site origin. */
	link: string | null;
};

const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);

export function renderNotificationEmail(
	notification: EmailNotification,
	recipient: { email: string; name: string },
	origin: string
): MailMessage {
	const link = notification.link ? new URL(notification.link, origin).href : null;
	const settings = new URL('/notifications/settings', origin).href;
	const greeting = `Hi ${recipient.name},`;

	const text = [
		greeting,
		'',
		notification.title,
		...(notification.body ? ['', notification.body] : []),
		...(link ? ['', `Open: ${link}`] : []),
		'',
		'--',
		`You can turn these emails off at ${settings}`
	].join('\n');

	const html = `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1d1d1b">
<p>${escapeHtml(greeting)}</p>
<p><strong>${escapeHtml(notification.title)}</strong></p>
${notification.body ? `<p>${escapeHtml(notification.body)}</p>` : ''}
${link ? `<p><a href="${escapeHtml(link)}">Open in SimpLMS</a></p>` : ''}
<hr style="border: 0; border-top: 1px solid #dcdcd6">
<p style="font-size: 12px; color: #5d5d58">You can <a href="${escapeHtml(settings)}">turn these emails off</a>.</p>
</body></html>`;

	return { to: recipient.email, subject: notification.title, text, html };
}

/** Sends are tried this many times before the notification is marked failed. */
export const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_MINUTES = [1, 5, 30, 120];

/**
 * After a failed send: when to try again, or null to give up. `attempts` counts this failure.
 */
export function nextEmailRetry(attempts: number, now: Date): Date | null {
	if (attempts >= MAX_EMAIL_ATTEMPTS) return null;
	const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length) - 1] ?? 1;
	return new Date(now.getTime() + minutes * 60_000);
}
