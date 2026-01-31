------------------------------
--------- EXTENSIONS ---------
------------------------------
CREATE EXTENSION IF NOT EXISTS citext; -- case insensitvity

=======================================
------------------------------
---- CUSTOM TYPES (ENUMS) ----
------------------------------
CREATE TYPE user_role AS ENUM ('PATIENT','HEALTHCARE_PROVIDER','LAB','IMAGING_CENTER','ADMIN');
CREATE TYPE account_status AS ENUM ('PENDING','VERIFIED','REJECTED','SUSPENDED','DEACTIVATED');
CREATE TYPE mfa_method AS ENUM ('NONE', 'EMAIL_OTP', 'SMS_OTP', 'TOTP');
CREATE TYPE gender AS ENUM ('MALE','FEMALE');--
CREATE TYPE blood_type AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN');
CREATE TYPE emergency_contact_relationship AS ENUM ('PARENT', 'SPOUSE', 'SIBLING', 'FRIEND', 'CAREGIVER', 'OTHER');
CREATE TYPE allergy_severity AS ENUM ('MILD','MODERATE','SEVERE','LIFE_THREATENING');
CREATE TYPE test_priority AS ENUM ('HIGH', 'MEDIUM', 'LOW');--
CREATE TYPE access_type AS ENUM ('READ_ONLY','WRITE_ONLY', 'READ_WRITE');
CREATE TYPE access_status AS ENUM ('ACTIVE','EXPIRED','REVOKED');
CREATE TYPE order_type AS ENUM ('LABORATORY','IMAGING');
CREATE TYPE order_status AS ENUM ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED');
CREATE TYPE medication_form AS ENUM ('TABLET','CAPSULE','LIQUID','INJECTION','TOPICAL','INHALER','DROPS','PATCH','OTHER');
CREATE TYPE diagnosis_status AS ENUM ('ACTIVE','RESOLVED_BY_HCP','RESOLVED_BY_PATIENT');
CREATE TYPE patient_outcome AS ENUM ('FULLY_RECOVERED','IMPROVED','NO_CHANGE','WORSE');
CREATE TYPE notification_type AS ENUM ('MEDICATION_REMINDER','APPOINTMENT_REMINDER','MEDICAL_ORDER', 'FOLLOW_UP','SYSTEM');
CREATE TYPE notification_status AS ENUM ('PENDING','SENT','READ');
CREATE TYPE file_type AS ENUM ('NATIONAL_ID_FRONT','NATIONAL_ID_BACK','SELFIE_WITH_ID','MEDICAL_LICENSE',
                                    'WORKPLACE_DOC', 'LAB_ACCREDITATION','RADIOLOGY_ACCREDITATION', 'LOGO',
                                    'PRESCRIPTION','LAB_RESULT','IMAGING_RESULT','CLINICAL_ATTACHMENT','PROFILE_PICTURE', 'OTHER');
------------------------------
------ USERS & PROFILES ------
------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email CITEXT NOT NULL UNIQUE,
    phone_number VARCHAR(20) CHECK (phone_number ~ '^[0-9]{11}$'),
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    account_status account_status DEFAULT 'PENDING',
    email_verified BOOLEAN,
    mfa_method mfa_method NOT NULL DEFAULT 'NONE',
    mfa_secret TEXT, --only for TOTP MFA

    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id),
    rejection_reason TEXT,

    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    failed_login_attempts INT,
    locked_until TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    surname VARCHAR(100),
    gender gender,
    date_of_birth DATE,
    national_id VARCHAR(50) CHECK (national_id ~ '^[0-9]{14}$'),
    blood_type blood_type,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE healthcare_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    surname VARCHAR(100),
    gender gender,
    date_of_birth DATE,
    national_id VARCHAR(50) CHECK (national_id ~ '^[0-9]{14}$'),
    medical_license_number VARCHAR(100),
    specialization VARCHAR(100),

    workplace_name VARCHAR(300),
    workplace_address TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);


