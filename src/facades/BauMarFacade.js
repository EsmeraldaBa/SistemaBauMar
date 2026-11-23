import { authService } from '../services/authService.js';
import { adminService } from '../services/adminService.js';
import { httpAdapter } from '../adapters/httpAdapter.js';

/** Facade: ofrece a las vistas un solo punto de entrada que coordina autenticación, token y servicios administrativos. */
export class BauMarFacade {
  performanceMetrics() { return adminService.performanceMetrics(); }
  recordPerformancePage(data) { return adminService.recordPerformancePage(data); }
  async signIn(credentials) {
    const session = await authService.login(credentials);
    httpAdapter.setToken(session.token);
    try { return (await authService.me()).user; }
    catch (error) { httpAdapter.setToken(null); throw error; }
  }
  async restoreSession() {
    try { return (await authService.me()).user; }
    catch (error) { httpAdapter.setToken(null); if (error.status === 401) return null; throw error; }
  }
  async signOut() { httpAdapter.setToken(null); }
  setupStatus() { return authService.setupStatus(); }
  setupAdministrator(data) { return authService.setupAdministrator(data); }
  register(data) { return authService.register(data); }
  forgotPassword(data) { return authService.forgotPassword(data); }
  resetPassword(data) { return authService.resetPassword(data); }
  users() { return adminService.users(); }
  createUser(data) { return adminService.createUser(data); }
  updateUser(id, data) { return adminService.updateUser(id, data); }
  setUserStatus(id, status) { return adminService.setUserStatus(id, status); }
  roles() { return adminService.roles(); }
  createRole(data) { return adminService.createRole(data); }
  updateRole(id, data) { return adminService.updateRole(id, data); }
  setRoleStatus(id, status) { return adminService.setRoleStatus(id, status); }
  assignments() { return adminService.assignments(); }
  assignRole(userId, roleId) { return adminService.assignRole(userId, roleId); }
  removeAssignment(id) { return adminService.removeAssignment(id); }
  workshops() { return adminService.workshops(); }
  uploadWorkshopPhoto(image) { return adminService.uploadWorkshopPhoto(image); }
  createWorkshop(data) { return adminService.createWorkshop(data); }
  setWorkshopStatus(id, status) { return adminService.setWorkshopStatus(id, status); }
  lookupAddress(query) { return adminService.lookupAddress(query); }
  clients(params) { return adminService.clients(params); }
  createClient(data) { return adminService.createClient(data); }
  updateClient(id, data) { return adminService.updateClient(id, data); }
  setClientStatus(id, status) { return adminService.setClientStatus(id, status); }
  visits() { return adminService.visits(); }
  recordVisit(data) { return adminService.recordVisit(data); }
  vehicles() { return adminService.vehicles(); }
  uploadVehiclePhoto(image) { return adminService.uploadVehiclePhoto(image); }
  createVehicle(data) { return adminService.createVehicle(data); }
  updateVehicle(id, data) { return adminService.updateVehicle(id, data); }
  setVehicleStatus(id, status) { return adminService.setVehicleStatus(id, status); }
  associateVehicleClient(id, customerId) { return adminService.associateVehicleClient(id, customerId); }
  setVehicleRepairStatus(id, data) { return adminService.setVehicleRepairStatus(id, data); }
  customerVehicleStatus() { return adminService.customerVehicleStatus(); }
}

export const bauMar = new BauMarFacade();
