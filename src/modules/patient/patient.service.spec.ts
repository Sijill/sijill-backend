import { BadRequestException } from '@nestjs/common';
jest.mock('./patient.repository', () => ({
	PatientRepository: class PatientRepository {},
}));
jest.mock('./patient-health-snapshot.service', () => ({
	PatientHealthSnapshotService: class PatientHealthSnapshotService {},
}));
import { PatientService } from './patient.service';

describe('PatientService', () => {
	const logger = {
		setContext: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	};

	const patientRepository = {
		getPatientByUserId: jest.fn(),
		getReminderForPatient: jest.fn(),
		updateReminder: jest.fn(),
	};

	const patientHealthSnapshotService = {} as any;

	let service: PatientService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new PatientService(
			patientRepository as any,
			patientHealthSnapshotService,
			logger as any,
		);
	});

	it('returns a bad request when reminder updates are empty', async () => {
		patientRepository.getPatientByUserId.mockResolvedValue({ id: 'patient-1' });
		patientRepository.getReminderForPatient.mockResolvedValue({
			reminder_type: 'MEDICATION',
		});

		await expect(
			service.updateReminder('patient-user-1', 'reminder-1', undefined as any),
		).rejects.toThrow(
			new BadRequestException('At least one reminder update field is required.'),
		);

		expect(patientRepository.updateReminder).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});
});
