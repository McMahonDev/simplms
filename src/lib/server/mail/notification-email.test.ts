import { describe, expect, it } from 'vitest';
import {
	MAX_EMAIL_ATTEMPTS,
	nextEmailRetry,
	renderNotificationEmail
} from './notification-email.js';

const recipient = { email: 'sam@example.com', name: 'Sam' };
const origin = 'https://lms.example.com';

describe('renderNotificationEmail', () => {
	it('builds subject, text, and html with an absolute link and a settings link', () => {
		const mail = renderNotificationEmail(
			{ title: 'You were added to Golf', body: 'Open the course.', link: '/courses/golf' },
			recipient,
			origin
		);
		expect(mail.to).toBe('sam@example.com');
		expect(mail.subject).toBe('You were added to Golf');
		expect(mail.text).toContain('Hi Sam,');
		expect(mail.text).toContain('Open: https://lms.example.com/courses/golf');
		expect(mail.text).toContain('https://lms.example.com/notifications/settings');
		expect(mail.html).toContain('href="https://lms.example.com/courses/golf"');
	});

	it('escapes HTML from titles, bodies, and names', () => {
		const mail = renderNotificationEmail(
			{ title: 'Quiz <b>1</b>', body: 'Tom & "Jerry"', link: null },
			{ email: 'x@example.com', name: '<script>' },
			origin
		);
		expect(mail.html).toContain('Quiz &lt;b&gt;1&lt;/b&gt;');
		expect(mail.html).toContain('Tom &amp; &quot;Jerry&quot;');
		expect(mail.html).toContain('Hi &lt;script&gt;,');
		expect(mail.html).not.toContain('Open in SimpLMS');
		expect(mail.text).not.toContain('Open:');
	});
});

describe('nextEmailRetry', () => {
	const now = new Date('2026-10-05T12:00:00Z');
	const minutesLater = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 60_000 : null);

	it('backs off after each failure', () => {
		expect(minutesLater(nextEmailRetry(1, now))).toBe(1);
		expect(minutesLater(nextEmailRetry(2, now))).toBe(5);
		expect(minutesLater(nextEmailRetry(3, now))).toBe(30);
		expect(minutesLater(nextEmailRetry(4, now))).toBe(120);
	});

	it('gives up after the last attempt', () => {
		expect(nextEmailRetry(MAX_EMAIL_ATTEMPTS, now)).toBeNull();
	});
});
