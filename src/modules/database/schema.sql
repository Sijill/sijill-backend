------------------------------
--------- EXTENSIONS ---------
------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

------------------------------
---- CUSTOM TYPES (ENUMS) ----
------------------------------
CREATE TYPE user_role AS ENUM (
    'PATIENT',
    'HEALTHCARE_PROVIDER',
    'LAB',
    'IMAGING_CENTER',
    'ADMIN'
);

CREATE TYPE account_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED',
    'SUSPENDED',
    'DEACTIVATED'
);

CREATE TYPE mfa_method AS ENUM (
    'NONE',
    'EMAIL_OTP',
    'SMS_OTP',
    'TOTP'
);

CREATE TYPE access_type AS ENUM (
    'READ_ONLY',
    'WRITE_ONLY',
    'READ_WRITE'
);

CREATE TYPE access_status AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'REVOKED'
);

CREATE TYPE gender AS ENUM (
    'MALE',
    'FEMALE'
);

CREATE TYPE blood_type AS ENUM (
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
    'UNKNOWN'
);

CREATE TYPE emergency_contact_relationship AS ENUM (
    'PARENT',
    'SPOUSE',
    'SIBLING',
    'FRIEND',
    'CAREGIVER',
    'OTHER'
);

CREATE TYPE allergy_severity AS ENUM (
    'MILD',
    'MODERATE',
    'SEVERE',
    'LIFE_THREATENING'
);

CREATE TYPE order_type AS ENUM (
    'LABORATORY',
    'IMAGING'
);

CREATE TYPE order_priority AS ENUM (
    'ROUTINE',
    'URGENT',
    'STAT'
);

CREATE TYPE order_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE dosage_unit AS ENUM (
    'MG',
    'MCG',
    'G',
    'ML',
    'IU',
    'UNITS',
    'DROPS',
    'PUFFS',
    'TABLETS',
    'CAPSULES',
    'TEASPOONS'
);

CREATE TYPE medication_form AS ENUM (
    'TABLET',
    'CAPSULE',
    'LIQUID',
    'INJECTION',
    'TOPICAL',
    'INHALER',
    'DROPS',
    'PATCH',
    'OTHER'
);

CREATE TYPE diagnosis_status AS ENUM (
    'ACTIVE',
    'RESOLVED_BY_HCP',
    'RESOLVED_BY_PATIENT'
);

CREATE TYPE patient_outcome AS ENUM (
    'FULLY_RECOVERED',
    'IMPROVED',
    'NO_CHANGE',
    'WORSE'
);

CREATE TYPE reminder_type AS ENUM (
    'MEDICATION',
    'APPOINTMENT',
    'MEDICAL_ORDER'
);

CREATE TYPE notification_type AS ENUM (
    'SYSTEM',
    'REMINDER'
);

CREATE TYPE notification_status AS ENUM (
    'PENDING',
    'SENT',
    'READ'
);

CREATE TYPE file_type AS ENUM (
    'NATIONAL_ID_FRONT',
    'NATIONAL_ID_BACK',
    'SELFIE_WITH_ID',
    'MEDICAL_LICENSE',
    'WORKPLACE_DOC',
    'LAB_ACCREDITATION',
    'RADIOLOGY_ACCREDITATION',
    'LOGO',
    'PRESCRIPTION',
    'LAB_RESULT',
    'IMAGING_RESULT',
    'CLINICAL_ATTACHMENT',
    'PROFILE_PICTURE',
    'OTHER'
);
------------------------------
------ USERS & PROFILES ------
------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email CITEXT NOT NULL UNIQUE,
    phone_number VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    account_status account_status DEFAULT 'PENDING',
    email_verified BOOLEAN,
    mfa_method mfa_method NOT NULL DEFAULT 'NONE',
    mfa_secret TEXT,

    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id),

    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID REFERENCES users(id),
    rejection_reason TEXT,

    suspended_at TIMESTAMP WITH TIME ZONE,
    suspended_by UUID REFERENCES users(id),
    suspention_reason TEXT,

    deactivated_at TIMESTAMP WITH TIME ZONE,
    deactivated_by UUID REFERENCES users(id),
    deactivation_reason TEXT,

    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    locked_until TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_users_pending_verification
