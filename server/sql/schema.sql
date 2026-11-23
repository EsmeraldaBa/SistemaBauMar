SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE DATABASE IF NOT EXISTS baumar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE baumar;

CREATE TABLE IF NOT EXISTS statuses (
  status_id CHAR(36) NOT NULL PRIMARY KEY,
  status_key VARCHAR(20) NOT NULL UNIQUE,
  status_name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT IGNORE INTO statuses(status_id,status_key,status_name) VALUES
('0199b200-0000-7000-8000-000000000001','active','Activo'),
('0199b200-0000-7000-8000-000000000002','inactive','Inactivo'),
('0199b200-0000-7000-8000-000000000003','deleted','Eliminado'),
('0199b200-0000-7000-8000-000000000004','suspended','Suspendido');

CREATE TABLE IF NOT EXISTS users (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  email VARCHAR(190) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  status_id CHAR(36) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_username UNIQUE (username),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT fk_users_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  INDEX idx_users_status_created (status_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  role_id CHAR(36) NOT NULL PRIMARY KEY,
  role_key VARCHAR(40) NOT NULL,
  role_name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  status_id CHAR(36) NOT NULL DEFAULT '0199b200-0000-7000-8000-000000000001',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_key UNIQUE (role_key),
  CONSTRAINT uq_roles_name UNIQUE (role_name),
  CONSTRAINT fk_roles_status FOREIGN KEY(status_id) REFERENCES statuses(status_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  assignment_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_role UNIQUE (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_actor FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_user_roles_role (role_id)
) ENGINE=InnoDB;

-- Perfiles creados por Factory Method al asignar un rol. Todos los IDs son UUIDv7.
CREATE TABLE IF NOT EXISTS owner_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  workshop_name VARCHAR(120) NOT NULL DEFAULT 'BauMar',
  CONSTRAINT fk_owner_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS receptionist_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  shift_name VARCHAR(60) NULL,
  CONSTRAINT fk_receptionist_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS advisor_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  employee_code VARCHAR(40) NULL,
  CONSTRAINT fk_advisor_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS technician_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  specialty VARCHAR(100) NULL,
  CONSTRAINT fk_technician_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customer_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  CONSTRAINT fk_customer_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS system_profiles (
  profile_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  service_name VARCHAR(100) NOT NULL DEFAULT 'BauMar',
  CONSTRAINT fk_system_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  reset_id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_password_reset_user_expiry (user_id, expires_at)
) ENGINE=InnoDB;

-- Catálogo inicial. Crear roles no los asigna a usuarios.
INSERT IGNORE INTO roles (role_id, role_key, role_name, description, is_system) VALUES
('0199a100-0000-7000-8000-000000000001','administrator','Administrador / dueño','Administra usuarios, roles y permisos.',TRUE),
('0199a100-0000-7000-8000-000000000002','receptionist','Recepcionista','Atención y recepción de vehículos.',TRUE),
('0199a100-0000-7000-8000-000000000003','service_advisor','Asesor de servicio','Asesora al cliente y coordina el servicio.',TRUE),
('0199a100-0000-7000-8000-000000000004','technician','Técnico','Realiza diagnóstico y reparación.',TRUE),
('0199a100-0000-7000-8000-000000000005','customer','Cliente','Usuario cliente del taller.',TRUE),
('0199a100-0000-7000-8000-000000000006','system','Sistema','Identidad de servicio del sistema.',TRUE);

-- Extensión futura: vehicles, services, service_orders, appointments y audit_logs.
-- Todas sus llaves deberán ser CHAR(36) UUIDv7 con relaciones mediante llaves foráneas.

-- Catálogo común de estados para entidades operativas (UUIDv7 estables).
INSERT IGNORE INTO statuses(status_id,status_key,status_name) VALUES
('0199b200-0000-7000-8000-000000000001','active','Activo'),
('0199b200-0000-7000-8000-000000000002','inactive','Inactivo'),
('0199b200-0000-7000-8000-000000000003','deleted','Eliminado'),
('0199b200-0000-7000-8000-000000000004','suspended','Suspendido');

CREATE TABLE IF NOT EXISTS workshops (
  workshop_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL,
  rfc VARCHAR(13) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  photo_path VARCHAR(255) NOT NULL,
  street VARCHAR(120) NOT NULL,
  street_number VARCHAR(20) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  postal_code CHAR(5) NOT NULL,
  municipality VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  status_id CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_workshop_name UNIQUE(normalized_name),
  CONSTRAINT uq_workshop_rfc UNIQUE(rfc),
  CONSTRAINT fk_workshop_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  CONSTRAINT fk_workshop_creator FOREIGN KEY(created_by) REFERENCES users(user_id),
  INDEX idx_workshops_location(state,municipality,postal_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  customer_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  customer_name VARCHAR(160) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  first_name VARCHAR(80) NULL,
  last_name VARCHAR(80) NULL,
  personal_phone VARCHAR(20) NULL,
  work_phone VARCHAR(20) NULL,
  alternative_contact_name VARCHAR(160) NULL,
  alternative_contact_phone VARCHAR(20) NULL,
  email VARCHAR(190) NOT NULL,
  address VARCHAR(255) NOT NULL,
  street VARCHAR(120) NULL,
  street_number VARCHAR(20) NULL,
  neighborhood VARCHAR(100) NULL,
  postal_code CHAR(5) NULL,
  municipality VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  status_id CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_customer_email_global UNIQUE(email),
  CONSTRAINT uq_customer_portal_user UNIQUE(user_id),
  CONSTRAINT fk_customer_workshop FOREIGN KEY(workshop_id) REFERENCES workshops(workshop_id),
  CONSTRAINT fk_customer_user FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_customer_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  CONSTRAINT fk_customer_creator FOREIGN KEY(created_by) REFERENCES users(user_id),
  INDEX idx_customers_name(customer_name)
) ENGINE=InnoDB;

-- Una visita es un ingreso real al taller; el contador administrativo se deriva de este historial.
CREATE TABLE IF NOT EXISTS workshop_visits (
  visit_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_id CHAR(36) NOT NULL,
  customer_id CHAR(36) NOT NULL,
  vehicle_description VARCHAR(160) NULL,
  visit_note VARCHAR(500) NULL,
  visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registered_by CHAR(36) NOT NULL,
  CONSTRAINT fk_visit_workshop FOREIGN KEY(workshop_id) REFERENCES workshops(workshop_id),
  CONSTRAINT fk_visit_customer FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
  CONSTRAINT fk_visit_registrar FOREIGN KEY(registered_by) REFERENCES users(user_id),
  INDEX idx_visits_workshop_time(workshop_id,visited_at),
  INDEX idx_visits_customer_time(customer_id,visited_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_id CHAR(36) NOT NULL,
  customer_id CHAR(36) NULL,
  make VARCHAR(60) NOT NULL,
  model VARCHAR(80) NOT NULL,
  model_year SMALLINT UNSIGNED NULL,
  plate VARCHAR(12) NOT NULL,
  vin CHAR(17) NULL,
  version VARCHAR(80) NOT NULL DEFAULT '',
  color VARCHAR(50) NOT NULL DEFAULT 'Sin especificar',
  mileage INT UNSIGNED NULL,
  status_id CHAR(36) NOT NULL,
  assigned_technician_user_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vehicle_plate UNIQUE(plate),
  CONSTRAINT uq_vehicle_vin UNIQUE(vin),
  CONSTRAINT fk_vehicle_workshop FOREIGN KEY(workshop_id) REFERENCES workshops(workshop_id),
  CONSTRAINT fk_vehicle_customer FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
  CONSTRAINT fk_vehicle_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  CONSTRAINT fk_vehicle_technician FOREIGN KEY(assigned_technician_user_id) REFERENCES users(user_id),
  INDEX idx_vehicles_customer(customer_id)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS vehicle_status_updates (
  update_id CHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id CHAR(36) NOT NULL,
  status_key ENUM('diagnostico','esperando_autorizacion','en_reparacion','esperando_refacciones','listo','entregado') NOT NULL,
  condition_summary VARCHAR(500) NOT NULL,
  pending_work VARCHAR(500) NOT NULL DEFAULT '',
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_update_vehicle FOREIGN KEY(vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_update_user FOREIGN KEY(updated_by) REFERENCES users(user_id),
  INDEX idx_vehicle_updates_latest(vehicle_id,created_at)
) ENGINE=InnoDB;
