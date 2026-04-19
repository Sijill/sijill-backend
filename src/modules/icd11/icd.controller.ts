import {
	BadRequestException,
	Controller,
	Get,
	Query,
} from '@nestjs/common';
import { IcdService } from './icd.service';

@Controller('api/v1/icd')
export class IcdController {
	constructor(private readonly icdService: IcdService) {}

	@Get('search')
	async search(@Query('q') query: string) {
		if (!query || query.trim().length < 2) {
			throw new BadRequestException('Query must be at least 2 characters.');
		}

		return await this.icdService.searchDiagnoses(query.trim());
	}
}
