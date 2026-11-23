import { httpAdapter } from '../adapters/httpAdapter.js';

/** Operaciones REST de autenticación delegadas al Adapter HTTP. */
export const authService = {
  setupStatus: () => httpAdapter.get('/auth/setup-status'),
  setupAdministrator: (data) => httpAdapter.post('/auth/setup-administrator', data),
  register: (data) => httpAdapter.post('/auth/register', data),
  login: (data) => httpAdapter.post('/auth/login', data),
  me: () => httpAdapter.get('/auth/me'),
  forgotPassword: (data) => httpAdapter.post('/auth/forgot-password', data),
  resetPassword: (data) => httpAdapter.post('/auth/reset-password', data),
};
