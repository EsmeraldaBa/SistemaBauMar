-- Migración 006: registro independiente de automóviles, fotos y vinculación posterior de clientes.
-- Antes de aplicar, ejecutar estas consultas y resolver sus resultados sin borrar información:
-- SELECT UPPER(REGEXP_REPLACE(plate,'[^A-Za-z0-9]','')) AS placa,COUNT(*) n FROM vehicles GROUP BY placa HAVING n>1;
-- SELECT LOWER(email) AS correo,COUNT(*) n FROM customers GROUP BY correo HAVING n>1;
-- La migración es reanudable: cada DDL comprueba el esquema para recuperarse de fallos parciales.
SET NAMES utf8mb4;

-- El cliente se asocia después del registro del vehículo.
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND CONSTRAINT_NAME='fk_vehicle_customer'), 'ALTER TABLE vehicles DROP FOREIGN KEY fk_vehicle_customer', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
ALTER TABLE vehicles MODIFY customer_id CHAR(36) NULL;

-- Añade únicamente las columnas ausentes para permitir reanudar la migración.
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='vin'), 'ALTER TABLE vehicles ADD COLUMN vin CHAR(17) NULL AFTER plate', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='version'), 'ALTER TABLE vehicles ADD COLUMN version VARCHAR(80) NOT NULL DEFAULT \'\' AFTER model_year', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='color'), 'ALTER TABLE vehicles ADD COLUMN color VARCHAR(50) NOT NULL DEFAULT \'Sin especificar\' AFTER version', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='mileage'), 'ALTER TABLE vehicles ADD COLUMN mileage INT UNSIGNED NULL AFTER color', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='status_id'), 'ALTER TABLE vehicles ADD COLUMN status_id CHAR(36) NOT NULL DEFAULT \'0199b200-0000-7000-8000-000000000001\' AFTER mileage', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME='assigned_technician_user_id'), 'ALTER TABLE vehicles ADD COLUMN assigned_technician_user_id CHAR(36) NULL AFTER status_id', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

-- Mantiene el soporte de fk_vehicle_workshop antes de retirar el índice compuesto.
UPDATE vehicles SET plate=UPPER(REGEXP_REPLACE(plate,'[^A-Za-z0-9]',''));
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND INDEX_NAME='idx_vehicles_workshop'), 'ALTER TABLE vehicles ADD INDEX idx_vehicles_workshop(workshop_id)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND INDEX_NAME='uq_vehicle_plate_per_workshop'), 'ALTER TABLE vehicles DROP INDEX uq_vehicle_plate_per_workshop', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND INDEX_NAME='uq_vehicle_plate'), 'ALTER TABLE vehicles ADD CONSTRAINT uq_vehicle_plate UNIQUE(plate)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND INDEX_NAME='uq_vehicle_vin'), 'ALTER TABLE vehicles ADD CONSTRAINT uq_vehicle_vin UNIQUE(vin)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND CONSTRAINT_NAME='fk_vehicle_status'), 'ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_status FOREIGN KEY(status_id) REFERENCES statuses(status_id)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND CONSTRAINT_NAME='fk_vehicle_technician'), 'ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_technician FOREIGN KEY(assigned_technician_user_id) REFERENCES users(user_id)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND CONSTRAINT_NAME='fk_vehicle_customer'), 'ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_customer FOREIGN KEY(customer_id) REFERENCES customers(customer_id)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

CREATE TABLE IF NOT EXISTS vehicle_photos (
  photo_id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NOT NULL,
  photo_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(32) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_photo_vehicle FOREIGN KEY(vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_photo_creator FOREIGN KEY(created_by) REFERENCES users(user_id),
  INDEX idx_vehicle_photos_vehicle(vehicle_id)
) ENGINE=InnoDB;

-- Correos únicos globalmente; consulta previa incluida arriba para evitar conflictos.
-- Conserva el índice que soporta fk_customer_workshop antes de retirar el índice compuesto.
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND INDEX_NAME='idx_customers_workshop'), 'ALTER TABLE customers ADD INDEX idx_customers_workshop(workshop_id)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND INDEX_NAME='uq_customer_email_per_workshop'), 'ALTER TABLE customers DROP INDEX uq_customer_email_per_workshop', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
SET @ddl = IF(NOT EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND INDEX_NAME='uq_customer_email_global'), 'ALTER TABLE customers ADD CONSTRAINT uq_customer_email_global UNIQUE(email)', 'SELECT 1');
PREPARE migration_stmt FROM @ddl; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
