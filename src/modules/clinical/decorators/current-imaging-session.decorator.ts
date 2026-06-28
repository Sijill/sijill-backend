import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentImagingSession = createParamDecorator(
	(_: unknown, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		return request.imagingSession;
	},
);
