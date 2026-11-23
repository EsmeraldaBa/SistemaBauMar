-- Corrige caracteres y acentos en el catálogo de roles por discrepancia de juego de caracteres inicial.
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
USE baumar;

UPDATE roles
SET role_name = 'Administrador / dueño',
    description = 'Administra usuarios, roles y permisos.'
WHERE role_key = 'administrator';

UPDATE roles
SET role_name = 'Recepcionista',
    description = 'Atención y recepción de vehículos.'
WHERE role_key = 'receptionist';

UPDATE roles
SET role_name = 'Asesor de servicio',
    description = 'Asesora al cliente y coordina el servicio.'
WHERE role_key = 'service_advisor';

UPDATE roles
SET role_name = 'Técnico',
    description = 'Realiza diagnóstico y reparación.'
WHERE role_key = 'technician';

UPDATE roles
SET role_name = 'Cliente',
    description = 'Usuario cliente del taller.'
WHERE role_key = 'customer';

UPDATE roles
SET role_name = 'Sistema',
    description = 'Identidad de servicio del sistema.'
WHERE role_key = 'system';
