import { uuidv7 } from '../utils/uuidv7.js';

/** Perfil mínimo específico de un dueño. */
class OwnerProfile {
  constructor() { this.table = 'owner_profiles'; this.extraColumn = 'workshop_name'; }
  values() { return ['BauMar']; }
}
/** Perfil mínimo específico de recepción. */
class ReceptionistProfile {
  constructor() { this.table = 'receptionist_profiles'; this.extraColumn = 'shift_name'; }
  values(metadata = {}) { return [metadata.shiftName || null]; }
}
/** Perfil mínimo específico de asesor de servicio. */
class AdvisorProfile {
  constructor() { this.table = 'advisor_profiles'; this.extraColumn = 'employee_code'; }
  values(metadata = {}) { return [metadata.employeeCode || null]; }
}
/** Perfil mínimo específico de técnico. */
class TechnicianProfile {
  constructor() { this.table = 'technician_profiles'; this.extraColumn = 'specialty'; }
  values(metadata = {}) { return [metadata.specialty || null]; }
}
/** Perfil de cliente; el CRUD de clientes se incorpora en una fase futura. */
class CustomerProfile {
  constructor() { this.table = 'customer_profiles'; this.extraColumn = null; }
  values() { return []; }
}
/** Perfil no humano usado para identidades de procesos internos. */
class SystemProfile {
  constructor() { this.table = 'system_profiles'; this.extraColumn = 'service_name'; }
  values() { return ['BauMar']; }
}

const profileConstructors = {
  administrator: OwnerProfile,
  receptionist: ReceptionistProfile,
  service_advisor: AdvisorProfile,
  technician: TechnicianProfile,
  customer: CustomerProfile,
  system: SystemProfile,
};

/**
 * Factory Method que crea el perfil concreto de un usuario según la llave del rol.
 * Resuelve la selección de tablas y datos de perfil en un solo punto extensible.
 * @param {string} roleKey llave estable del rol consultada en MySQL.
 * @param {string} userId UUIDv7 de la cuenta asociada.
 * @param {object} [metadata] datos opcionales del perfil (turno, especialidad, etc.).
 * @returns {{profileId:string,userId:string,table:string,extraColumn:string|null,extraValues:unknown[]}|null}
 * @throws {Error} si el rol de sistema no dispone de fábrica de perfil.
 */
export class UserFactory {
  static createProfile(roleKey, userId, metadata = {}) {
    const ProfileType = profileConstructors[roleKey];
    if (!ProfileType) return null; // Roles personalizados no necesitan una tabla de perfil propia.
    const profile = new ProfileType();
    return { profileId: uuidv7(), userId, table: profile.table, extraColumn: profile.extraColumn, extraValues: profile.values(metadata) };
  }
}
