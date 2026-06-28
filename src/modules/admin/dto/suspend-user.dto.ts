import { IsString, MinLength } from 'class-validator';

export class SuspendUserDto {
	@IsString()
	@MinLength(10, {
		message: 'Suspension reason must be at least 10 characters long.',
	})
	reason: string;
}
