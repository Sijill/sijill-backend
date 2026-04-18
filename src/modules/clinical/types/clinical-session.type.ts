import { AccessType, UserRole } from '@common/enums/db.enum';

export interface ClinicalSessionTokenPayload {
	type: 'CLINICAL_SESSION';
	sessionId: string;
	permissionTokenId: string;
	userId: string;
	patientId: string;
	accessType: AccessType;
	role: UserRole.HEALTHCARE_PROVIDER;
	iat?: number;
	exp?: number;
}

export interface ClinicalSessionContext {
	sessionId: string;
	permissionTokenId: string;
	patientId: string;
	patientUserId: string;
	hcpId: string;
	hcpUserId: string;
	accessType: AccessType;
	expiresAt: string;
}
