import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const MAX_GROUPS = 100;
const MAX_SAMPLES = 120;
const MAX_PAGE_NAMES = 30;

/**
 * Agrega métricas técnicas acotadas de HTTP, consultas SQL y uso del proceso.
 * No conserva cuerpos, parámetros, usuarios, valores SQL ni datos del taller.
 */
export class PerformanceAnalystAgent {
  constructor({ now = () => Date.now(), memoryUsage = () => process.memoryUsage(), uptime = () => process.uptime(), cpuUsage = () => process.cpuUsage() } = {}) {
    this.now = now;
    this.memoryUsage = memoryUsage;
    this.uptime = uptime;
    this.cpuUsage = cpuUsage;
    this.endpoints = new Map();
    this.queries = new Map();
    this.pages = new Map();
    this.totalRequests = 0;
    this.totalQueries = 0;
  }

  /** Agrega una muestra HTTP por plantilla de ruta para no crear métricas por cada ID. */
  recordRequest(route, durationMs, statusCode) {
    const key = String(route || 'unknown').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0, 160);
    const metric = this.#group(this.endpoints, key);
    this.#record(metric, durationMs);
    metric.statusCounts[statusCode] = (metric.statusCounts[statusCode] || 0) + 1;
    if (statusCode >= 500) metric.serverErrors += 1;
    this.totalRequests += 1;
  }

  /** Mide solo la forma de SQL; los literales se sustituyen antes de calcular su huella. */
  recordQuery(sql, durationMs, failed = false) {
    const normalized = String(sql || 'statement').replace(/--[^\n]*/g, ' ').replace(/'(?:''|\\.|[^'])*'/g, '?').replace(/"(?:""|\\.|[^"])*"/g, '?').replace(/\b\d+(?:\.\d+)?\b/g, '?').replace(/\s+/g, ' ').trim().slice(0, 2000);
    const fingerprint = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
    const metric = this.#group(this.queries, fingerprint, () => ({ fingerprint, operation: normalized.match(/^[a-z]+/i)?.[0]?.toUpperCase() || 'SQL', durations: [], count: 0, totalMs: 0, maxMs: 0, failures: 0 }));
    this.#record(metric, durationMs);
    if (failed) metric.failures += 1;
    this.totalQueries += 1;
  }

  /** Acepta tiempos medidos por el navegador para una lista cerrada de vistas de BauMar. */
  recordPageView(view, durationMs) {
    const allowed = new Set(['dashboard', 'users', 'roles', 'assignments', 'workshops', 'clients', 'registerClient', 'vehicleRegistration', 'vehicleAdmin', 'mapAgent', 'performance']);
    if (!allowed.has(view) || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 120000) return false;
    const metric = this.#group(this.pages, view, () => ({ view, durations: [], count: 0, totalMs: 0, maxMs: 0, failures: 0 }));
    this.#record(metric, durationMs);
    return true;
  }

  /** Captura latencia tras terminar cada petición sin retrasar la respuesta del usuario. */
  middleware() {
    return (req, res, next) => {
      const started = performance.now();
      res.once('finish', () => {
        const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.path;
        this.recordRequest(route, performance.now() - started, res.statusCode);
      });
      next();
    };
  }

  /** Construye un informe técnico agregado; los detalles de negocio y SQL permanecen fuera del reporte. */
  snapshot() {
    const processMemory = this.memoryUsage();
    const cpu = this.cpuUsage();
    const recommendations = [];
    const endpoints = [...this.endpoints.values()].map((metric) => this.#summarize(metric, { route: metric.key }))
      .sort((a, b) => b.averageMs - a.averageMs).slice(0, 30);
    const queries = [...this.queries.values()].map((metric) => this.#summarize(metric, { fingerprint: metric.fingerprint, operation: metric.operation, failures: metric.failures }))
      .sort((a, b) => b.averageMs - a.averageMs).slice(0, 30);
    const pages = [...this.pages.values()].map((metric) => this.#summarize(metric, { view: metric.view }))
      .sort((a, b) => b.averageMs - a.averageMs);
    const repeatedErrors = [...this.endpoints.values()].filter((metric) => metric.serverErrors >= 2)
      .map((metric) => ({ route: metric.key, count: metric.serverErrors }));
    for (const endpoint of endpoints) if (endpoint.averageMs >= 1000) recommendations.push(`Revisa ${endpoint.route}: promedio ${endpoint.averageMs} ms en ${endpoint.count} solicitudes.`);
    for (const query of queries) if (query.averageMs >= 300) recommendations.push(`Revisa el patrón SQL ${query.fingerprint} (${query.operation}): promedio ${query.averageMs} ms.`);
    for (const item of repeatedErrors) recommendations.push(`${item.route} acumuló ${item.count} errores 5xx; revisa los folios correspondientes en los logs.`);
    const rssMb = this.#mb(processMemory.rss);
    if (rssMb >= 512) recommendations.push(`El proceso usa ${rssMb} MB de memoria residente; revisa perfiles de memoria y límites del contenedor.`);
    if (!recommendations.length) recommendations.push('No se detectan umbrales de alerta con las muestras disponibles. Mantén el monitoreo para obtener una tendencia más representativa.');
    return {
      capturedAt: new Date(this.now()).toISOString(),
      process: { uptimeSeconds: Math.round(this.uptime()), rssMb, heapUsedMb: this.#mb(processMemory.heapUsed), heapTotalMb: this.#mb(processMemory.heapTotal), cpuUserSeconds: Number((cpu.user / 1e6).toFixed(2)), cpuSystemSeconds: Number((cpu.system / 1e6).toFixed(2)) },
      http: { totalRequests: this.totalRequests, endpoints },
      database: { totalQueries: this.totalQueries, queryShapes: queries },
      pages: { totalSamples: pages.reduce((sum, item) => sum + item.count, 0), views: pages },
      repeatedErrors,
      recommendations,
      note: 'Métricas agregadas en memoria desde el último inicio. No se recolectan datos del taller, valores SQL ni información personal.'
    };
  }

  #group(map, key, create = () => ({ key, durations: [], count: 0, totalMs: 0, maxMs: 0, statusCounts: {}, serverErrors: 0, failures: 0 })) {
    let metric = map.get(key);
    if (!metric) {
      if (map.size >= MAX_GROUPS) map.delete(map.keys().next().value);
      metric = create();
      if (!metric.key) metric.key = key;
      map.set(key, metric);
    }
    return metric;
  }

  #record(metric, durationMs) {
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    metric.count += 1;
    metric.totalMs += duration;
    metric.maxMs = Math.max(metric.maxMs, duration);
    metric.durations.push(duration);
    if (metric.durations.length > MAX_SAMPLES) metric.durations.shift();
  }

  #summarize(metric, extra) {
    const sorted = [...metric.durations].sort((a, b) => a - b);
    return {
      ...extra,
      count: metric.count,
      averageMs: Number((metric.totalMs / metric.count).toFixed(2)),
      maxMs: Number(metric.maxMs.toFixed(2)),
      p95Ms: Number((sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0).toFixed(2)),
      ...(metric.serverErrors === undefined ? {} : { serverErrors: metric.serverErrors }),
      ...(metric.statusCounts === undefined ? {} : { statusCounts: metric.statusCounts })
    };
  }

  #mb(bytes) { return Number((bytes / 1024 / 1024).toFixed(2)); }
}

/** Instrumenta mysql2/promise sin guardar consultas o parámetros sensibles. */
export function instrumentDatabasePool(pool, agent) {
  const instrument = (target, method) => {
    const original = target[method].bind(target);
    target[method] = (...args) => {
      const started = performance.now();
      const finish = (error) => agent.recordQuery(typeof args[0] === 'string' ? args[0] : 'prepared statement', performance.now() - started, Boolean(error));
      try {
        const result = original(...args);
        if (result && typeof result.then === 'function') return result.then((value) => { finish(null); return value; }, (error) => { finish(error); throw error; });
        finish(null);
        return result;
      } catch (error) { finish(error); throw error; }
    };
  };
  const instrumentedConnections = new WeakSet();
  const instrumentConnection = (connection) => {
    if (instrumentedConnections.has(connection)) return connection;
    instrumentedConnections.add(connection);
    instrument(connection, 'query');
    instrument(connection, 'execute');
    return connection;
  };
  instrument(pool, 'query');
  instrument(pool, 'execute');
  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async (...args) => instrumentConnection(await originalGetConnection(...args));
  return pool;
}

export const performanceAnalystAgent = new PerformanceAnalystAgent();
