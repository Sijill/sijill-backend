import {
	multerStorage,
	multerLimits,
	multerFileFilter,
} from '@common/multer/multer.config';

import { FileFieldsInterceptor } from '@nestjs/platform-express';

export const RegistrationFileInterceptor = FileFieldsInterceptor(
	[
		{ name: 'nationalIdFront', maxCount: 1 },
		{ name: 'nationalIdBack', maxCount: 1 },
		{ name: 'selfieWithId', maxCount: 1 },
		{ name: 'medicalLicenseDocument', maxCount: 1 },
		{ name: 'workplaceDocument', maxCount: 1 },
		{ name: 'workplaceLogo', maxCount: 1 },
		{ name: 'accreditationDocument', maxCount: 1 },
		{ name: 'proofOfAddress', maxCount: 1 },
		{ name: 'labLogo', maxCount: 1 },
		{ name: 'centerLogo', maxCount: 1 },
	],
	{
		storage: multerStorage,
		limits: multerLimits,
		fileFilter: multerFileFilter,
	},
);
