import { mkdir, readdir, rename, stat, unlink, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { uuidv7 } from '../utils/uuidv7.js';
import { logEvent } from '../utils/logger.js';
import { statusIds } from '../constants/statuses.js';
import { validateCustomer, validateVehicle, validateWorkshop, validateWorkshopPhoto } from '../validators/workshopInput.js';

const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/workshops');
const pendingPhotoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/pending-workshop-photos');
const vehiclePhotoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/vehicles');
const pendingVehiclePhotoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/pending-vehicle-photos');
const activeStatusId = statusIds.active;

/** Lista talleres activos con direcciones y conteo de visitas; los totales se calculan desde ingresos registrados. */
export async function listWorkshops(_req, res) {
  const [rows] = await pool.query(`SELECT w.workshop_id,w.workshop_name,w.rfc,w.contact_email,w.photo_path,w.street,w.street_number,w.neighborhood,w.postal_code,w.municipality,w.state,s.status_key,
    w.created_at,COUNT(v.visit_id) AS visit_count FROM workshops w JOIN statuses s ON s.status_id=w.status_id
    LEFT JOIN workshop_visits v ON v.workshop_id=w.workshop_id WHERE s.status_key<>'deleted'
    GROUP BY w.workshop_id ORDER BY w.created_at DESC`);
  res.json({ workshops: rows.map(mapWorkshop) });
}

/** Guarda la fotografía elegida inmediatamente en una carpeta privada temporal y entrega un token firmado de un solo uso lógico.
 * @param {import('express').Request} req Solicitud autenticada con tipo MIME y data URL.
 * @param {import('express').Response} res Respuesta con token de carga.
 * @returns {Promise<void>} Confirma que la imagen quedó guardada temporalmente.
 * @throws {Error} HTTP 400 si el tipo, firma o tamaño de la imagen no son válidos.
 */
export async function uploadWorkshopPhoto(req, res) {
  const image = validateWorkshopPhoto(req.body, config.maxWorkshopImageMb * 1024 * 1024);
  await mkdir(pendingPhotoDirectory, { recursive: true });
  const photoId = uuidv7();
  const fileName = `${photoId}.${image.extension}`;
  const filePath = path.join(pendingPhotoDirectory, fileName);
  await writeFile(filePath, image.data, { flag: 'wx' });
  const photoToken = jwt.sign({ purpose: 'pending-workshop-photo', fileName, mimeType: image.mimeType }, config.jwtSecret, { subject: req.auth.id, algorithm: 'HS256', expiresIn: '1h' });
  // Limpia imágenes de formularios abandonados, conservando tiempo suficiente para que el administrador complete el taller.
  const now = Date.now();
  for (const oldFile of await readdir(pendingPhotoDirectory)) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(oldFile)) continue;
    const details = await stat(path.join(pendingPhotoDirectory, oldFile)).catch(() => null);
    if (details && now - details.mtimeMs > 24 * 60 * 60 * 1000) await unlink(path.join(pendingPhotoDirectory, oldFile)).catch(() => {});
  }
  res.status(201).json({ message: 'Fotografía guardada. Continúa con los datos del taller.', photoToken });
}

