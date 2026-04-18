import { IsString, Matches } from 'class-validator';

export class StartSessionDto {
	@IsString()
	@Matches(/^[0-9]{6}$/, { message: 'code must be a 6-digit number' })
	code!: string;
}
