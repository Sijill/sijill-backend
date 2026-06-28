import { PinoLogger } from 'nestjs-pino';
import type {
	AiProvider,
	ChatRequest,
	ChatResponse,
	ChatMessage,
} from '../interfaces/ai-provider.interface';

interface GeminiContent {
	role?: string;
	parts: Array<{ text: string }>;
}

interface GeminiResponse {
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
	}>;
}

export class GeminiChatProvider implements AiProvider {
	private readonly logger: PinoLogger;

	constructor() {
		this.logger = new PinoLogger({});
		this.logger.setContext(GeminiChatProvider.name);
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const apiKey = process.env.GEMINI_API_KEY;
		const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is not configured.');
		}

		const { systemMessage, contents } = this.splitMessages(request.messages);

		const body: Record<string, unknown> = {
			contents,
			generationConfig: {
				temperature: request.temperature ?? 0.2,
			},
		};

		if (systemMessage) {
			body.systemInstruction = {
				parts: [{ text: systemMessage }],
			};
		}

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(60000),
				body: JSON.stringify(body),
			},
		);

		if (!response.ok) {
			const errorBody = await response.text();
			this.logger.warn(
				{ status: response.status, body: errorBody },
				'Gemini chat request failed.',
			);
			throw new Error(
				`Gemini returned status ${response.status}: ${errorBody}`,
			);
		}

		const payload = (await response.json()) as GeminiResponse;
		const rawText = payload.candidates?.[0]?.content?.parts
			?.map((p) => p.text || '')
			.join('')
			.trim();

		if (!rawText) {
			this.logger.warn({ payload }, 'Gemini returned empty response.');
			throw new Error('Gemini returned an empty response.');
		}

		return {
			content: rawText,
			model,
		};
	}

	private splitMessages(messages: ChatMessage[]): {
		systemMessage: string | null;
		contents: GeminiContent[];
	} {
		let systemMessage: string | null = null;
		const contents: GeminiContent[] = [];

		for (const msg of messages) {
			if (msg.role === 'system') {
				systemMessage =
					(systemMessage ? systemMessage + '\n' : '') + msg.content;
			} else {
				contents.push({
					role: msg.role === 'assistant' ? 'model' : msg.role,
					parts: [{ text: msg.content }],
				});
			}
		}

		return { systemMessage, contents };
	}
}
