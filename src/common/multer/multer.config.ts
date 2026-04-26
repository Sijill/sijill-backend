import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

const fieldsMap = new Map();
fieldsMap.set(
	'profilePicture',
	'identity',
);
fieldsMap.set(
	'nationalIdFront',
	'identity',
);
fieldsMap.set(
	'nationalIdBack',
	'identity',
);
fieldsMap.set(
	'selfieWithId',
	'identity',
);
fieldsMap.set(
	'medicalLicenseDocument',
	'identity',
);

fieldsMap.set(
	'workplaceLogo',
	'workplace',
);
fieldsMap.set('labLogo', 'workplace');
fieldsMap.set(
	'centerLogo',
	'workplace',
);
fieldsMap.set(
	'workplaceDocument',
	'workplace',
);
fieldsMap.set(
	'accreditationDocument',
	'workplace',
);
fieldsMap.set(
	'proofOfAddress',
	'workplace',
);

fieldsMap.set(
	'prescription',
	'clinical',
);
fieldsMap.set('labResult', 'clinical');
fieldsMap.set(
	'imagingResult',
	'clinical',
);
fieldsMap.set(
	'clinicalAttachment',
	'clinical',
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
		const uploadSubdir: string = fieldsMap.get(fieldName);
		const uploadRoot = process.env.UPLOAD_ROOT
			? path.resolve(process.env.UPLOAD_ROOT)
			: path.resolve(process.cwd(), 'uploads');
		const filePath = path.resolve(uploadRoot, uploadSubdir);

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
