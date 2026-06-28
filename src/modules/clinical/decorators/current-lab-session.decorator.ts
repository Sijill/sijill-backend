import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentLabSession = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		return request.labSession;
	},
);
