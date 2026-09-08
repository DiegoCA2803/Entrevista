-- Esquema Relacional de Base de Datos para Control de Flota Minera

CREATE TABLE IF NOT EXISTS equipment (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    horometer NUMERIC(10, 2) NOT NULL DEFAULT 0,
    maintenance_interval_hours NUMERIC(10, 2) NOT NULL DEFAULT 250,
    last_maintenance_horometer NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    document_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certifications (
    id VARCHAR(36) PRIMARY KEY,
    operator_id VARCHAR(36) NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    equipment_type VARCHAR(50) NOT NULL,
    issued_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    institution VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    date DATE NOT NULL,
    period VARCHAR(20) NOT NULL,
    planned_duration_hours NUMERIC(5, 2) NOT NULL DEFAULT 8,
    actual_duration_hours NUMERIC(5, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADO',
    closed_at TIMESTAMP,
    closed_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignments (
    id VARCHAR(36) PRIMARY KEY,
    shift_id VARCHAR(36) NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    equipment_id VARCHAR(36) NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    operator_id VARCHAR(36) NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'PROGRAMADA',
    risk_reason TEXT,
    is_override BOOLEAN NOT NULL DEFAULT FALSE,
    override_by VARCHAR(100),
    override_reason TEXT,
    override_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_shift_equipment UNIQUE (shift_id, equipment_id),
    CONSTRAINT uq_shift_operator UNIQUE (shift_id, operator_id)
);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id VARCHAR(36) PRIMARY KEY,
    equipment_id VARCHAR(36) NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    horometer_at_maintenance NUMERIC(10, 2) NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    notes TEXT,
    maintenance_type VARCHAR(30) NOT NULL DEFAULT 'PREVENTIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50) NOT NULL,
    details TEXT NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar búsquedas frecuentes y proyecciones
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_certifications_op_type ON certifications(operator_id, equipment_type);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_assignments_shift ON assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_assignments_equipment ON assignments(equipment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_date_period ON shifts(date, period);
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS uq_shift_equipment;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS uq_shift_operator;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_shift_equipment ON assignments(shift_id,equipment_id) WHERE status<>'CANCELADA';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_shift_operator ON assignments(shift_id,operator_id) WHERE status<>'CANCELADA';
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPERVISOR','CONSULTA')), active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id),
  expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, status_code INTEGER NOT NULL,
  response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY, topic TEXT NOT NULL, payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DELIVERED','DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ, lock_token UUID, last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox_events(status, available_at);

-- A type owns its interval. The equipment value is a constrained snapshot of that policy.
CREATE TABLE IF NOT EXISTS equipment_types (
  type VARCHAR(50) PRIMARY KEY,
  maintenance_interval_hours NUMERIC(10,2) NOT NULL CHECK(maintenance_interval_hours>0),
  UNIQUE(type,maintenance_interval_hours)
);
INSERT INTO equipment_types(type,maintenance_interval_hours) VALUES
 ('CAMION_ACARREO',250),('EXCAVADORA',250),('PERFORADORA',250),('CARGADOR_FRONTAL',250),('TRACTOR_ORUGA',250)
ON CONFLICT(type) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='fk_equipment_type_interval') THEN
    ALTER TABLE equipment ADD CONSTRAINT fk_equipment_type_interval FOREIGN KEY(type,maintenance_interval_hours) REFERENCES equipment_types(type,maintenance_interval_hours);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_equipment_usage') THEN
    ALTER TABLE equipment ADD CONSTRAINT ck_equipment_usage CHECK(horometer>=0 AND last_maintenance_horometer>=0 AND last_maintenance_horometer<=horometer AND maintenance_interval_hours>0);
    ALTER TABLE equipment ADD CONSTRAINT ck_equipment_status CHECK(status IN ('DISPONIBLE','BLOQUEADO','EN_MANTENIMIENTO'));
    ALTER TABLE shifts ADD CONSTRAINT ck_shift_values CHECK(period IN ('DIA','NOCHE') AND planned_duration_hours>0 AND planned_duration_hours<=24 AND (actual_duration_hours IS NULL OR (actual_duration_hours>=0 AND actual_duration_hours<=24)) AND status IN ('PROGRAMADO','EN_CURSO','CERRADO','CANCELADO'));
    ALTER TABLE certifications ADD CONSTRAINT ck_certification_dates CHECK(expiration_date>issued_date);
    ALTER TABLE certifications ADD CONSTRAINT fk_certification_type FOREIGN KEY(equipment_type) REFERENCES equipment_types(type);
    ALTER TABLE assignments ADD CONSTRAINT ck_assignment_status CHECK(status IN ('PROGRAMADA','EN_RIESGO','COMPLETADA','CANCELADA'));
  END IF;
END $$;