ON users (id DESC)
WHERE account_status = 'PENDING';

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NOT NULL,
    surname VARCHAR(100) NOT NULL,
    gender gender NOT NULL,
    date_of_birth DATE NOT NULL,
    national_id VARCHAR(50) CHECK (national_id ~ '^[0-9]{14}$') NOT NULL,
    blood_type blood_type,
    weight_kg INTEGER,
    height_cm INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE healthcare_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) NOT NULL,
    surname VARCHAR(100) NOT NULL,
    gender gender NOT NULL,
    date_of_birth DATE NOT NULL,
    national_id VARCHAR(50) CHECK (national_id ~ '^[0-9]{14}$') NOT NULL,
    medical_license_number VARCHAR(100) NOT NULL,
    specialization VARCHAR(100) NOT NULL,

    workplace_name VARCHAR(300),
    workplace_address TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE laboratories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    lab_name VARCHAR(300) NOT NULL,
    registration_number VARCHAR(100) NOT NULL,
    administrator_full_name VARCHAR(300) NOT NULL,

    lab_address TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE imaging_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    center_name VARCHAR(300) NOT NULL,
    registration_number VARCHAR(100) NOT NULL,
    administrator_full_name VARCHAR(300) NOT NULL,

    center_address TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

------------------------------
---- PATIENT MEDICAL DATA ----
------------------------------
CREATE TABLE patient_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),

    contact_name VARCHAR(200) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    relationship emergency_contact_relationship NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),

    allergen_name VARCHAR(500),
    severity allergy_severity,
    reaction_description TEXT,

    diagnosed_by UUID REFERENCES healthcare_providers(id),
    diagnosed_date DATE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

------------------------------
------- CLINICAL FLOW --------
------------------------------
CREATE TABLE clinical_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),  
    hcp_id UUID REFERENCES healthcare_providers(id),

    encounter_date TIMESTAMP WITH TIME ZONE,
    location_address TEXT,
    next_appointment_date TIMESTAMP WITH TIME ZONE,
    appointment_notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE encounter_symptoms_complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES clinical_encounters(id) ON DELETE CASCADE,

    title VARCHAR(500) NOT NULL,
    description TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID REFERENCES clinical_encounters(id),
    patient_id UUID REFERENCES patients(id),

    icd11_code VARCHAR(20),
    icd11_title VARCHAR(500),
    clinical_description TEXT,
    is_chronic BOOLEAN NOT NULL DEFAULT FALSE,

    status diagnosis_status,
    diagnosed_date TIMESTAMP WITH TIME ZONE,

    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by_hcp_id UUID REFERENCES healthcare_providers(id),
    resolution_note TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT uq_diagnosis_patient UNIQUE (id, patient_id)
);

CREATE TABLE patient_health_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    diagnosis_id UUID NOT NULL,

    note_date DATE NOT NULL DEFAULT now(),
    patient_outcome patient_outcome,
    patient_outcome_details TEXT,
    mood TEXT,
    pain_level SMALLINT CHECK (pain_level BETWEEN 0 AND 10),
    energy_level SMALLINT CHECK (energy_level BETWEEN 0 AND 10),


    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT fk_patient_health_notes_diagnosis_patient
    FOREIGN KEY (diagnosis_id, patient_id)
    REFERENCES diagnoses(id, patient_id)
    ON DELETE CASCADE
);

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID REFERENCES clinical_encounters(id),
    patient_id UUID REFERENCES patients(id),
    diagnosis_id UUID REFERENCES diagnoses(id),
    prescribed_by_hcp_id UUID REFERENCES healthcare_providers(id),

    medication_name VARCHAR(500),
    dosage_amount NUMERIC(10,2),
    dosage_unit dosage_unit,
    form medication_form,
    frequency VARCHAR(500),
    start_date DATE,
    end_date DATE,
    instructions TEXT,

    prescribed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT fk_medications_diagnosis_patient 
    FOREIGN KEY (diagnosis_id, patient_id) 
    REFERENCES diagnoses(id, patient_id)
);

