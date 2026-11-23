-- Migración 005: Agrega estado suspendido, columna status_id a roles y datos detallados de contacto y domicilio a customers.
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

INSERT INTO statuses (status_id, status_key, status_name)
SELECT '0199b200-0000-7000-8000-000000000004', 'suspended', 'Suspendido'
WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE status_key = 'suspended');

-- Asegura status_id en roles
SET @has_status_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'status_id');
SET @alter_roles = IF(@has_status_col = 0, 'ALTER TABLE roles ADD COLUMN status_id CHAR(36) NOT NULL DEFAULT "0199b200-0000-7000-8000-000000000001" AFTER is_system, ADD CONSTRAINT fk_roles_status FOREIGN KEY (status_id) REFERENCES statuses(status_id);', 'SELECT 1;');
PREPARE stmt FROM @alter_roles;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Asegura campos detallados en customers
SET @has_fn_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'first_name');
SET @alter_cust = IF(@has_fn_col = 0, 'ALTER TABLE customers ADD COLUMN first_name VARCHAR(80) NULL AFTER customer_name, ADD COLUMN last_name VARCHAR(80) NULL AFTER first_name, ADD COLUMN personal_phone VARCHAR(20) NULL AFTER contact_phone, ADD COLUMN work_phone VARCHAR(20) NULL AFTER personal_phone, ADD COLUMN alternative_contact_name VARCHAR(160) NULL AFTER work_phone, ADD COLUMN alternative_contact_phone VARCHAR(20) NULL AFTER alternative_contact_name, ADD COLUMN street VARCHAR(120) NULL AFTER address, ADD COLUMN street_number VARCHAR(20) NULL AFTER street, ADD COLUMN neighborhood VARCHAR(100) NULL AFTER street_number, ADD COLUMN postal_code CHAR(5) NULL AFTER neighborhood, ADD COLUMN municipality VARCHAR(100) NULL AFTER postal_code, ADD COLUMN state VARCHAR(100) NULL AFTER municipality;', 'SELECT 1;');
PREPARE stmt_c FROM @alter_cust;
EXECUTE stmt_c;
DEALLOCATE PREPARE stmt_c;
