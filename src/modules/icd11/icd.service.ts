import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

interface IcdDestinationEntity {
	theCode?: string;
	title?: string;
}

interface IcdSearchResponse {
	destinationEntities?: IcdDestinationEntity[];
}

export interface IcdSearchResult {
	code: string;
	title: string;
}

class IcdUpstreamError extends Error {
	constructor(
		readonly statusCode: number,
		readonly responseBody?: string,
	) {
		super(`ICD search failed with status ${statusCode}.`);
		this.name = IcdUpstreamError.name;
	}
}

@Injectable()
export class IcdService {
	private static readonly MAX_ATTEMPTS = 3;
	private static readonly RETRY_DELAY_MS = 300;

	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(IcdService.name);
	}

	async searchDiagnoses(query: string): Promise<IcdSearchResult[]> {
		const baseUrl = process.env.ICD_API_URL ?? 'http://localhost:8081';
		const url = new URL('/icd/release/11/2026-01/mms/search', baseUrl);

		url.searchParams.set('q', query);
		url.searchParams.set('highlightingEnabled', 'false');
		url.searchParams.set('medicalCodingMode', 'true');

		let lastError: unknown;

		for (
			let attempt = 1;
			attempt <= IcdService.MAX_ATTEMPTS;
			attempt += 1
		) {
			try {
				const response = await fetch(url, {
					headers: {
						'API-Version': 'v2',
						'Accept-Language': 'en',
						Accept: 'application/json',
					},
				});

				if (!response.ok) {
					throw new IcdUpstreamError(
						response.status,
						(await response.text()).slice(0, 500),
					);
				}

				const data = (await response.json()) as IcdSearchResponse;

				return (data.destinationEntities ?? [])
					.filter(
						(
							entity,
						): entity is Required<
							Pick<IcdDestinationEntity, 'theCode' | 'title'>
						> => Boolean(entity.theCode && entity.title),
					)
					.slice(0, 6)
					.map((entity) => ({
						code: entity.theCode,
						title: entity.title,
					}));
			} catch (error) {
				lastError = error;

				if (
					attempt < IcdService.MAX_ATTEMPTS &&
					this.isRetryableError(error)
				) {
					this.logger.warn(
						{
							attempt,
							query,
							error: this.serializeError(error),
						},
						'ICD search attempt failed, retrying.',
					);

					await this.delay(IcdService.RETRY_DELAY_MS * attempt);
					continue;
				}

				break;
			}
		}

		this.logger.error(
			{
				query,
				error: this.serializeError(lastError),
			},
			lastError instanceof IcdUpstreamError
				? 'ICD search request failed.'
				: 'Failed to reach ICD API.',
		);

		if (lastError instanceof IcdUpstreamError) {
			throw new InternalServerErrorException('ICD search failed.');
		}

		throw new InternalServerErrorException('Failed to reach ICD API.');
	}

	private isRetryableError(error: unknown) {
		return (
			error instanceof TypeError ||
			(error instanceof IcdUpstreamError && error.statusCode >= 500)
		);
	}

	private serializeError(error: unknown) {
		if (error instanceof IcdUpstreamError) {
			return {
				name: error.name,
				message: error.message,
				statusCode: error.statusCode,
				responseBody: error.responseBody,
				stack: error.stack,
			};
		}

		if (error instanceof Error) {
			return {
				name: error.name,
				message: error.message,
				stack: error.stack,
				cause:
					error.cause instanceof Error
						? {
								name: error.cause.name,
								message: error.cause.message,
								stack: error.cause.stack,
							}
						: error.cause,
			};
		}

		return { message: String(error) };
	}

	private async delay(ms: number) {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}
}