------------------------------
----- ORDERS & RESULTS -------
------------------------------
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),

    file_type file_type,
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    uploaded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE ref_imaging_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE ref_body_parts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE ref_test_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE ref_specimen_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO ref_imaging_types (name) VALUES
('X-RAY'),('CT_SCAN'),('MRI'),('ULTRASOUND'),('PET_SCAN'),
('MAMMOGRAPHY'),('FLUOROSCOPY'),('ECHOCARDIOGRAPHY'),('DEXA_SCAN'),('ANGIOGRAPHY');

INSERT INTO ref_body_parts (name) VALUES
('HEAD'),('NECK'),('CHEST'),('ABDOMEN'),('PELVIS'),('SPINE'),
('SHOULDER'),('ELBOW'),('WRIST'),('HAND'),('HIP'),('KNEE'),
('ANKLE'),('FOOT'),('FULL_BODY'),('UPPER_EXTREMITY'),('LOWER_EXTREMITY');

INSERT INTO ref_test_types (name) VALUES
('COMPLETE_BLOOD_COUNT'),('BASIC_METABOLIC_PANEL'),('COMPREHENSIVE_METABOLIC_PANEL'),
('LIPID_PANEL'),('THYROID_FUNCTION'),('LIVER_FUNCTION'),('KIDNEY_FUNCTION'),
('URINALYSIS'),('BLOOD_GLUCOSE'),('HBA1C'),('COAGULATION_PANEL'),
('BLOOD_CULTURE'),('URINE_CULTURE'),('STI_PANEL'),('HEPATITIS_PANEL'),
('HIV_TEST'),('PREGNANCY_TEST'),('VITAMIN_D'),('IRON_PANEL'),('CARDIAC_ENZYMES');

INSERT INTO ref_specimen_types (name) VALUES
('BLOOD'),('URINE'),('STOOL'),('SALIVA'),('SWAB'),
('TISSUE_BIOPSY'),('SPUTUM'),('CEREBROSPINAL_FLUID'),('PLEURAL_FLUID'),('BONE_MARROW');


CREATE TABLE medical_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID REFERENCES clinical_encounters(id),
    patient_id UUID REFERENCES patients(id),
    ordered_by_hcp_id UUID REFERENCES healthcare_providers(id),

    order_type order_type,
    order_status order_status,

    ordered_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_order_id UUID NOT NULL UNIQUE REFERENCES medical_orders(id),
    
    test_type_id INTEGER REFERENCES ref_test_types(id),
    specimen_type_id INTEGER REFERENCES ref_specimen_types(id),
    fasting_required BOOLEAN,
    priority order_priority,
    clinical_indication TEXT
);

CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES medical_orders(id),
    patient_id UUID REFERENCES patients(id),
    lab_id UUID REFERENCES laboratories(id),

    result_data JSONB,
    additional_notes TEXT,

    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    uploaded_by_user_id UUID REFERENCES users(id)
);

CREATE TABLE lab_result_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_result_id UUID REFERENCES lab_results(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE imaging_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_order_id UUID NOT NULL UNIQUE REFERENCES medical_orders(id),
    
    imaging_type_id INTEGER REFERENCES ref_imaging_types(id),
    body_part_id INTEGER REFERENCES ref_body_parts(id),
    contrast_used BOOLEAN,
    priority order_priority,
    clinical_indication TEXT
);

CREATE TABLE imaging_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES medical_orders(id),
    patient_id UUID REFERENCES patients(id),
    imaging_center_id UUID REFERENCES imaging_centers(id),

    study_description TEXT,
    findings TEXT,

    uploaded_at TIMESTAMP WITH TIME ZONE,
    uploaded_by_user_id UUID REFERENCES users(id)
);

