import type { Mailer } from './types.js';

/** Development transport: prints the email instead of sending it. */
export function createLogMailer(from: string): Mailer {
	return {
		name: 'log',
		async send(message) {
			console.log(
				`[mail] From: ${from}\n[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n` +
					message.text
						.split('\n')
						.map((line) => `[mail] ${line}`)
						.join('\n')
			);
		}
	};
}
