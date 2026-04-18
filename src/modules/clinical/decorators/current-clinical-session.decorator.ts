import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentClinicalSession = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		return request.clinicalSession;
	},
);
