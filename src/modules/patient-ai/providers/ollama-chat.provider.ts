import { PinoLogger } from 'nestjs-pino';
import type {
	AiProvider,
	ChatRequest,
	ChatResponse,
} from '../interfaces/ai-provider.interface';

export class OllamaChatProvider implements AiProvider {
	private readonly logger: PinoLogger;

	constructor() {
		this.logger = new PinoLogger({});
		this.logger.setContext(OllamaChatProvider.name);
	}

	async chat(request: ChatRequest): Promise<ChatResponse> {
		const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
		const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';

		const response = await fetch(`${baseUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: AbortSignal.timeout(120000),
			body: JSON.stringify({
				model,
				messages: request.messages,
				stream: false,
				options: {
					temperature: request.temperature ?? 0.2,
				},
			}),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			this.logger.warn(
				{ status: response.status, body: errorBody },
				'Ollama chat request failed.',
			);
			throw new Error(
				`Ollama returned status ${response.status}: ${errorBody}`,
			);
		}

		const payload = (await response.json()) as {
			message?: { content?: string };
			model?: string;
		};

		const content = payload.message?.content?.trim();

		if (!content) {
			this.logger.warn({ payload }, 'Ollama returned empty response.');
			throw new Error('Ollama returned an empty response.');
		}

		return {
			content,
			model: payload.model || model,
		};
	}
}
