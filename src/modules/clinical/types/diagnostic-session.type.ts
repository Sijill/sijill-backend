import { AccessType, UserRole } from '@common/enums/db.enum';

export interface LabSessionTokenPayload {
	type: 'LAB_SESSION';
	sessionId: string;
	permissionTokenId: string;
	userId: string;
	patientId: string;
	medicalOrderId: string;
	accessType: AccessType;
	role: UserRole.LAB;
	iat?: number;
	exp?: number;
}

export interface ImagingSessionTokenPayload {
	type: 'IMAGING_SESSION';
	sessionId: string;
	permissionTokenId: string;
	userId: string;
	patientId: string;
	medicalOrderId: string;
	accessType: AccessType;
	role: UserRole.IMAGING_CENTER;
	iat?: number;
	exp?: number;
}

