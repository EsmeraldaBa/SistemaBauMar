-- Teléfono de contacto para cuentas existentes y nuevas.
-- Nullable para conservar cuentas previas; los formularios nuevos lo validan como obligatorio.
SET NAMES utf8mb4;
USE baumar;
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL AFTER last_name;
