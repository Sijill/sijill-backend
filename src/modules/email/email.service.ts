import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

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
	private transporter: Transporter;

	constructor() {
		this.transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST || 'mailpit',
			port: parseInt(process.env.SMTP_PORT || '1025'),
			secure: false,
		});
	}

	async send(payload: EmailPayload): Promise<void> {
		if (!payload.text && !payload.html) {
			throw new Error('Email payload must include text or html');
		}

		await this.sendViaSMTP(payload);
	}

	private async sendViaSMTP(payload: EmailPayload): Promise<void> {
		const fromEmail = process.env.SMTP_FROM_EMAIL;
		const fromName = process.env.SMTP_FROM_NAME;

		if (!payload.from?.email && !fromEmail) {
			throw new Error('SMTP_FROM_EMAIL is not set and no from.email provided');
		}

		const from: EmailAddress = payload.from?.email
			? payload.from
			: {
					email: fromEmail as string,
					name: fromName,
				};

		const formatAddress = (addr: EmailAddress) => {
			return addr.name ? `"${addr.name}" <${addr.email}>` : addr.email;
		};

		const to = Array.isArray(payload.to)
			? payload.to.map(formatAddress)
			: formatAddress(payload.to);

		try {
			await this.transporter.sendMail({
				from: formatAddress(from),
				to,
				subject: payload.subject,
				text: payload.text,
				html: payload.html,
				headers: payload.category
					? { 'X-Category': payload.category }
					: undefined,
			});
		} catch (error) {
			throw new Error(`SMTP send failed: ${error.message}`);
		}
	}
}
