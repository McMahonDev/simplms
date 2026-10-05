import type { Mailer } from './types.js';

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendMailer(apiKey: string, from: string): Mailer {
	return {
		name: 'resend',
		async send(message) {
			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					from,
					to: [message.to],
					subject: message.subject,
					text: message.text,
					html: message.html
				}),
				signal: AbortSignal.timeout(15_000)
			});
			if (!response.ok) {
				const detail = (await response.text()).slice(0, 300);
				throw new Error(`Resend responded ${response.status}: ${detail}`);
			}
		}
	};
}