CREATE TABLE imaging_result_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imaging_result_id UUID REFERENCES imaging_results(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE
);

------------------------------
------------ MISC ------------
------------------------------
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    reminder_type reminder_type NOT NULL,

    -- source (only one will be set depending on type)
    medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
    medical_order_id UUID REFERENCES medical_orders(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES clinical_encounters(id) ON DELETE CASCADE,

    -- doctor sets these
    starts_at DATE,
    ends_at DATE,           -- nullable, some medications have no end date
    appointment_at TIMESTAMP WITH TIME ZONE,  -- only for APPOINTMENT type

    -- patient can override these
    reminder_time TIME NOT NULL DEFAULT '09:00:00',  -- what time of day to notify
    custom_days INT[] DEFAULT NULL, -- nullable, e.g. {1,3,5} = Mon/Wed/Fri, NULL means every day

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    dismissed_at TIMESTAMP WITH TIME ZONE,  -- patient manually dismissed it

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    -- ensure only one source is set
    CONSTRAINT chk_reminder_source CHECK (
        (
            (medication_id IS NOT NULL)::int +
            (medical_order_id IS NOT NULL)::int +
            (encounter_id IS NOT NULL)::int
        ) = 1
    )
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    notification_type notification_type NOT NULL,
    status notification_status NOT NULL DEFAULT 'PENDING',

    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,

    -- only set if this notification was spawned by a reminder
    reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,

    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_notifications_polling
ON notifications (user_id, scheduled_for, status)
WHERE status = 'PENDING';

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100),
    resource_type VARCHAR(100),
    resource_id UUID,
    accessed_patient_id UUID REFERENCES patients(id),
    access_method VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-----------------------------
---- Auth & Access Codes ----
-----------------------------
CREATE TABLE login_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    ip_address INET,
    user_agent TEXT,
      
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE registration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email CITEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,

    registration_data JSONB NOT NULL,
    registration_documents JSONB NOT NULL,

    ip_address INET,
    user_agent TEXT,

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE UNIQUE INDEX uniq_pending_registration_email
    ON registration_sessions (email);

CREATE TABLE password_reset_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    ip_address INET,
    user_agent TEXT,
    
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE user_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    login_session_id UUID REFERENCES login_sessions(id) ON DELETE CASCADE,
    register_session_id UUID REFERENCES registration_sessions(id) ON DELETE CASCADE,
    password_reset_session_id UUID REFERENCES password_reset_sessions(id) ON DELETE CASCADE,

    otp_hash VARCHAR(255) NOT NULL,
    mfa_method mfa_method NOT NULL,
    purpose VARCHAR(50) NOT NULL,

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    CONSTRAINT check_user_otp_context
    CHECK (
        -- Login OTP
        (user_id IS NOT NULL AND login_session_id IS NOT NULL 
        AND register_session_id IS NULL AND password_reset_session_id IS NULL) OR
        -- Registration OTP  
        (user_id IS NULL AND register_session_id IS NOT NULL 
        AND login_session_id IS NULL AND password_reset_session_id IS NULL) OR
        -- Password reset OTP
        (user_id IS NOT NULL AND password_reset_session_id IS NOT NULL 
        AND login_session_id IS NULL AND register_session_id IS NULL)
    )
);

CREATE UNIQUE INDEX idx_one_active_login_otp 
ON user_otps(login_session_id) 
WHERE used_at IS NULL AND login_session_id IS NOT NULL;

CREATE UNIQUE INDEX idx_one_active_register_otp
ON user_otps(register_session_id)
WHERE used_at IS NULL AND register_session_id IS NOT NULL;

CREATE UNIQUE INDEX idx_one_active_password_reset_otp
ON user_otps(password_reset_session_id)
WHERE used_at IS NULL AND password_reset_session_id IS NOT NULL;

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash VARCHAR(255) NOT NULL UNIQUE,
    parent_token_id UUID REFERENCES refresh_tokens(id),

    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,

    issued_ip INET,
    user_agent TEXT
);


