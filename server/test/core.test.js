import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { uuidv7 } from '../src/utils/uuidv7.js';
import { hashPassword, verifyPassword, hashToken } from '../src/utils/passwords.js';
import { UserFactory } from '../src/factories/UserFactory.js';
import { validateAccount, validateRole, validationPatterns } from '../src/validators/input.js';
import { requireAdministrator, requireAnyRole } from '../src/middleware/auth.js';
import { validateCustomer, validateVehicle, validateWorkshop } from '../src/validators/workshopInput.js';
import { WorkshopMapAgent, googleMapsDirectionsUrl, workshopAddressText } from '../../src/agents/WorkshopMapAgent.js';
import { PerformanceAnalystAgent, instrumentDatabasePool } from '../src/agents/PerformanceAnalystAgent.js';
import { BrowserPerformanceAnalystAgent } from '../../src/agents/BrowserPerformanceAnalystAgent.js';
import { HttpAdapter } from '../../src/adapters/httpAdapter.js';

test('uuidv7 genera UUID con versión 7 y variante RFC', () => {
  const id = uuidv7();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(uuidv7(), id);
});

test('la entrada Vite pertenece a BauMar y monta React en su nodo raíz', async () => {
  const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
  const entry = await readFile(fileURLToPath(new URL('../../src/main.jsx', import.meta.url)), 'utf8');
  assert.match(html, /<div\s+id="root"\s*>\s*<\/div>/i);
  assert.match(html, /<script\s+type="module"\s+src="\/src\/main\.jsx"\s*>/i);
  assert.match(entry, /createRoot\(document\.getElementById\('root'\)\)/);
  assert.doesNotMatch(html, /Directorio de alumnos|Administración de alumnos/i);
});

