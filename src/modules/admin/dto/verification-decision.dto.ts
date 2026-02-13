import {
	IsEnum,
	IsUUID,
	IsString,
	MinLength,
	ValidateIf,
} from 'class-validator';

export enum VerificationDecision {
	APPROVE = 'APPROVE',
	REJECT = 'REJECT',
}

export class VerificationDecisionDto {
	@IsUUID(4, { message: 'User ID must be a valid UUID.' })
	userId: string;

	@IsEnum(VerificationDecision, {
		message: 'Decision must be either APPROVE or REJECT.',
	})
	decision: VerificationDecision;

	@ValidateIf((o) => o.decision === VerificationDecision.REJECT)
	@IsString({ message: 'Rejection reason must be a string.' })
	@MinLength(10, {
		message: 'Rejection reason must be at least 10 characters long.',
	})
	rejectionReason?: string;
}