CREATE TABLE patient_permission_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    medical_order_id UUID REFERENCES medical_orders(id),

    code_hash VARCHAR(255) NOT NULL UNIQUE,
    entity_type user_role NOT NULL,
    access_type access_type NOT NULL,
    status access_status NOT NULL DEFAULT 'ACTIVE',

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE patient_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    permission_token_id UUID NOT NULL REFERENCES patient_permission_tokens(id) ON DELETE CASCADE,
    grantee_user_id UUID NOT NULL REFERENCES users(id),

    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    revoked_at TIMESTAMP WITH TIME ZONE,

    UNIQUE (permission_token_id, grantee_user_id)
);

------------------------------
------- AI CHAT TABLES --------
------------------------------

CREATE TABLE ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    title VARCHAR(300),
    message_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_chat_sessions_patient ON ai_chat_sessions(patient_id, status);
CREATE INDEX idx_ai_chat_messages_session ON ai_chat_messages(session_id, created_at);

------------------------------
---------- SEED DATA ----------
------------------------------

-- Admin User
INSERT INTO users (
    id, email, phone_number, password_hash, role,
    account_status, email_verified, mfa_method,
    verified_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@gmail.com',
    '12345678910',
    '$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
    'ADMIN',
    'VERIFIED',
    true,
    'EMAIL_OTP',
    now(),
    now(),
    now()
);

-- Patient User
INSERT INTO users (
    id, email, phone_number, password_hash, role,
    account_status, email_verified, mfa_method,
    verified_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'patient@gmail.com',
    '01012345678',
    '$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
    'PATIENT',
    'VERIFIED',
    true,
    'EMAIL_OTP',
    now(),
    now(),
    now()
);

INSERT INTO patients (
    id, user_id,
    first_name, middle_name, surname,
    gender, date_of_birth, national_id,
    blood_type, weight_kg, height_cm,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000002',
    'Sara', 'Ahmed', 'Jenkins',
    'FEMALE', '1992-03-15', '29203150123456',
    'O+', 65, 168,
    now(), now()
);

-- HCP User
INSERT INTO users (
    id, email, phone_number, password_hash, role,
    account_status, email_verified, mfa_method,
    verified_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    'hcp@gmail.com',
    '01098765432',
    '$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
    'HEALTHCARE_PROVIDER',
    'VERIFIED',
    true,
    'EMAIL_OTP',
    now(),
    now(),
    now()
);

INSERT INTO healthcare_providers (
    id, user_id,
    first_name, middle_name, surname,
    gender, date_of_birth, national_id,
    medical_license_number, specialization,
    workplace_name, workplace_address,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000003',
    'Khaled', 'Mohamed', 'Mostafa',
    'MALE', '1985-07-20', '28507200456789',
    'ML-2025-00123', 'Pulmonology',
    'Cairo Medical Center', '12 Tahrir St, Cairo',
    now(), now()
);

-- Lab User
INSERT INTO users (
    id, email, phone_number, password_hash, role,
    account_status, email_verified, mfa_method,
    verified_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000004',
    'lab@gmail.com',
    NULL,
    '$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
    'LAB',
    'VERIFIED',
    true,
    'EMAIL_OTP',
    now(),
    now(),
    now()
);

INSERT INTO laboratories (
    id, user_id,
    lab_name, registration_number, administrator_full_name,
    lab_address,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000004',
    'Sijill Lab',
    'LAB-2026-0001',
    'Lab Administrator',
    'Cairo, Egypt',
    now(), now()
);

-- Imaging Center User
INSERT INTO users (
    id, email, phone_number, password_hash, role,
    account_status, email_verified, mfa_method,
    verified_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000005',
    'imaging@gmail.com',
    NULL,
    '$2a$12$IPvROaRu/TcY7J679mr1C.rT4bSOEUWKJt.NnvR67/IyONOiSz0rq',
    'IMAGING_CENTER',
    'VERIFIED',
    true,
    'EMAIL_OTP',
    now(),
    now(),
    now()
);

