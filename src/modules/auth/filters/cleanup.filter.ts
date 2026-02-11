import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
} from '@nestjs/common';
import { MulterRequest } from '../interfaces/multer-request.interface';
import * as fs from 'fs';
import * as path from 'path';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class FileCleanupFilter implements ExceptionFilter {
	constructor(private readonly logger: PinoLogger) {
		this.logger.setContext(FileCleanupFilter.name);
	}

	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const req = ctx.getRequest<MulterRequest>();

		this.cleanUpFiles(req);

		throw exception;
	}

	private cleanUpFiles(req: MulterRequest): void {
		const files = req.files;
		if (!files) return;

		const allFiles = Object.values(files).flat();

		for (const file of allFiles) {
			const filePath = path.resolve(file.destination, file.filename);

			try {
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			} catch (err) {
				this.logger.warn(`Failed to delete orphaned file: ${filePath}`, err);
			}
		}
	}
}