CREATE TABLE laboratories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    lab_name VARCHAR(300),
    registration_number VARCHAR(100),
    administrator_full_name VARCHAR(300),

    lab_address TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE imaging_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),

    center_name VARCHAR(300),
    registration_number VARCHAR(100),
    administrator_full_name VARCHAR(300),

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

    contact_name VARCHAR(200),
    phone_number VARCHAR(20),
    relationship emergency_contact_relationship,
    is_primary BOOLEAN,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE patient_chronic_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),

    icd11_code VARCHAR(20),
    icd11_title VARCHAR(500),
    notes TEXT,

    diagnosed_by UUID REFERENCES healthcare_providers(id),
    diagnosed_date DATE,

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
    symptoms_complaints TEXT,
    next_appointment_date TIMESTAMP WITH TIME ZONE,
    appointment_notes TEXT,

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
    diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,

    note_date DATE NOT NULL,
    patient_outcome patient_outcome,
    patient_outcome_details TEXT,
    mood VARCHAR(50),
    pain_level SMALLINT CHECK (pain_level BETWEEN 0 AND 10),
    energy_level SMALLINT CHECK (energy_level BETWEEN 0 AND 10),


    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX idx_health_notes_patient_date
ON patient_health_notes(patient_id, note_date);

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID REFERENCES clinical_encounters(id),
    patient_id UUID REFERENCES patients(id),
    diagnosis_id UUID REFERENCES diagnoses(id),
    prescribed_by_hcp_id UUID REFERENCES healthcare_providers(id),

    medication_name VARCHAR(500),
    dosage VARCHAR(200),
    form medication_form,
    frequency VARCHAR(200),
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
    
    lab_test_id UUID REFERENCES lab_tests(id),
    specimen_type VARCHAR(100),
    fasting_required BOOLEAN,
    priority test_priority,
    clinical_indication TEXT,
    special_instructions TEXT
);

CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,   -- e.g., "CBC", "LFT", "CRP"
    name VARCHAR(200) NOT NULL,         -- e.g., "Complete Blood Count", "Liver Function Test"
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
    
    imaging_type_id UUID REFERENCES imaging_modalities(id),
    body_part_id UUID REFERENCES body_parts(id),
    contrast_used BOOLEAN,
    priority test_priority,
    clinical_indication TEXT,
    special_instructions TEXT
);

CREATE TABLE imaging_modalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,  -- e.g., "X-Ray", "MRI", "CT Scan", "Ultrasound"
);

CREATE TABLE body_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,  -- e.g., "Chest", "Brain", "Abdomen", "Knee"
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

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    notification_type notification_type,
    status notification_status,
    title VARCHAR(500),
    message TEXT,
    related_encounter_id UUID REFERENCES clinical_encounters(id),
    related_medication_id UUID REFERENCES medications(id),
    related_order_id UUID REFERENCES medical_orders(id),
    related_diagnosis_id UUID REFERENCES diagnoses(id),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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
    login_session_id UUID REFERENCES login_sessions(id),
    register_session_id UUID REFERENCES registration_sessions(id),
    password_reset_session_id UUID REFERENCES password_reset_sessions(id),

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
    parent_token_id UUID REFERENCES refresh_tokens(id), -- for rotation chains

    issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,

    issued_ip INET,
    user_agent TEXT
);


CREATE TABLE patient_access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    issued_by_user_id UUID NOT NULL REFERENCES users(id), -- should always be the patient user

    code_hash VARCHAR(255) NOT NULL UNIQUE, -- hash the 8-digit code
    access_type access_type NOT NULL,
    status access_status NOT NULL DEFAULT 'ACTIVE',

    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE patient_access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    access_code_id UUID NOT NULL REFERENCES patient_access_codes(id) ON DELETE CASCADE,
    grantee_user_id UUID NOT NULL REFERENCES users(id),

    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    revoked_at TIMESTAMP WITH TIME ZONE,

    UNIQUE (access_code_id, grantee_user_id)
);