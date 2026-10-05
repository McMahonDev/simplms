/**
 * The configured mail transport (MAIL_TRANSPORT). Add a provider by implementing `Mailer` and
 * adding a case here.
 */
import { MAIL_FROM, MAIL_TRANSPORT, RESEND_API_KEY } from '$app/env/private';
import { createLogMailer } from './log.js';
import { createResendMailer } from './resend.js';
import type { Mailer } from './types.js';

let mailer: Mailer | undefined;

export function getMailer(): Mailer {
	if (mailer) return mailer;
	switch (MAIL_TRANSPORT) {
		case 'resend':
			if (!RESEND_API_KEY) throw new Error('MAIL_TRANSPORT=resend needs RESEND_API_KEY.');
			mailer = createResendMailer(RESEND_API_KEY, MAIL_FROM);
			break;
		case 'log':
			mailer = createLogMailer(MAIL_FROM);
			break;
	}
	return mailer;
}

export type { MailMessage, Mailer } from './types.js';
