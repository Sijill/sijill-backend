export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatRequest {
	messages: ChatMessage[];
	temperature?: number;
}

export interface ChatResponse {
	content: string;
	model: string;
}

export interface AiProvider {
	chat(request: ChatRequest): Promise<ChatResponse>;
}