INSERT INTO imaging_centers (
    id, user_id,
    center_name, registration_number, administrator_full_name,
    center_address,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000013',
    '00000000-0000-0000-0000-000000000005',
    'Sijill Imaging',
    'IMG-2026-0001',
    'Imaging Administrator',
    'Cairo, Egypt',
    now(), now()
);

-- -------------------------------------------------------------
-- 1. Clinical Encounter (links patient to HCP, needed for FKs)
-- -------------------------------------------------------------
INSERT INTO clinical_encounters (
    id, patient_id, hcp_id,
    encounter_date, location_address,
    next_appointment_date, appointment_notes,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',  -- Sara
    '00000000-0000-0000-0000-000000000011',  -- Dr. Khaled
    '2025-11-10 09:00:00+00',
    'Cairo Medical Center, 12 Tahrir St, Cairo',
    '2026-06-15 09:00:00+00',
    'Routine follow-up for asthma and diabetes management.',
    now(), now()
);
 
-- -------------------------------------------------------------
-- 2. Symptoms & Complaints
-- -------------------------------------------------------------
INSERT INTO encounter_symptoms_complaints (
    id, encounter_id, title, description,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000020',
    'Persistent cough',
    'Patient reports dry cough lasting for 2 weeks, worse at night.',
    now(), now()
);

INSERT INTO encounter_symptoms_complaints (
    id, encounter_id, title, description,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000020',
    'Shortness of breath',
    'Experiencing shortness of breath during moderate exertion.',
    now(), now()
);

INSERT INTO encounter_symptoms_complaints (
    id, encounter_id, title, description,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000032',
    '00000000-0000-0000-0000-000000000020',
    'Chest tightness',
    'Occasional chest tightness in the morning, relieved after rest.',
    now(), now()
);
 
-- -------------------------------------------------------------
-- 3. Diagnoses
--    - Asthma (active, chronic)
--    - Type 2 Diabetes (active, non-chronic)
-- -------------------------------------------------------------
INSERT INTO diagnoses (
    id, encounter_id, patient_id,
    icd11_code, icd11_title, clinical_description,
    is_chronic, status, diagnosed_date,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000033',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'CA23',
    'Asthma',
    'Mild persistent asthma. Patient reports occasional nocturnal symptoms and exercise-induced wheezing. Well-controlled on current inhaler regimen.',
    TRUE,
    'ACTIVE',
    '2025-11-10 09:00:00+00',
    now(), now()
);
 
INSERT INTO diagnoses (
    id, encounter_id, patient_id,
    icd11_code, icd11_title, clinical_description,
    is_chronic, status, diagnosed_date,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000034',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '5A11',
    'Type 2 diabetes mellitus',
    'Newly diagnosed Type 2 diabetes. HbA1c at 7.8%. Patient started on Metformin. Lifestyle modifications advised.',
    FALSE,
    'ACTIVE',
    '2025-11-10 09:00:00+00',
    now(), now()
);
 
-- -------------------------------------------------------------
-- 4. Medications
--    - Salbutamol inhaler for Asthma
--    - Metformin for Diabetes
-- -------------------------------------------------------------
INSERT INTO medications (
    id, encounter_id, patient_id, diagnosis_id, prescribed_by_hcp_id,
    medication_name, dosage_amount, dosage_unit, form,
    frequency, start_date, end_date, instructions,
    prescribed_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000033',  -- linked to Asthma
    '00000000-0000-0000-0000-000000000011',
    'Salbutamol',
    100, 'MCG', 'INHALER',
    '2 puffs as needed, maximum 4 times daily',
    '2025-11-10', NULL,
    'Shake well before use. Rinse mouth after each use to prevent oral thrush.',
    '2025-11-10 09:30:00+00',
    now(), now()
);
 
