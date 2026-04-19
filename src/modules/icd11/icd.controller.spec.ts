import { BadRequestException } from '@nestjs/common';
import { IcdController } from './icd.controller';

describe('IcdController', () => {
	const icdService = {
		searchDiagnoses: jest.fn(),
	};

	let controller: IcdController;

	beforeEach(() => {
		jest.clearAllMocks();
		controller = new IcdController(icdService as any);
	});

	it('rejects queries shorter than two characters', async () => {
		await expect(controller.search('a')).rejects.toThrow(
			new BadRequestException('Query must be at least 2 characters.'),
		);
	});

	it('trims the query before passing it to the service', async () => {
		icdService.searchDiagnoses.mockResolvedValue([
			{ code: 'CA23', title: 'Asthma' },
		]);

		await expect(controller.search('  asth  ')).resolves.toEqual([
			{ code: 'CA23', title: 'Asthma' },
		]);
		expect(icdService.searchDiagnoses).toHaveBeenCalledWith('asth');
	});
});
