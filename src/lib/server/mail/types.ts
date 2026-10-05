export type MailMessage = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

/** Sends one email. Throws on failure; the caller decides whether to retry. */
export type Mailer = {
	name: string;
	send(message: MailMessage): Promise<void>;
};
