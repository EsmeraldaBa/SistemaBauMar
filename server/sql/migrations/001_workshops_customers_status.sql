-- Migración aditiva para instalaciones iniciadas antes de la fase de talleres/clientes.
SET NAMES utf8mb4;
USE baumar;
CREATE TABLE IF NOT EXISTS statuses (
  status_id CHAR(36) NOT NULL PRIMARY KEY,
  status_key VARCHAR(20) NOT NULL UNIQUE,
  status_name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;
INSERT IGNORE INTO statuses(status_id,status_key,status_name) VALUES
('0199b200-0000-7000-8000-000000000001','active','Activo'),
('0199b200-0000-7000-8000-000000000002','inactive','Inactivo'),
('0199b200-0000-7000-8000-000000000003','deleted','Eliminado');
ALTER TABLE users MODIFY status VARCHAR(20) NOT NULL DEFAULT 'active';
UPDATE users SET status='inactive' WHERE status='disabled';
ALTER TABLE users MODIFY status ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS workshops (
  workshop_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL UNIQUE,
  rfc VARCHAR(13) NOT NULL UNIQUE,
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
  CONSTRAINT fk_workshop_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  CONSTRAINT fk_workshop_creator FOREIGN KEY(created_by) REFERENCES users(user_id),
  INDEX idx_workshops_location(state,municipality,postal_code)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customers (
  customer_id CHAR(36) NOT NULL PRIMARY KEY,
  workshop_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL UNIQUE,
  customer_name VARCHAR(160) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  email VARCHAR(190) NOT NULL,
  address VARCHAR(255) NOT NULL,
  status_id CHAR(36) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_customer_email_per_workshop UNIQUE(workshop_id,email),
  CONSTRAINT fk_customer_workshop FOREIGN KEY(workshop_id) REFERENCES workshops(workshop_id),
  CONSTRAINT fk_customer_user FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_customer_status FOREIGN KEY(status_id) REFERENCES statuses(status_id),
  CONSTRAINT fk_customer_creator FOREIGN KEY(created_by) REFERENCES users(user_id),
  INDEX idx_customers_name(customer_name)
) ENGINE=InnoDB;
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
  customer_id CHAR(36) NOT NULL,
  make VARCHAR(60) NOT NULL,
  model VARCHAR(80) NOT NULL,
  model_year SMALLINT UNSIGNED NULL,
  plate VARCHAR(12) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vehicle_plate_per_workshop UNIQUE(workshop_id,plate),
  CONSTRAINT fk_vehicle_workshop FOREIGN KEY(workshop_id) REFERENCES workshops(workshop_id),
  CONSTRAINT fk_vehicle_customer FOREIGN KEY(customer_id) REFERENCES customers(customer_id),
  INDEX idx_vehicles_customer(customer_id)
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
