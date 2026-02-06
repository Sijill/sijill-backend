import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

const fieldsMap = new Map();
fieldsMap.set(
	'profilePicture',
	path.resolve(process.cwd(), 'uploads', 'identity'),
);
fieldsMap.set(
	'nationalIdFront',
	path.resolve(process.cwd(), 'uploads', 'identity'),
);
fieldsMap.set(
	'nationalIdBack',
	path.resolve(process.cwd(), 'uploads', 'identity'),
);
fieldsMap.set(
	'selfieWithId',
	path.resolve(process.cwd(), 'uploads', 'identity'),
);
fieldsMap.set(
	'medicalLicenseDocument',
	path.resolve(process.cwd(), 'uploads', 'identity'),
);

fieldsMap.set(
	'workplaceLogo',
	path.resolve(process.cwd(), 'uploads', 'workplace'),
);
fieldsMap.set('labLogo', path.resolve(process.cwd(), 'uploads', 'workplace'));
fieldsMap.set(
	'centerLogo',
	path.resolve(process.cwd(), 'uploads', 'workplace'),
);
fieldsMap.set(
	'workplaceDocument',
	path.resolve(process.cwd(), 'uploads', 'workplace'),
);
fieldsMap.set(
	'accreditationDocument',
	path.resolve(process.cwd(), 'uploads', 'workplace'),
);
fieldsMap.set(
	'proofOfAddress',
	path.resolve(process.cwd(), 'uploads', 'workplace'),
);

fieldsMap.set(
	'prescription',
	path.resolve(process.cwd(), 'uploads', 'clinical'),
);
fieldsMap.set('labResult', path.resolve(process.cwd(), 'uploads', 'clinical'));
fieldsMap.set(
	'imagingResult',
	path.resolve(process.cwd(), 'uploads', 'clinical'),
);
fieldsMap.set(
	'clinicalAttachment',
	path.resolve(process.cwd(), 'uploads', 'clinical'),
);

const ALLOWED_MIME_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'application/pdf',
]);

export const multerStorage = diskStorage({
	destination: (req, file, cb) => {
		const fieldName: string = file.fieldname;
		const filePath: string = fieldsMap.get(fieldName);

		cb(null, filePath);
	},

	filename: (req, file, cb) => {
		const ext: string = path.extname(file.originalname);
		cb(null, uuidv4() + ext);
	},
});

export const multerFileFilter = (
	req: Request,
	file: Express.Multer.File,
	cb: Function,
) => {
	if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
		return cb(
			new BadRequestException(`Unsupported file type: ${file.mimetype}`),
			false,
		);
	}

	cb(null, true);
};

export const multerLimits = {
	fileSize: 5 * 1024 * 1024,
};