INSERT INTO medications (
    id, encounter_id, patient_id, diagnosis_id, prescribed_by_hcp_id,
    medication_name, dosage_amount, dosage_unit, form,
    frequency, start_date, end_date, instructions,
    prescribed_at, created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000034',  -- linked to Diabetes
    '00000000-0000-0000-0000-000000000011',
    'Metformin',
    500, 'MG', 'TABLET',
    'Twice daily with meals',
    '2025-11-10', NULL,
    'Take with food to reduce gastrointestinal side effects. Monitor blood glucose regularly.',
    '2025-11-10 09:30:00+00',
    now(), now()
);
 
-- -------------------------------------------------------------
-- 5. Allergies
--    - Penicillin (Severe)
--    - Shellfish (Moderate)
-- -------------------------------------------------------------
INSERT INTO patient_allergies (
    id, patient_id,
    allergen_name, severity, reaction_description,
    diagnosed_by, diagnosed_date,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000010',
    'Penicillin',
    'SEVERE',
    'Anaphylactic reaction. Patient experienced throat swelling, hives, and drop in blood pressure within 15 minutes of administration.',
    '00000000-0000-0000-0000-000000000011',
    '2018-06-01',
    now(), now()
);
 
INSERT INTO patient_allergies (
    id, patient_id,
    allergen_name, severity, reaction_description,
    diagnosed_by, diagnosed_date,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000010',
    'Shellfish',
    'MODERATE',
    'Skin rash, itching, and mild swelling of lips. No respiratory involvement observed.',
    '00000000-0000-0000-0000-000000000011',
    '2020-03-14',
    now(), now()
);
 
-- -------------------------------------------------------------
-- 6. Emergency Contacts
--    - Primary: Husband
--    - Secondary: Sister
-- -------------------------------------------------------------
INSERT INTO patient_emergency_contacts (
    id, patient_id,
    contact_name, phone_number, relationship, is_primary,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000060',
    '00000000-0000-0000-0000-000000000010',
    'Omar Ahmed Jenkins',
    '01098887766',
    'SPOUSE',
    TRUE,
    now(), now()
);
 
INSERT INTO patient_emergency_contacts (
    id, patient_id,
    contact_name, phone_number, relationship, is_primary,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000061',
    '00000000-0000-0000-0000-000000000010',
    'Nour Ahmed Hassan',
    '01155443322',
    'SIBLING',
    FALSE,
    now(), now()
);

-- -------------------------------------------------------------
-- 7. Medical Order
--    - Seeded so MEDICAL_ORDER reminders have a real source
-- -------------------------------------------------------------
INSERT INTO medical_orders (
    id, encounter_id, patient_id, ordered_by_hcp_id,
    order_type, order_status,
    ordered_at, completed_at,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000070',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011',
    'LABORATORY',
    'PENDING',
    '2026-06-10 10:00:00+00',
    NULL,
    now(), now()
);

INSERT INTO lab_orders (
    medical_order_id, test_type_id, specimen_type_id,
    fasting_required, priority, clinical_indication
) VALUES (
    '00000000-0000-0000-0000-000000000070',
    10,
    1,
    TRUE,
    'ROUTINE',
    'Monitor HbA1c after the initial diabetes diagnosis and metformin start.'
);

INSERT INTO medical_orders (
    id, encounter_id, patient_id, ordered_by_hcp_id,
    order_type, order_status,
    ordered_at, completed_at,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011',
    'IMAGING',
    'PENDING',
    '2026-06-11 14:00:00+00',
    NULL,
    now(), now()
);

INSERT INTO imaging_orders (
    medical_order_id, imaging_type_id, body_part_id,
    contrast_used, priority, clinical_indication
) VALUES (
    '00000000-0000-0000-0000-000000000071',
    3,
    3,
    FALSE,
    'ROUTINE',
    'Evaluate new-onset headaches with associated visual disturbances.'
);

-- -------------------------------------------------------------
-- 8. Reminders
--    - One for each reminder type
-- -------------------------------------------------------------
INSERT INTO reminders (
    id, patient_id, reminder_type,
    encounter_id, starts_at, appointment_at,
    is_active, dismissed_at,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000080',
    '00000000-0000-0000-0000-000000000010',
    'APPOINTMENT',
    '00000000-0000-0000-0000-000000000020',
    '2026-06-15',
    '2026-06-15 09:00:00+00',
    TRUE,
    NULL,
    now(), now()
);

