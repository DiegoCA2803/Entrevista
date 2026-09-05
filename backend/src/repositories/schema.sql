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