/** Valida los datos y la imagen cargada previamente; después enlaza el archivo guardado con el registro del taller. */
export async function createWorkshop(req, res) {
  let input = req.body;
  let pendingPhotoPath = null;
  if (req.body.photoToken) {
    let claims;
    try { claims = jwt.verify(req.body.photoToken, config.jwtSecret, { algorithms: ['HS256'] }); }
    catch { throw Object.assign(new Error('La carga de la fotografía venció. Selecciónala nuevamente.'), { status: 400, details: { photo: 'Selecciona nuevamente la fotografía.' } }); }
    if (claims.purpose !== 'pending-workshop-photo' || claims.sub !== req.auth.id) throw Object.assign(new Error('No tienes permiso para usar esta fotografía.'), { status: 403 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(claims.fileName || '')) throw Object.assign(new Error('La fotografía cargada no es válida.'), { status: 400 });
    pendingPhotoPath = path.join(pendingPhotoDirectory, claims.fileName);
    const bytes = await readFile(pendingPhotoPath).catch(() => null);
    if (!bytes) throw Object.assign(new Error('No se encontró la fotografía temporal. Selecciónala nuevamente.'), { status: 410, details: { photo: 'Selecciona nuevamente la fotografía.' } });
    input = { ...req.body, photo: { mimeType: claims.mimeType, dataBase64: `data:${claims.mimeType};base64,${bytes.toString('base64')}` } };
  }
  const workshop = validateWorkshop(input, config.maxWorkshopImageMb * 1024 * 1024);
  const workshopId = uuidv7();
  const fileName = `${workshopId}.${workshop.photo.extension}`;
  await mkdir(uploadDirectory, { recursive: true });
  const finalPhotoPath = path.join(uploadDirectory, fileName);
  if (pendingPhotoPath) await rename(pendingPhotoPath, finalPhotoPath);
  else await writeFile(finalPhotoPath, workshop.photo.data, { flag: 'wx' });
  try {
    await pool.execute(`INSERT INTO workshops(workshop_id,workshop_name,normalized_name,rfc,contact_email,photo_path,street,street_number,neighborhood,postal_code,municipality,state,status_id,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [workshopId, workshop.workshopName, workshop.normalizedName, workshop.rfc, workshop.contactEmail, `/uploads/workshops/${fileName}`, workshop.street, workshop.streetNumber, workshop.neighborhood, workshop.postalCode, workshop.municipality, workshop.state, activeStatusId, req.auth.id]);
  } catch (error) {
    if (pendingPhotoPath) await rename(finalPhotoPath, pendingPhotoPath).catch(() => {});
    else await unlink(finalPhotoPath).catch(() => {});
    throw error;
  }
  await logEvent('info', 'Taller registrado', { module: 'workshops', workshopId, actorId: req.auth.id, requestId: req.requestId });
  res.status(201).json({ message: 'Taller registrado correctamente.', workshopId });
}

/** Cambia estado sin eliminar físicamente el taller, conservando su historial y referencias. */
export async function setWorkshopStatus(req, res) {
  const status = String(req.body.status || '');
  if (!['active', 'inactive', 'deleted'].includes(status)) throw Object.assign(new Error('Selecciona un estado válido.'), { status: 400 });
  const [[catalogStatus]] = await pool.execute('SELECT status_id FROM statuses WHERE status_key=? LIMIT 1', [status]);
  const [result] = await pool.execute('UPDATE workshops SET status_id=? WHERE workshop_id=?', [catalogStatus.status_id, req.params.workshopId]);
  if (!result.affectedRows) throw Object.assign(new Error('No se encontró el taller.'), { status: 404 });
  await logEvent('info', 'Estado de taller actualizado', { module: 'workshops', workshopId: req.params.workshopId, actorId: req.auth.id, status, requestId: req.requestId });
  res.json({ message: 'Estado del taller actualizado.' });
}

/** Busca coincidencias del catálogo SEPOMEX para código postal o zona; varias colonias/códigos se devuelven como opciones. */
export async function lookupAddress(req, res) {
  const zipCode = String(req.query.postalCode || '').trim();
  const state = String(req.query.state || '').trim();
  const municipality = String(req.query.municipality || '').trim();
  const neighborhood = String(req.query.neighborhood || '').trim();
  if (zipCode && !/^\d{1,5}$/.test(zipCode)) throw Object.assign(new Error('El código postal debe contener hasta cinco dígitos.'), { status: 400 });
  if (!zipCode && !state && !municipality && !neighborhood) throw Object.assign(new Error('Escribe un código postal, estado, municipio o colonia.'), { status: 400 });
  if ([state, municipality, neighborhood].some((value) => value.length > 100)) throw Object.assign(new Error('La búsqueda de dirección es demasiado larga.'), { status: 400 });
  const params = new URLSearchParams({ per_page: '100' });
  if (zipCode) params.set('zip_code', zipCode);
  if (state) params.set('state', state);
  if (municipality) params.set('city', municipality);
  if (neighborhood) params.set('colony', neighborhood);
  let response;
  try { response = await fetch(`https://sepomex.kurenn.dev/api/v1/zip_codes?${params}`, { signal: AbortSignal.timeout(5000) }); }
  catch { throw Object.assign(new Error('No se pudo consultar el catálogo postal. Completa la dirección manualmente e inténtalo de nuevo.'), { status: 503 }); }
  if (!response.ok) throw Object.assign(new Error('El catálogo postal no está disponible en este momento.'), { status: 503 });
  const data = await response.json();
  const locations = (data.zip_codes || []).map((row) => ({ postalCode: row.d_codigo, neighborhood: row.d_asenta, municipality: row.d_mnpio, state: row.d_estado }));
  res.json({ locations, truncated: Number(data.meta?.pagination?.total_objects || 0) > locations.length, message: locations.length ? undefined : 'No se encontraron coincidencias.' });
}

/** Mapea una fila de cliente para respuestas JSON consistentes. */
function mapCustomerRow(row) {
  return {
    customerId: row.customer_id,
    customerName: row.customer_name,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    contactPhone: row.contact_phone || '',
    personalPhone: row.personal_phone || '',
    workPhone: row.work_phone || '',
    alternativeContactName: row.alternative_contact_name || '',
    alternativeContactPhone: row.alternative_contact_phone || '',
    email: row.email,
    address: row.address,
    street: row.street || '',
    streetNumber: row.street_number || '',
    neighborhood: row.neighborhood || '',
    postalCode: row.postal_code || '',
    municipality: row.municipality || '',
    state: row.state || '',
    workshopId: row.workshop_id,
    workshopName: row.workshop_name,
    status: row.status_key,
    statusName: row.status_name || (row.status_key === 'active' ? 'Activo' : 'Suspendido'),
    portalLinked: Boolean(row.portal_linked),
    createdAt: row.created_at
  };
}

/** Registra clientes vinculados a un taller, validando unicidad de correo y teléfonos, y notificando al usuario. */
export async function createCustomer(req, res) {
  const customer = validateCustomer(req.body);

  const [[workshop]] = await pool.execute(
    `SELECT workshop_id, workshop_name FROM workshops w JOIN statuses s ON s.status_id=w.status_id WHERE workshop_id=? AND s.status_key='active' LIMIT 1`,
    [customer.workshopId]
  );
  if (!workshop) {
    throw Object.assign(new Error('Selecciona un taller activo antes de registrar al cliente.'), {
      status: 400,
      details: { workshopId: 'El taller seleccionado no existe o está inactivo.' }
    });
  }

  // Verificación de datos no repetidos
  const [[existingEmail]] = await pool.execute(
    `SELECT customer_id, customer_name FROM customers WHERE email = ? LIMIT 1`,
    [customer.email]
  );
  if (existingEmail) {
    throw Object.assign(new Error(`Ya existe un cliente registrado con el correo ${customer.email} (${existingEmail.customer_name}).`), {
      status: 409,
      details: { email: `El correo ${customer.email} ya se encuentra registrado en el sistema.` }
    });
  }

  if (customer.personalPhone) {
    const [[existingPhone]] = await pool.execute(
      `SELECT customer_id, customer_name FROM customers WHERE (personal_phone = ? OR contact_phone = ?) LIMIT 1`,
      [customer.personalPhone, customer.personalPhone]
    );
    if (existingPhone) {
      throw Object.assign(new Error(`Ya existe un cliente con el teléfono personal ${customer.personalPhone} (${existingPhone.customer_name}).`), {
        status: 409,
        details: { personalPhone: `El teléfono personal ${customer.personalPhone} ya está asignado a otro cliente.` }
      });
    }
  }

  const [[portalUser]] = await pool.execute(
    `SELECT u.user_id FROM users u JOIN user_roles ur ON ur.user_id=u.user_id JOIN roles r ON r.role_id=ur.role_id
     JOIN statuses us ON us.status_id=u.status_id WHERE u.email=? AND us.status_key='active' AND r.role_key='customer' LIMIT 1`,
    [customer.email]
  );

  const customerId = uuidv7();
  await pool.execute(
    `INSERT INTO customers(
      customer_id, workshop_id, user_id, customer_name, first_name, last_name,
      contact_phone, personal_phone, work_phone, alternative_contact_name, alternative_contact_phone,
      email, address, street, street_number, neighborhood, postal_code, municipality, state,
      status_id, created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      customerId,
      customer.workshopId,
      portalUser?.user_id || null,
      customer.customerName,
      customer.firstName || null,
      customer.lastName || null,
      customer.contactPhone,
      customer.personalPhone || null,
      customer.workPhone || null,
      customer.alternativeContactName || null,
      customer.alternativeContactPhone || null,
      customer.email,
      customer.address,
      customer.street || null,
      customer.streetNumber || null,
      customer.neighborhood || null,
      customer.postalCode || null,
      customer.municipality || null,
      customer.state || null,
      activeStatusId,
      req.auth.id
    ]
  );

  await logEvent('info', 'Cliente registrado en taller', {
    module: 'customers',
    customerId,
    customerName: customer.customerName,
    workshopId: customer.workshopId,
    actorId: req.auth.id,
    linkedPortalAccount: Boolean(portalUser),
    requestId: req.requestId
  });

  res.status(201).json({
    message: `Cliente "${customer.customerName}" registrado exitosamente y asociado al taller "${workshop.workshop_name}".`,
    customerId,
    customerName: customer.customerName,
    workshopName: workshop.workshop_name,
    portalAccountLinked: Boolean(portalUser)
  });
}

/** Devuelve directorio de clientes paginado tanto para frontend como backend, con soporte de filtros. */
export async function listCustomers(req, res) {
  const isAll = req.query.all === 'true';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const search = String(req.query.search || '').trim();
  const statusFilter = String(req.query.status || 'all').trim();

  const whereClauses = ["s.status_key <> 'deleted'"];
  const params = [];

  if (statusFilter && statusFilter !== 'all') {
    whereClauses.push('s.status_key = ?');
    params.push(statusFilter);
  }

  if (search) {
    whereClauses.push('(c.customer_name LIKE ? OR c.email LIKE ? OR c.contact_phone LIKE ? OR c.personal_phone LIKE ? OR w.workshop_name LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM customers c
     JOIN workshops w ON w.workshop_id = c.workshop_id
     JOIN statuses s ON s.status_id = c.status_id
     ${whereSql}`,
    params
  );

  let querySql = `
    SELECT
      c.customer_id, c.customer_name, c.first_name, c.last_name,
      c.contact_phone, c.personal_phone, c.work_phone,
      c.alternative_contact_name, c.alternative_contact_phone,
      c.email, c.address, c.street, c.street_number, c.neighborhood,
      c.postal_code, c.municipality, c.state,
      c.workshop_id, w.workshop_name,
      s.status_key, s.status_name,
      c.created_at, (c.user_id IS NOT NULL) AS portal_linked
    FROM customers c
    JOIN workshops w ON w.workshop_id = c.workshop_id
    JOIN statuses s ON s.status_id = c.status_id
    ${whereSql}
    ORDER BY c.created_at DESC
  `;

  let rows;
  if (isAll) {
    [rows] = await pool.query(querySql, params);
  } else {
    querySql += ` LIMIT ? OFFSET ?`;
    [rows] = await pool.query(querySql, [...params, limit, offset]);
  }

  const totalPages = Math.ceil(total / limit) || 1;

  res.json({
    customers: rows.map(mapCustomerRow),
    pagination: {
      page: isAll ? 1 : page,
      limit: isAll ? total : limit,
      total,
      totalPages: isAll ? 1 : totalPages
    }
  });
}

/** Actualiza todos los datos del cliente con validación de no repetición de datos. */
export async function updateCustomer(req, res) {
  const customerId = req.params.customerId;
  const customer = validateCustomer(req.body);

  const [[existing]] = await pool.execute(`SELECT customer_id, customer_name FROM customers WHERE customer_id = ? LIMIT 1`, [customerId]);
  if (!existing) throw Object.assign(new Error('No se encontró el cliente.'), { status: 404 });
  const [[linkedVehicles]] = await pool.execute('SELECT COUNT(*) AS total FROM vehicles WHERE customer_id=? AND workshop_id<>?', [customerId, customer.workshopId]);
  if (Number(linkedVehicles.total) > 0) throw Object.assign(new Error('No puedes cambiar el taller del cliente mientras tenga vehículos vinculados. Desvincula o reasigna los vehículos primero.'), { status: 409, details: { workshopId: 'El cliente tiene automóviles vinculados a su taller actual.' } });

  const [[dupEmail]] = await pool.execute(
    `SELECT customer_id, customer_name FROM customers WHERE email = ? AND customer_id <> ? LIMIT 1`,
    [customer.email, customerId]
  );
  if (dupEmail) {
    throw Object.assign(new Error(`Ya existe otro cliente con el correo ${customer.email} (${dupEmail.customer_name}).`), {
      status: 409,
      details: { email: 'Este correo ya pertenece a otro cliente registrado.' }
    });
  }

  if (customer.personalPhone) {
    const [[dupPhone]] = await pool.execute(
      `SELECT customer_id, customer_name FROM customers WHERE (personal_phone = ? OR contact_phone = ?) AND customer_id <> ? LIMIT 1`,
      [customer.personalPhone, customer.personalPhone, customerId]
    );
    if (dupPhone) {
      throw Object.assign(new Error(`Ya existe otro cliente con el teléfono personal ${customer.personalPhone} (${dupPhone.customer_name}).`), {
        status: 409,
        details: { personalPhone: 'Este teléfono personal ya pertenece a otro cliente.' }
      });
    }
  }

  const [[workshop]] = await pool.execute(`SELECT workshop_id FROM workshops WHERE workshop_id = ? LIMIT 1`, [customer.workshopId]);
  if (!workshop) throw Object.assign(new Error('El taller seleccionado no es válido.'), { status: 400 });

  await pool.execute(
    `UPDATE customers SET
      workshop_id = ?,
      customer_name = ?,
      first_name = ?,
      last_name = ?,
      contact_phone = ?,
      personal_phone = ?,
      work_phone = ?,
      alternative_contact_name = ?,
      alternative_contact_phone = ?,
      email = ?,
      address = ?,
      street = ?,
      street_number = ?,
      neighborhood = ?,
      postal_code = ?,
      municipality = ?,
      state = ?
    WHERE customer_id = ?`,
    [
      customer.workshopId,
      customer.customerName,
      customer.firstName || null,
      customer.lastName || null,
      customer.contactPhone,
      customer.personalPhone || null,
      customer.workPhone || null,
      customer.alternativeContactName || null,
      customer.alternativeContactPhone || null,
      customer.email,
      customer.address,
      customer.street || null,
      customer.streetNumber || null,
      customer.neighborhood || null,
      customer.postalCode || null,
      customer.municipality || null,
      customer.state || null,
      customerId
    ]
  );

  await logEvent('info', 'Cliente actualizado', { module: 'customers', customerId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: `Datos del cliente "${customer.customerName}" actualizados correctamente.` });
}

/** Cambia el estatus del cliente a Activo o Suspendido (exclusivo para administradores; no elimina físicamente). */
export async function setCustomerStatus(req, res) {
  const customerId = req.params.customerId;
  const status = String(req.body.status || '').trim();
  if (!['active', 'suspended', 'inactive'].includes(status)) {
    throw Object.assign(new Error('Selecciona un estado válido (active o suspended).'), { status: 400 });
  }

  const [[catalogStatus]] = await pool.execute('SELECT status_id, status_name FROM statuses WHERE status_key=? LIMIT 1', [status]);
  if (!catalogStatus) throw Object.assign(new Error('Estado de catálogo no encontrado.'), { status: 400 });

  const [result] = await pool.execute('UPDATE customers SET status_id=? WHERE customer_id=?', [catalogStatus.status_id, customerId]);
  if (!result.affectedRows) throw Object.assign(new Error('No se encontró el cliente.'), { status: 404 });

  await logEvent('info', 'Estatus de cliente actualizado', {
    module: 'customers',
    customerId,
    actorId: req.auth.id,
    status,
    requestId: req.requestId
  });

  res.json({
    message: `Estatus del cliente actualizado a ${status === 'active' ? 'Activo' : 'Suspendido'}.`,
    status
  });
}

/** Guarda estado histórico del vehículo sin sobrescribir avances previos y valida el catálogo de estados de reparación. */
export async function addVehicleStatus(req, res) {
  const statusKey = String(req.body.statusKey || '');
  const conditionSummary = String(req.body.conditionSummary || '').trim();
  const pendingWork = String(req.body.pendingWork || '').trim();
  const allowed = ['diagnostico','esperando_autorizacion','en_reparacion','esperando_refacciones','listo','entregado'];
  if (!allowed.includes(statusKey) || conditionSummary.length < 3 || conditionSummary.length > 500 || pendingWork.length > 500) throw Object.assign(new Error('Completa un estado y descripción válidos.'), { status: 400 });
  const [result] = await pool.execute('SELECT vehicle_id FROM vehicles WHERE vehicle_id=? LIMIT 1', [req.params.vehicleId]);
  if (!result[0]) throw Object.assign(new Error('No se encontró el vehículo.'), { status: 404 });
  await pool.execute('INSERT INTO vehicle_status_updates(update_id,vehicle_id,status_key,condition_summary,pending_work,updated_by) VALUES (?,?,?,?,?,?)', [uuidv7(), req.params.vehicleId, statusKey, conditionSummary, pendingWork, req.auth.id]);
  await logEvent('info', 'Estado de vehículo actualizado', { module: 'vehicles', vehicleId: req.params.vehicleId, actorId: req.auth.id, statusKey, requestId: req.requestId });
  res.status(201).json({ message: 'Estado del vehículo actualizado.' });
}

/** Guarda cada foto de auto seleccionada antes de enviar el formulario y la asocia a una carga temporal firmada. */
export async function uploadVehiclePhoto(req, res) {
  const image = validateWorkshopPhoto(req.body, config.maxVehicleImageMb * 1024 * 1024);
  await mkdir(pendingVehiclePhotoDirectory, { recursive: true });
  const fileName = `${uuidv7()}.${image.extension}`;
  await writeFile(path.join(pendingVehiclePhotoDirectory, fileName), image.data, { flag: 'wx' });
  const photoToken = jwt.sign({ purpose: 'pending-vehicle-photo', fileName, mimeType: image.mimeType, sizeBytes: image.data.length }, config.jwtSecret, { subject: req.auth.id, algorithm: 'HS256', expiresIn: '1h' });
  const now = Date.now();
  for (const oldFile of await readdir(pendingVehiclePhotoDirectory)) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(oldFile)) continue;
    const details = await stat(path.join(pendingVehiclePhotoDirectory, oldFile)).catch(() => null);
    if (details && now - details.mtimeMs > 24 * 60 * 60 * 1000) await unlink(path.join(pendingVehiclePhotoDirectory, oldFile)).catch(() => {});
  }
  res.status(201).json({ photoToken, message: 'Fotografía del vehículo guardada.' });
}

/** Crea vehículo sin propietario; el cliente se asigna después desde la administración de clientes. */
export async function createVehicle(req, res) {
  const vehicle = validateVehicle(req.body);
  const [[workshop]] = await pool.execute("SELECT workshop_id FROM workshops WHERE workshop_id=? AND status_id=? LIMIT 1", [vehicle.workshopId, activeStatusId]);
  if (!workshop) throw Object.assign(new Error('Selecciona un taller activo.'), { status: 400 });
  const tokens = Array.isArray(req.body.photoTokens) ? req.body.photoTokens : [];
  const pendingPhotos = [];
  for (const photoToken of tokens) {
    let claims;
    try { claims = jwt.verify(photoToken, config.jwtSecret, { algorithms: ['HS256'] }); }
    catch { throw Object.assign(new Error('Una fotografía venció. Selecciónala nuevamente.'), { status: 400, details: { photos: 'Vuelve a seleccionar las fotografías.' } }); }
    if (claims.purpose !== 'pending-vehicle-photo' || claims.sub !== req.auth.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(claims.fileName || '')) throw Object.assign(new Error('Una fotografía no es válida para esta sesión.'), { status: 403 });
    const sourcePath = path.join(pendingVehiclePhotoDirectory, claims.fileName);
    const bytes = await readFile(sourcePath).catch(() => null);
    if (!bytes || bytes.length > config.maxVehicleImageMb * 1024 * 1024) throw Object.assign(new Error('No se encontró una fotografía temporal. Selecciónala de nuevo.'), { status: 410 });
    pendingPhotos.push({ claims, sourcePath, bytes });
  }
  const vehicleId = uuidv7();
  const connection = await pool.getConnection();
  const movedPhotos = [];
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT INTO vehicles(vehicle_id,workshop_id,customer_id,make,model,model_year,plate,vin,version,color,mileage,status_id) VALUES (?,?,NULL,?,?,?,?,?,?,?,?,?)', [vehicleId, vehicle.workshopId, vehicle.make, vehicle.model, vehicle.modelYear, vehicle.plate, vehicle.vin, vehicle.version, vehicle.color, vehicle.mileage, activeStatusId]);
    await connection.execute('INSERT INTO vehicle_status_updates(update_id,vehicle_id,status_key,condition_summary,pending_work,updated_by) VALUES (?,?,?,?,?,?)', [uuidv7(), vehicleId, 'diagnostico', 'Vehículo recibido. Pendiente de evaluación inicial.', '', req.auth.id]);
    await mkdir(vehiclePhotoDirectory, { recursive: true });
    for (const photo of pendingPhotos) {
      const photoId = uuidv7(); const fileName = `${photoId}.${photo.claims.fileName.split('.').pop()}`; const destination = path.join(vehiclePhotoDirectory, fileName);
      await rename(photo.sourcePath, destination); movedPhotos.push({ destination, sourcePath: photo.sourcePath });
      await connection.execute('INSERT INTO vehicle_photos(photo_id,vehicle_id,photo_path,mime_type,size_bytes,created_by) VALUES (?,?,?,?,?,?)', [photoId, vehicleId, `/uploads/vehicles/${fileName}`, photo.claims.mimeType, photo.bytes.length, req.auth.id]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); for (const photo of movedPhotos) await rename(photo.destination, photo.sourcePath).catch(() => {}); throw error; }
  finally { connection.release(); }
  await logEvent('info', 'Vehículo registrado', { module: 'vehicles', vehicleId, workshopId: vehicle.workshopId, actorId: req.auth.id, photoCount: pendingPhotos.length, requestId: req.requestId });
  res.status(201).json({ message: 'Vehículo registrado correctamente.', vehicleId });
}

/** Lista el inventario vehicular y sus fotos/cliente relacionado, conservando la consulta del portal. */
export async function listVehicles(req, res) {
  const isCustomer = req.auth.forceOwnVehicles || (req.auth.roles.includes('customer') && !req.auth.roles.some((role) => ['administrator','receptionist','technician','service_advisor'].includes(role)));
  const params = []; const ownFilter = isCustomer ? 'AND c.user_id=?' : '';
  if (isCustomer) params.push(req.auth.id);
  const [rows] = await pool.execute(`SELECT v.vehicle_id,v.workshop_id,v.customer_id,v.vin,v.plate,v.make,v.model,v.model_year,v.version,v.color,v.mileage,s.status_key,w.workshop_name,c.customer_name,
    latest.status_key AS repair_status_key,latest.condition_summary,latest.pending_work,latest.created_at AS status_updated_at
    FROM vehicles v JOIN workshops w ON w.workshop_id=v.workshop_id JOIN statuses s ON s.status_id=v.status_id
    LEFT JOIN customers c ON c.customer_id=v.customer_id
    LEFT JOIN vehicle_status_updates latest ON latest.update_id=(SELECT u.update_id FROM vehicle_status_updates u WHERE u.vehicle_id=v.vehicle_id ORDER BY u.created_at DESC,u.update_id DESC LIMIT 1)
    WHERE s.status_key<>'deleted' ${ownFilter} ORDER BY v.created_at DESC`, params);
  const ids = rows.map((row) => row.vehicle_id); let photos = [];
  if (ids.length) { const [photoRows] = await pool.query(`SELECT vehicle_id,photo_path FROM vehicle_photos WHERE vehicle_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`, ids); photos = photoRows; }
  res.json({ vehicles: rows.map((row) => ({ vehicleId: row.vehicle_id, workshopId: row.workshop_id, workshopName: row.workshop_name, customerId: row.customer_id, customerName: row.customer_name, vin: row.vin, plate: row.plate, make: row.make, model: row.model, modelYear: row.model_year, version: row.version, color: row.color, mileage: row.mileage, status: row.status_key, photos: photos.filter((photo) => photo.vehicle_id === row.vehicle_id).map((photo) => photo.photo_path), statusKey: row.repair_status_key, conditionSummary: row.condition_summary, pendingWork: row.pending_work, statusUpdatedAt: row.status_updated_at })) });
}

/** Edita atributos del automóvil; no permite cambiar cliente para mantener la asociación como acción explícita. */
export async function updateVehicle(req, res) {
  const vehicle = validateVehicle(req.body);
  const [[existing]] = await pool.execute('SELECT vehicle_id,customer_id,workshop_id FROM vehicles WHERE vehicle_id=? LIMIT 1', [req.params.vehicleId]);
  if (!existing) throw Object.assign(new Error('No se encontró el vehículo.'), { status: 404 });
  if (existing.customer_id && existing.workshop_id !== vehicle.workshopId) throw Object.assign(new Error('No puedes cambiar el taller de un automóvil vinculado a un cliente.'), { status: 409, details: { workshopId: 'El vehículo está asociado a un cliente de su taller actual.' } });
  const [[workshop]] = await pool.execute("SELECT workshop_id FROM workshops WHERE workshop_id=? AND status_id=? LIMIT 1", [vehicle.workshopId, activeStatusId]);
  if (!workshop) throw Object.assign(new Error('Selecciona un taller activo.'), { status: 400 });
  await pool.execute('UPDATE vehicles SET workshop_id=?,make=?,model=?,model_year=?,plate=?,vin=?,version=?,color=?,mileage=? WHERE vehicle_id=?', [vehicle.workshopId, vehicle.make, vehicle.model, vehicle.modelYear, vehicle.plate, vehicle.vin, vehicle.version, vehicle.color, vehicle.mileage, req.params.vehicleId]);
  await logEvent('info', 'Vehículo actualizado', { module: 'vehicles', vehicleId: req.params.vehicleId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: 'Datos del vehículo actualizados.' });
}

/** Cambia el estatus administrativo sin eliminar el registro ni su historial. */
export async function setVehicleLifecycleStatus(req, res) {
  const status = String(req.body.status || '');
  if (!['active','inactive','deleted'].includes(status)) throw Object.assign(new Error('Selecciona un estatus válido.'), { status: 400 });
  const [[catalog]] = await pool.execute('SELECT status_id FROM statuses WHERE status_key=? LIMIT 1', [status]);
  const [result] = await pool.execute('UPDATE vehicles SET status_id=? WHERE vehicle_id=?', [catalog.status_id, req.params.vehicleId]);
  if (!result.affectedRows) throw Object.assign(new Error('No se encontró el vehículo.'), { status: 404 });
  await logEvent('info', 'Estatus administrativo de vehículo actualizado', { module: 'vehicles', vehicleId: req.params.vehicleId, actorId: req.auth.id, status, requestId: req.requestId });
  res.json({ message: 'Estatus del vehículo actualizado.', status });
}

/** Vincula vehículo sin propietario a cliente activo del mismo taller; la ruta limita acceso a administración y recepción. */
export async function associateVehicleClient(req, res) {
  const customerId = String(req.body.customerId || '');
  if (!/^\w{8}-\w{4}-7\w{3}-[89ab]\w{3}-\w{12}$/i.test(customerId)) throw Object.assign(new Error('Selecciona un cliente válido.'), { status: 400 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[vehicle]] = await connection.execute("SELECT v.vehicle_id,v.workshop_id,v.customer_id,s.status_key FROM vehicles v JOIN statuses s ON s.status_id=v.status_id WHERE v.vehicle_id=? FOR UPDATE", [req.params.vehicleId]);
    if (!vehicle || vehicle.status_key !== 'active') throw Object.assign(new Error('No se encontró un vehículo activo.'), { status: 404 });
    if (vehicle.customer_id) throw Object.assign(new Error('El vehículo ya está asociado a un cliente.'), { status: 409 });
    const [[customer]] = await connection.execute("SELECT c.customer_id FROM customers c JOIN statuses s ON s.status_id=c.status_id WHERE c.customer_id=? AND c.workshop_id=? AND s.status_key='active' FOR UPDATE", [customerId, vehicle.workshop_id]);
    if (!customer) throw Object.assign(new Error('Solo puedes vincular un cliente activo del mismo taller.'), { status: 400 });
    await connection.execute('UPDATE vehicles SET customer_id=? WHERE vehicle_id=?', [customerId, vehicle.vehicle_id]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  await logEvent('info', 'Cliente asociado a vehículo', { module: 'vehicles', vehicleId: req.params.vehicleId, customerId, actorId: req.auth.id, requestId: req.requestId });
  res.json({ message: 'Vehículo asociado al cliente activo.' });
}

/** Consulta el último avance de cada automóvil: clientes solo reciben sus autos vinculados y personal autorizado ve la flota. */
export async function listVehicleStatuses(req, res) {
  const isCustomer = req.auth.forceOwnVehicles || (req.auth.roles.includes('customer') && !req.auth.roles.some((role) => ['administrator','receptionist','technician','service_advisor'].includes(role)));
  const params = [];
  let filter = '';
  if (isCustomer) { filter = 'AND c.user_id=?'; params.push(req.auth.id); }
  const [rows] = await pool.execute(`SELECT v.vehicle_id,v.plate,v.make,v.model,v.model_year,c.customer_name,c.user_id,w.workshop_name,
    latest.status_key,latest.condition_summary,latest.pending_work,latest.created_at AS status_updated_at
    FROM vehicles v JOIN customers c ON c.customer_id=v.customer_id JOIN workshops w ON w.workshop_id=v.workshop_id
    LEFT JOIN vehicle_status_updates latest ON latest.update_id=(SELECT u.update_id FROM vehicle_status_updates u WHERE u.vehicle_id=v.vehicle_id ORDER BY u.created_at DESC,u.update_id DESC LIMIT 1)
    WHERE 1=1 ${filter} ORDER BY latest.created_at DESC`, params);
  res.json({ vehicles: rows.map((row) => ({ vehicleId: row.vehicle_id, plate: row.plate, make: row.make, model: row.model, modelYear: row.model_year, customerName: row.customer_name, workshopName: row.workshop_name, statusKey: row.status_key, conditionSummary: row.condition_summary, pendingWork: row.pending_work, statusUpdatedAt: row.status_updated_at })) });
}

/** Aísla por diseño el portal de clientes para que nunca devuelva autos de otra cuenta, incluso con roles mixtos. */
export async function listCustomerVehicleStatuses(req, res) { req.auth.forceOwnVehicles = true; return listVehicles(req, res); }

/** Crea un registro de ingreso para que el contador de visitas refleje visitas reales y auditables. */
export async function recordWorkshopVisit(req, res) {
  const workshopId = String(req.body.workshopId || '');
  const customerId = String(req.body.customerId || '');
  const vehicleDescription = String(req.body.vehicleDescription || '').trim();
  const visitNote = String(req.body.visitNote || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(workshopId) || !/^[0-9a-f-]{36}$/i.test(customerId) || vehicleDescription.length > 160 || visitNote.length > 500) throw Object.assign(new Error('Completa los datos de la visita.'), { status: 400 });
  const [[customer]] = await pool.execute("SELECT c.customer_id, c.customer_name, c.workshop_id FROM customers c JOIN statuses s ON s.status_id=c.status_id WHERE c.customer_id=? AND s.status_key<>'deleted'", [customerId]);
  if (!customer) throw Object.assign(new Error('No se encontró el cliente seleccionado.'), { status: 404 });
  const [[workshop]] = await pool.execute("SELECT workshop_id, workshop_name FROM workshops w JOIN statuses s ON s.status_id=w.status_id WHERE w.workshop_id=? AND s.status_key='active'", [workshopId]);
  if (!workshop) throw Object.assign(new Error('El taller seleccionado no existe o está inactivo.'), { status: 400 });
  await pool.execute('INSERT INTO workshop_visits(visit_id,workshop_id,customer_id,vehicle_description,visit_note,registered_by) VALUES (?,?,?,?,?,?)', [uuidv7(), workshopId, customerId, vehicleDescription || null, visitNote || null, req.auth.id]);
  await logEvent('info', 'Visita de cliente registrada', { module: 'workshop-visits', workshopId, customerId, actorId: req.auth.id, requestId: req.requestId });
  res.status(201).json({ message: 'Visita registrada.' });
}

/** Consulta el historial de visitas para visualización en las sedes de taller. */
export async function listWorkshopVisits(_req, res) {
  const [rows] = await pool.query(`SELECT v.visit_id, v.workshop_id, v.customer_id, c.customer_name, w.workshop_name,
    v.vehicle_description, v.visit_note, v.visited_at, u.username AS registered_by_username
    FROM workshop_visits v
    JOIN customers c ON c.customer_id=v.customer_id
    JOIN workshops w ON w.workshop_id=v.workshop_id
    LEFT JOIN users u ON u.user_id=v.registered_by
    ORDER BY v.visited_at DESC`);
  res.json({ visits: rows.map((r) => ({
    visitId: r.visit_id,
    workshopId: r.workshop_id,
    workshopName: r.workshop_name,
    customerId: r.customer_id,
    customerName: r.customer_name,
    vehicleDescription: r.vehicle_description,
    visitNote: r.visit_note,
    visitedAt: r.visited_at,
    registeredBy: r.registered_by_username
  })) });
}

/** Adapta la representación SQL de taller al contrato JSON de los componentes. */
function mapWorkshop(row) { return { workshopId: row.workshop_id, workshopName: row.workshop_name, rfc: row.rfc, contactEmail: row.contact_email, photoUrl: row.photo_path, address: { street: row.street, streetNumber: row.street_number, neighborhood: row.neighborhood, postalCode: row.postal_code, municipality: row.municipality, state: row.state }, status: row.status_key, visitCount: Number(row.visit_count), createdAt: row.created_at }; }
