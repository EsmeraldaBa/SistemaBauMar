-- Sustituye el ENUM legado por la llave foránea al catálogo común de estados.
SET NAMES utf8mb4;
USE baumar;
ALTER TABLE users DROP INDEX idx_users_status_created;
ALTER TABLE users ADD COLUMN status_id CHAR(36) NULL AFTER password_hash;
UPDATE users u JOIN statuses s ON s.status_key=CASE WHEN u.status='disabled' THEN 'inactive' ELSE u.status END
  SET u.status_id=s.status_id;
UPDATE users SET status_id='0199b200-0000-7000-8000-000000000001' WHERE status_id IS NULL;
ALTER TABLE users MODIFY status_id CHAR(36) NOT NULL;
ALTER TABLE users DROP COLUMN status;
ALTER TABLE users ADD CONSTRAINT fk_users_status FOREIGN KEY(status_id) REFERENCES statuses(status_id);
ALTER TABLE users ADD INDEX idx_users_status_created(status_id,created_at);
