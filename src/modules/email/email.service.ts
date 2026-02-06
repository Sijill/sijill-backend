import { Injectable } from '@nestjs/common';

export type EmailAddress = {
	email: string;
	name?: string;
};

export type EmailPayload = {
	to: EmailAddress | EmailAddress[];
	subject: string;
	text?: string;
	html?: string;
	from?: EmailAddress;
	category?: string;
};

@Injectable()
export class EmailService {
	async send(payload: EmailPayload): Promise<void> {
		if (!payload.text && !payload.html) {
			throw new Error('Email payload must include text or html');
		}

		const env = process.env.NODE_ENV;
		if (env === 'development') {
			await this.sendViaMailtrapSandbox(payload);
		} else if (env === 'production') {
			await this.sendViaMailtrap(payload);
		} else {
			throw new Error('Unsupported NODE_ENV: ${env}');
		}
	}

	private async sendViaMailtrapSandbox(payload: EmailPayload): Promise<void> {
		const token = process.env.MAILTRAP_TOKEN;
		const inboxId = process.env.MAILTRAP_INBOX_ID;
		const fromEmail = process.env.MAILTRAP_FROM_EMAIL;
		const fromName = process.env.MAILTRAP_FROM_NAME;

		if (!token) {
			throw new Error('MAILTRAP_TOKEN is not set');
		}
		if (!inboxId) {
			throw new Error('MAILTRAP_INBOX_ID is not set');
		}
		if (!payload.from?.email && !fromEmail) {
			throw new Error(
				'MAILTRAP_FROM_EMAIL is not set and no from.email provided',
			);
		}

		const from: EmailAddress = payload.from?.email
			? payload.from
			: {
					email: fromEmail as string,
					name: fromName,
				};

		const to = Array.isArray(payload.to) ? payload.to : [payload.to];

		const response = await fetch(
			`https://sandbox.api.mailtrap.io/api/send/${inboxId}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					from,
					to,
					subject: payload.subject,
					text: payload.text,
					html: payload.html,
					category: payload.category,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Mailtrap send failed: ${response.status} ${errorText}`);
		}
	}

	private async sendViaMailtrap(payload: EmailPayload): Promise<void> {}
}
