import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class MultipartMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void {
        const contentType = req.headers['content-type'];

        if (!contentType?.includes('multipart/form-data')) {
            throw new BadRequestException('Content-Type must be multipart/form-data');
        }

        next();
    }
}