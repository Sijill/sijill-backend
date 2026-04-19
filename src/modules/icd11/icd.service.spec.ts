import { InternalServerErrorException } from '@nestjs/common';
import { IcdService } from './icd.service';

describe('IcdService', () => {
	const logger = {
		setContext: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	};

	let service: IcdService;
	let originalFetch: typeof fetch | undefined;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new IcdService(logger as any);
		originalFetch = global.fetch;
		jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);
	});

	afterEach(() => {
		global.fetch = originalFetch as typeof fetch;
		delete process.env.ICD_API_URL;
	});

	it('maps destination entities to the frontend response and limits them to six', async () => {
		process.env.ICD_API_URL = 'http://icd-api';

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: jest.fn().mockResolvedValue({
				destinationEntities: [
					{ theCode: 'CA23', title: 'Asthma' },
					{ theCode: 'CA23.0', title: 'Allergic Asthma' },
					{ theCode: 'CA24', title: 'Exercise-induced asthma' },
					{ theCode: 'CA25', title: 'Severe asthma' },
					{ theCode: 'CA26', title: 'Mild asthma' },
					{ theCode: 'CA27', title: 'Chronic asthma' },
					{ theCode: 'CA28', title: 'Night-time asthma' },
					{ theCode: '', title: 'Missing code' },
				],
			}),
		}) as typeof fetch;

		await expect(service.searchDiagnoses('asth')).resolves.toEqual([
			{ code: 'CA23', title: 'Asthma' },
			{ code: 'CA23.0', title: 'Allergic Asthma' },
			{ code: 'CA24', title: 'Exercise-induced asthma' },
			{ code: 'CA25', title: 'Severe asthma' },
			{ code: 'CA26', title: 'Mild asthma' },
			{ code: 'CA27', title: 'Chronic asthma' },
		]);

		expect(global.fetch).toHaveBeenCalledWith(
			new URL(
				'http://icd-api/icd/release/11/2026-01/mms/search?q=asth&highlightingEnabled=false&medicalCodingMode=true',
			),
			{
				headers: {
					'API-Version': 'v2',
					'Accept-Language': 'en',
					Accept: 'application/json',
				},
			},
		);
	});

	it('throws an internal error when the ICD API cannot be reached', async () => {
		global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

		await expect(service.searchDiagnoses('asth')).rejects.toThrow(
			new InternalServerErrorException('Failed to reach ICD API.'),
		);
	});

	it('retries transient failures before succeeding', async () => {
		global.fetch = jest
			.fn()
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockResolvedValueOnce({
				ok: true,
				json: jest.fn().mockResolvedValue({
					destinationEntities: [{ theCode: 'CA23', title: 'Asthma' }],
				}),
			}) as typeof fetch;

		await expect(service.searchDiagnoses('asth')).resolves.toEqual([
			{ code: 'CA23', title: 'Asthma' },
		]);

		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});
});