INSERT INTO reminders (
    id, patient_id, reminder_type,
    medication_id, starts_at, ends_at,
    reminder_time, custom_days,
    is_active, dismissed_at,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000081',
    '00000000-0000-0000-0000-000000000010',
    'MEDICATION',
    '00000000-0000-0000-0000-000000000040',
    '2025-11-10',
    NULL,
    '09:00:00',
    NULL,
    TRUE,
    NULL,
    now(), now()
);

INSERT INTO reminders (
    id, patient_id, reminder_type,
    medical_order_id, starts_at,
    reminder_time, custom_days,
    is_active, dismissed_at,
    created_at, updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000082',
    '00000000-0000-0000-0000-000000000010',
    'MEDICAL_ORDER',
    '00000000-0000-0000-0000-000000000070',
    '2026-06-10',
    '09:00:00',
    NULL,
    TRUE,
    NULL,
    now(), now()
);

-- -------------------------------------------------------------
-- 9. Notifications
--    - Covers SYSTEM and REMINDER notification types
-- -------------------------------------------------------------
INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000090',
    '00000000-0000-0000-0000-000000000002',
    'SYSTEM',
    'SENT',
    'Account Access',
    'Dr. Khaled Mohamed Mostafa accessed your account with read only access',
    NULL,
    '2026-06-09 10:00:00+00',
    '2026-06-09 10:00:00+00',
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000091',
    '00000000-0000-0000-0000-000000000002',
    'SYSTEM',
    'SENT',
    'New Encounter Added',
    'Dr. Khaled Mohamed Mostafa added a new encounter to your medical history',
    NULL,
    '2026-06-09 10:05:00+00',
    '2026-06-09 10:05:00+00',
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000096',
    '00000000-0000-0000-0000-000000000002',
    'SYSTEM',
    'PENDING',
    'Account Access',
    'Dr. Khaled Mohamed Mostafa accessed your account with read only access',
    NULL,
    '2026-06-10 08:00:00+00',
    NULL,
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000097',
    '00000000-0000-0000-0000-000000000002',
    'SYSTEM',
    'PENDING',
    'New Encounter Added',
    'Dr. Khaled Mohamed Mostafa added a new encounter to your medical history',
    NULL,
    '2026-06-10 08:05:00+00',
    NULL,
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000094',
    '00000000-0000-0000-0000-000000000002',
    'REMINDER',
    'PENDING',
    'Upcoming Appointment',
    'You have an appointment with Dr. Khaled Mohamed Mostafa tomorrow at 9:00 AM',
    '00000000-0000-0000-0000-000000000081',
    '2026-06-10 09:00:00+00',
    NULL,
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000095',
    '00000000-0000-0000-0000-000000000002',
    'REMINDER',
    'PENDING',
    'Appointment Soon',
    'Your appointment with Dr. Khaled Mohamed Mostafa is in 1 hour',
    '00000000-0000-0000-0000-000000000080',
    '2026-06-10 11:00:00+00',
    NULL,
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000092',
    '00000000-0000-0000-0000-000000000002',
    'REMINDER',
    'PENDING',
    'Upcoming Appointment',
    'You have an appointment with Dr. Khaled Mohamed Mostafa tomorrow at 9:00 AM',
    '00000000-0000-0000-0000-000000000080',
    '2026-06-14 09:00:00+00',
    NULL,
    NULL,
    now()
);

INSERT INTO notifications (
    id, user_id, notification_type, status,
    title, message, reminder_id,
    scheduled_for, sent_at, read_at,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000093',
    '00000000-0000-0000-0000-000000000002',
    'REMINDER',
    'PENDING',
    'Appointment Soon',
    'Your appointment with Dr. Khaled Mohamed Mostafa is in 1 hour',
    '00000000-0000-0000-0000-000000000080',
    '2026-06-15 08:00:00+00',
    NULL,
    NULL,
    now()
);