test('el Adapter acepta URL pública HTTPS del API y agrega /api una sola vez', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => ({ ok: true }) }; };
  try {
    await new HttpAdapter('https://baumar-api.onrender.com').get('/auth/health');
    await new HttpAdapter('https://baumar-api.onrender.com/api/').get('/auth/health');
    assert.deepEqual(calls, [
      'https://baumar-api.onrender.com/api/auth/health',
      'https://baumar-api.onrender.com/api/auth/health',
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test('Render Blueprint define API Docker, sitio estático y referencias dinámicas sin secretos versionados', async () => {
  const blueprint = await readFile(fileURLToPath(new URL('../../render.yaml', import.meta.url)), 'utf8');
  const nodeVersion = await readFile(fileURLToPath(new URL('../../.node-version', import.meta.url)), 'utf8');
  assert.match(blueprint, /name: baumar-api[\s\S]*?runtime: docker[\s\S]*?healthCheckPath: \/api\/health/);
  assert.match(blueprint, /name: baumar-frontend[\s\S]*?runtime: static[\s\S]*?staticPublishPath: \.\/dist/);
  assert.match(blueprint, /key: DB_PASSWORD\s+sync: false/);
  assert.match(blueprint, /key: JWT_SECRET\s+generateValue: true/);
  assert.match(blueprint, /envVarKey: RENDER_EXTERNAL_URL/);
  assert.equal(nodeVersion.trim(), '22.22.0');
  assert.doesNotMatch(blueprint, /localhost|127\.0\.0\.1|<HOST>|<PASSWORD>/i);
});

test('el arranque de Render inicializa el esquema vigente con TLS opcional y recuperación por correo apagada', async () => {
  const setup = await readFile(fileURLToPath(new URL('../src/dbSetup.js', import.meta.url)), 'utf8');
  const database = await readFile(fileURLToPath(new URL('../src/db.js', import.meta.url)), 'utf8');
  const index = await readFile(fileURLToPath(new URL('../src/index.js', import.meta.url)), 'utf8');
  const auth = await readFile(fileURLToPath(new URL('../src/controllers/authController.js', import.meta.url)), 'utf8');
  assert.match(setup, /CREATE DATABASE|schema\.sql/);
  assert.match(setup, /multipleStatements:\s*true/);
  assert.match(database, /rejectUnauthorized:\s*true/);
  assert.match(database, /SET time_zone = '\+00:00'/);
  assert.match(index, /process\.env\.RENDER === 'true'/);
  assert.match(auth, /if \(!config\.emailEnabled\)[\s\S]*?deshabilitada/);
});

test('Express conserva el montaje de los routers de autenticación, administración y clientes', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/index.js', import.meta.url)), 'utf8');
  assert.match(source, /app\.use\('\/api\/auth',\s*authRoutes\)/);
  assert.match(source, /app\.use\('\/api\/admin',\s*adminRoutes\)/);
  assert.match(source, /app\.use\('\/api\/customer',\s*customerRoutes\)/);
  assert.match(source, /app\.get\('\/api\/health'/);
});

test('contraseñas se almacenan como PBKDF2-SHA512 con salt distinto y validación timing-safe', async () => {
  const first = await hashPassword('BauMar!Secure2026');
  const second = await hashPassword('BauMar!Secure2026');
  assert.match(first, /^pbkdf2-sha512\$310000\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('BauMar!Secure2026', first), true);
  assert.equal(await verifyPassword('Wrong!Password2026', first), false);
});

test('Factory Method construye perfiles para roles de sistema, no perfiles para roles personalizados', () => {
  const profile = UserFactory.createProfile('technician', uuidv7(), { specialty: 'Diagnóstico' });
  assert.equal(profile.table, 'technician_profiles');
  assert.equal(profile.extraValues[0], 'Diagnóstico');
  assert.match(profile.profileId, /-7[0-9a-f]{3}-/i);
  assert.equal(UserFactory.createProfile('custom_role', uuidv7()), null);
});

test('validaciones de backend aceptan cuenta válida y rechazan campos no válidos', () => {
  const account = validateAccount({ firstName: 'Ana', lastName: 'García López', username: 'ana.garcia', email: 'ANA@example.com', phoneNumber: '+52 (55) 1234-5678', password: 'BauMar!Secure2026', confirmPassword: 'BauMar!Secure2026' });
  assert.equal(account.email, 'ana@example.com');
  assert.equal(account.phoneNumber, '+525512345678');
  assert.throws(() => validateAccount({ firstName: 'Ana!', lastName: 'López', username: 'x', email: 'no-es-correo', password: '123' }), { status: 400 });
  assert.throws(() => validateAccount({ firstName: 'Ana', lastName: 'López', username: 'ana', email: 'ana@example.com', phoneNumber: '123', password: 'BauMar!Secure2026', confirmPassword: 'BauMar!Secure2026' }), { status: 400 });
  assert.equal(validateRole({ roleName: 'Jefe de Patio' }).roleKey, 'jefe_de_patio');
  assert.throws(() => validateRole({ roleName: '!!!!' }), { status: 400 });
});

test('endpoint de asignación no autoriza a usuarios sin rol administrador', () => {
  let status; let payload;
  const req = { auth: { roles: ['technician'] }, requestId: 'test-id' };
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  let called = false;
  requireAdministrator(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(status, 403);
  assert.match(payload.message, /administrador/i);
});

test('los tokens de recuperación se guardan como SHA-512 y no se conservan en claro', () => {
  const token = 'c'.repeat(64);
  const digest = hashToken(token);
  assert.equal(digest.length, 128);
  assert.notEqual(digest, token);
});

test('recuperación de contraseña valida correo o número de teléfono de 10 a 15 dígitos', () => {
  const isEmail = (val) => validationPatterns.email.test(val);
  const isPhone = (val) => validationPatterns.phoneNumber.test(val.replace(/[ ()-]/g, ''));
  assert.equal(isEmail('cliente@taller.com'), true);
  assert.equal(isPhone('+52 (55) 1234-5678'), true);
  assert.equal(isPhone('5512345678'), true);
  assert.equal(isEmail('no-es-correo'), false);
  assert.equal(isPhone('123'), false);
});

test('el esquema exige UUIDv7, separa asignaciones y no declara columnas autoincrementales', async () => {
  const schemaPath = fileURLToPath(new URL('../sql/schema.sql', import.meta.url));
  const schema = await readFile(schemaPath, 'utf8');
  assert.doesNotMatch(schema, /AUTO_INCREMENT|IDENTITY\s*\(/i);
  assert.match(schema, /user_id\s+CHAR\(36\)\s+NOT NULL PRIMARY KEY/i);
  assert.match(schema, /CONSTRAINT uq_roles_key UNIQUE \(role_key\)/i);
  assert.match(schema, /CONSTRAINT uq_roles_name UNIQUE \(role_name\)/i);
  assert.match(schema, /CONSTRAINT uq_user_role UNIQUE \(user_id, role_id\)/i);
  const seededIds = [...schema.matchAll(/\('([0-9a-f-]{36})','(?:administrator|receptionist|service_advisor|technician|customer|system)'/gi)].map((match) => match[1]);
  assert.equal(seededIds.length, 6);
  for (const id of seededIds) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS statuses/i);
  assert.match(schema, /UNIQUE\(normalized_name\)/i);
  assert.match(schema, /UNIQUE\(rfc\)/i);
  assert.match(schema, /customer_id CHAR\(36\) NOT NULL PRIMARY KEY/i);
  assert.match(schema, /vehicle_id CHAR\(36\) NOT NULL PRIMARY KEY/i);
});

test('validaciones de talleres y clientes exigen RFC, imagen firmada, teléfono y taller', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const workshopInput = { workshopName: 'Taller Central', rfc: 'ABC010203XYZ', contactEmail: 'contacto@gmail.com', street: 'Reforma', streetNumber: '100', neighborhood: 'Centro', postalCode: '06000', municipality: 'Cuauhtémoc', state: 'Ciudad de México', photo: { mimeType: 'image/jpeg', dataBase64: `data:image/jpeg;base64,${jpeg}` } };
  const workshop = validateWorkshop(workshopInput, 1024);
  assert.equal(workshop.normalizedName, 'taller central');
  assert.equal(workshop.photo.extension, 'jpg');
  assert.throws(() => validateWorkshop({ ...workshopInput, contactEmail: 'contacto@baumar.mx' }, 1024), { status: 400 });
  assert.throws(() => validateWorkshop({ ...workshop, photo: { mimeType: 'image/jpeg', dataBase64: 'data:image/jpeg;base64,aGVsbG8=' } }, 1024), { status: 400 });
  assert.throws(() => validateCustomer({ customerName: 'Cliente Demo', contactPhone: '123', address: 'Calle 1', email: 'bad', workshopId: '' }), { status: 400 });
  assert.throws(() => validateVehicle({ workshopId: 'not-a-v7', make: 'Ford', model: 'Fiesta', plate: 'ABC-123' }), { status: 400 });
});

test('registro de auto normaliza placa y valida VIN, versión y kilometraje opcional', () => {
  const vehicle = validateVehicle({ workshopId: uuidv7(), vin: '1hgcm82633a004352', plate: 'ABC-123', make: 'Ford', model: 'Fiesta', modelYear: 2020, version: 'SE', color: 'Rojo', mileage: '' });
  assert.equal(vehicle.vin, '1HGCM82633A004352');
  assert.equal(vehicle.plate, 'ABC123');
  assert.equal(vehicle.mileage, null);
  assert.throws(() => validateVehicle({ workshopId: uuidv7(), vin: '123', plate: 'ABC-123', make: 'Ford', model: 'Fiesta', modelYear: 2020, version: 'SE', color: 'Rojo' }), { status: 400 });
  assert.throws(() => validateVehicle({ workshopId: uuidv7(), vin: '1HGCM82633A004352', plate: 'ABC-123', make: 'Ford', model: 'Fiesta', modelYear: 2020, version: 'SE', color: 'Rojo', mileage: -1 }), { status: 400 });
});

test('agente de mapas encuentra sedes activas por dirección y prepara búsqueda/ruta en Maps', () => {
  const agent = new WorkshopMapAgent();
  const workshops = [
    { workshopId: 'shop-1', workshopName: 'Taller BauMar Centro', status: 'active', address: { street: 'Av. Miguel Ángel de Quevedo', streetNumber: '100', neighborhood: 'Del Carmen', postalCode: '04100', municipality: 'Coyoacán', state: 'Ciudad de México' } },
    { workshopId: 'shop-2', workshopName: 'Sede Cerrada', status: 'inactive', address: { municipality: 'Coyoacán', state: 'Ciudad de México' } },
  ];
  const result = agent.respond('taller en Coyoacán', workshops);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].workshopId, 'shop-1');
  assert.match(workshopAddressText(result.matches[0]), /04100, Coyoacán, Ciudad de México, México/);
  const fallback = agent.respond('taller en Zihuatanejo', workshops);
  assert.equal(new URL(fallback.mapUrl).searchParams.get('api'), '1');
  assert.match(googleMapsDirectionsUrl('Coyoacán, México'), /destination=Coyoac%C3%A1n/);
});

test('migración vehicular habilita alta sin cliente, VIN/placas únicos y fotos', async () => {
  const migration = await readFile(fileURLToPath(new URL('../sql/migrations/006_vehicle_registry.sql', import.meta.url)), 'utf8');
  assert.match(migration, /MODIFY customer_id CHAR\(36\) NULL/i);
  assert.match(migration, /UNIQUE\(plate\)/i);
  assert.match(migration, /UNIQUE\(vin\)/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS vehicle_photos/i);
  assert.match(migration, /uq_customer_email_global/i);
  assert.ok(migration.indexOf('idx_vehicles_workshop') < migration.indexOf('DROP INDEX uq_vehicle_plate_per_workshop'));
  assert.ok(migration.indexOf('idx_customers_workshop') < migration.indexOf('DROP INDEX uq_customer_email_per_workshop'));
  assert.match(migration, /information_schema\.COLUMNS/i, 'permite reanudar columnas tras un fallo DDL parcial');
  const routes = await readFile(fileURLToPath(new URL('../src/routes/adminRoutes.js', import.meta.url)), 'utf8');
  assert.match(routes, /post\('\/vehicles\/:vehicleId\/associate-client', requireAnyRole\('administrator','receptionist'\)/);
});

test('solo administración y recepción pasan la autorización del alta de clientes', () => {
  function invoke(role) { let status = 200; let called = false; const req = { auth: { roles: [role] } }; const res = { status(code) { status = code; return this; }, json() { return this; } }; requireAnyRole('administrator', 'receptionist')(req, res, () => { called = true; }); return { status, called }; }
  assert.deepEqual(invoke('administrator'), { status: 200, called: true });
  assert.deepEqual(invoke('receptionist'), { status: 200, called: true });
  assert.deepEqual(invoke('technician'), { status: 403, called: false });
  assert.deepEqual(invoke('customer'), { status: 403, called: false });
});

test('la configuración inicial busca una cuenta administradora y permite conservar cuentas de cliente', async () => {
  const controller = await readFile(fileURLToPath(new URL('../src/controllers/authController.js', import.meta.url)), 'utf8');
  assert.match(controller, /JOIN roles r ON r\.role_id=ur\.role_id WHERE r\.role_key='administrator'/);
  assert.doesNotMatch(controller, /SELECT COUNT\(\*\) AS total FROM users/);
});

test('el agente de rendimiento agrega latencia HTTP y recomienda revisar endpoints lentos', () => {
  const agent = new PerformanceAnalystAgent({ now: () => 0, memoryUsage: () => ({ rss: 20 * 1024 * 1024, heapUsed: 4 * 1024 * 1024, heapTotal: 8 * 1024 * 1024 }), uptime: () => 10, cpuUsage: () => ({ user: 100000, system: 50000 }) });
  agent.recordRequest('/api/admin/vehicles', 2800, 200);
  agent.recordRequest('/api/admin/vehicles', 1200, 500);
  const report = agent.snapshot();
  assert.equal(report.http.totalRequests, 2);
  assert.equal(report.http.endpoints[0].averageMs, 2000);
  assert.equal(report.http.endpoints[0].serverErrors, 1);
  assert.match(report.recommendations[0], /vehicles.*promedio 2000 ms/i);
});

test('el agente agrupa SQL sin conservar literales ni acepta nombres de pantalla arbitrarios', () => {
  const agent = new PerformanceAnalystAgent();
  agent.recordQuery('SELECT * FROM users WHERE user_id = 123', 40);
  agent.recordQuery('SELECT * FROM users WHERE user_id = 456', 80);
  assert.equal(agent.snapshot().database.queryShapes.length, 1);
  assert.equal(agent.snapshot().database.queryShapes[0].count, 2);
  assert.equal(agent.recordPageView('users', 24), true);
  assert.equal(agent.recordPageView('customer@example.com', 24), false);
  assert.equal(agent.snapshot().pages.views[0].view, 'users');
});

test('instrumentación mide consultas mysql2 de pool y conexiones adquiridas', async () => {
  const agent = new PerformanceAnalystAgent();
  const connection = { query: async () => [[], []], execute: async () => [[], []] };
  const pool = { query: async () => [[], []], execute: async () => [[], []], getConnection: async () => connection };
  instrumentDatabasePool(pool, agent);
  await pool.query('SELECT * FROM roles');
  const acquired = await pool.getConnection();
  await acquired.execute('SELECT * FROM users WHERE user_id = 1');
  assert.equal(agent.snapshot().database.totalQueries, 2);
  assert.deepEqual(agent.snapshot().database.queryShapes.map((item) => item.operation).sort(), ['SELECT', 'SELECT']);
});

test('el reporte de rendimiento queda protegido por rol administrador', async () => {
  const routes = await readFile(fileURLToPath(new URL('../src/routes/adminRoutes.js', import.meta.url)), 'utf8');
  assert.match(routes, /get\('\/performance',\s*requireAdministrator/);
  assert.match(routes, /post\('\/performance\/pages',\s*requireAdministrator/);
});

test('Compose independiente de BauMar monta su esquema dentro de la carpeta y conserva el volumen existente', async () => {
  const compose = await readFile(fileURLToPath(new URL('../../compose.yaml', import.meta.url)), 'utf8');
  assert.match(compose, /\.\/server\/sql\/schema\.sql:\/docker-entrypoint-initdb\.d\/01-schema\.sql:ro/);
  assert.match(compose, /container_name: baumar_mysql/);
  assert.match(compose, /name: newproject_baumar_mysql_data/);
  assert.match(compose, /external: true/);
  assert.doesNotMatch(compose, /New project\/server\/sql\/schema\.sql|Franjuld|Taller Norte/i);
});

test('el agente de navegador mide solo tiempos sin depender de APIs no disponibles', () => {
  const agent = new BrowserPerformanceAnalystAgent();
  const start = agent.startViewTransition();
  assert.equal(typeof agent.finishViewTransition(start), 'number');
  assert.equal(typeof agent.initialPageDuration(), 'number');
});
