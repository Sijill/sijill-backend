import { Module } from '@nestjs/common';
import { PatientAIController } from './patient-ai.controller';
import { PatientAIService } from './patient-ai.service';
import { PatientAIRepository } from './patient-ai.repository';
import { PatientAIChatService } from './patient-ai-chat.service';
import { OllamaChatProvider } from './providers/ollama-chat.provider';
import { GeminiChatProvider } from './providers/gemini-chat.provider';
import type { AiProvider } from './interfaces/ai-provider.interface';

function createAiProvider(): AiProvider {
	const provider = process.env.AI_PROVIDER || 'ollama';

	if (provider === 'gemini') {
		return new GeminiChatProvider();
	}

	return new OllamaChatProvider();
}

@Module({
	controllers: [PatientAIController],
	providers: [
		PatientAIService,
		PatientAIChatService,
		PatientAIRepository,
		{
			provide: 'AI_PROVIDER',
			useFactory: createAiProvider,
		},
	],
})
export class PatientAIModule {}
