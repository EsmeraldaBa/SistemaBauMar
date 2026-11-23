const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

/** Adapter HTTP que traduce llamadas del frontend a fetch/JSON REST y errores de la API a errores de interfaz. */
export class HttpAdapter {
  constructor(baseUrl = API_BASE) {
    const configuredBase = String(baseUrl).trim();
    // Render supplies an HTTPS service URL; local Vite continues using the relative /api proxy.
    const absoluteBase = /^https?:\/\//i.test(configuredBase)
      ? configuredBase
      : configuredBase.startsWith('/')
        ? configuredBase
        : `https://${configuredBase}`;
    const normalizedBase = absoluteBase.replace(/\/+$/, '');
    this.baseUrl = `${normalizedBase}${/^https?:\/\//i.test(absoluteBase) && !/\/api$/i.test(normalizedBase) ? '/api' : ''}`;
    this.token = null;
  }
  setToken(token) { this.token = token || null; }

  /** Ejecuta una operación REST y devuelve el JSON tipado; incluye bearer si hay sesión y conserva el folio de error. */
  async request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error('No se pudo conectar con BauMar. Revisa que la API esté en ejecución.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`${data.message || `La solicitud falló (${response.status}).`}${data.requestId ? ` Folio: ${data.requestId}` : ''}`);
      error.status = response.status;
      error.details = data.details || {};
      throw error;
    }
    return data;
  }
  get(path) { return this.request(path); }
  post(path, body) { return this.request(path, { method: 'POST', body }); }
  patch(path, body) { return this.request(path, { method: 'PATCH', body }); }
  delete(path) { return this.request(path, { method: 'DELETE' }); }
}

export const httpAdapter = new HttpAdapter();
