const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const gmailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;
const namePattern = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'&()_-]{1,118}$/u;
const rfcPattern = /^(?:[A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
const addressPattern = /^[\p{L}\p{M}\p{N} .,'#()/-]{1,120}$/u;

/** Valida tipo, tamaño y firma real de una imagen recibida para carga automática desde el formulario.
 * @param {{mimeType?:string,dataBase64?:string}} image Imagen en data URL.
 * @param {number} maxBytes Tamaño máximo permitido en bytes.
 * @returns {{mimeType:string,extension:string,data:Buffer,dataBase64:string}} Imagen verificada para guardar.
 * @throws {Error} HTTP 400 con error de campo `photo` si el contenido no es una imagen permitida.
 */
export function validateWorkshopPhoto(image, maxBytes) {
  const errors = {};
  if (!image || typeof image.dataBase64 !== 'string' || typeof image.mimeType !== 'string') errors.photo = 'Selecciona una fotografía del taller.';
  let parsed;
  if (!errors.photo) {
    const match = image.dataBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
    if (!match || match[1] !== image.mimeType) errors.photo = 'El archivo debe ser una imagen JPG, PNG o WebP válida.';
    else {
      const data = Buffer.from(match[2], 'base64');
      if (!data.length || data.length > maxBytes) errors.photo = `La imagen no puede superar ${Math.floor(maxBytes / (1024 * 1024))} MB.`;
      else if (!hasImageSignature(data, match[1])) errors.photo = 'El contenido del archivo no corresponde a una imagen válida.';
      else parsed = { mimeType: match[1], extension: ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[match[1]], data, dataBase64: image.dataBase64 };
    }
  }
  if (Object.keys(errors).length) throw Object.assign(new Error('Revisa la fotografía seleccionada.'), { status: 400, details: errors });
  return parsed;
}

/** Normaliza el alta de taller y valida dirección, RFC, contacto y firma real del archivo de imagen. */
export function validateWorkshop(input, maxBytes) {
  const errors = {};
  const workshopName = String(input.workshopName || '').trim().replace(/\s+/g, ' ');
  const rfc = String(input.rfc || '').trim().toUpperCase();
  const contactEmail = String(input.contactEmail || '').trim().toLowerCase();
  const street = String(input.street || '').trim();
  const streetNumber = String(input.streetNumber || '').trim();
  const neighborhood = String(input.neighborhood || '').trim();
  const postalCode = String(input.postalCode || '').trim();
  const municipality = String(input.municipality || '').trim();
  const state = String(input.state || '').trim();
  if (!namePattern.test(workshopName)) errors.workshopName = 'Escribe un nombre de taller de 2 a 120 caracteres.';
  if (!rfcPattern.test(rfc)) errors.rfc = 'Escribe un RFC válido de persona física o moral.';
  if (!emailPattern.test(contactEmail) || !gmailPattern.test(contactEmail) || contactEmail.length > 190) errors.contactEmail = 'Usa una dirección Gmail válida para el contacto del taller.';
  for (const [field, value] of Object.entries({ street, streetNumber, neighborhood, municipality, state })) {
    if (!addressPattern.test(value)) errors[field] = 'Completa este dato de dirección con caracteres válidos.';
  }
  if (!/^\d{5}$/.test(postalCode)) errors.postalCode = 'El código postal debe tener cinco dígitos.';
  let photo;
  try { photo = validateWorkshopPhoto(input.photo, maxBytes); } catch (error) { errors.photo = error.details?.photo || 'Selecciona una fotografía JPG, PNG o WebP válida.'; }
  if (Object.keys(errors).length) throw Object.assign(new Error('Revisa los campos marcados.'), { status: 400, details: errors });
  return { workshopName, normalizedName: workshopName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX'), rfc, contactEmail, street, streetNumber, neighborhood, postalCode, municipality, state, photo };
}

/** Verifica firmas binarias comunes para que renombrar un archivo no permita subir contenido ajeno. */
function hasImageSignature(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

/** Valida el perfil del cliente dentro de un taller existente, admitiendo campos detallados o consolidados. */
export function validateCustomer(input) {
  const errors = {};
  let firstName = String(input.firstName || input.nombre || '').trim();
  let lastName = String(input.lastName || input.ape || input.apellidos || '').trim();
  let customerName = String(input.customerName || '').trim().replace(/\s+/g, ' ');

  if (firstName || lastName) {
    if (!namePattern.test(firstName) || firstName.length > 80) errors.firstName = 'Escribe un nombre válido (2 a 80 caracteres).';
    if (!namePattern.test(lastName) || lastName.length > 80) errors.lastName = 'Escribe los apellidos válidos (2 a 80 caracteres).';
    customerName = `${firstName} ${lastName}`.trim();
  } else if (customerName) {
    if (!namePattern.test(customerName) || customerName.length > 160) errors.customerName = 'Escribe un nombre válido.';
    else {
      const parts = customerName.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
  } else {
    errors.firstName = 'Escribe el nombre del cliente.';
    errors.lastName = 'Escribe los apellidos del cliente.';
  }

  const personalPhone = String(input.personalPhone || input.telefonoPersonal || '').trim();
  const workPhone = String(input.workPhone || input.telefonoTrabajo || '').trim();
  const alternativeContactName = String(input.alternativeContactName || input.contactoAlternativoNombre || '').trim();
  const alternativeContactPhone = String(input.alternativeContactPhone || input.contactoAlternativoTelefono || input.telefonoContacto || '').trim();
  let contactPhone = String(input.contactPhone || alternativeContactPhone || personalPhone || '').trim();

  if (personalPhone && !/^\+?[0-9 ()-]{8,20}$/.test(personalPhone)) errors.personalPhone = 'Escribe un teléfono personal válido.';
  if (workPhone && !/^\+?[0-9 ()-]{8,20}$/.test(workPhone)) errors.workPhone = 'Escribe un teléfono de trabajo válido.';
  if (alternativeContactName && (!namePattern.test(alternativeContactName) || alternativeContactName.length > 160)) {
    errors.alternativeContactName = 'Escribe el nombre completo del contacto alternativo válido.';
  }
  if (alternativeContactPhone && !/^\+?[0-9 ()-]{8,20}$/.test(alternativeContactPhone)) {
    errors.alternativeContactPhone = 'Escribe un teléfono de contacto alternativo válido.';
  }

  if (!contactPhone && !personalPhone) {
    errors.contactPhone = 'Ingresa al menos un número telefónico de contacto.';
  } else if (contactPhone && !/^\+?[0-9 ()-]{8,20}$/.test(contactPhone)) {
    errors.contactPhone = 'Escribe un número de contacto válido.';
  }

  const email = String(input.email || '').trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 190) errors.email = 'Escribe un correo válido.';

  const street = String(input.street || input.calle || '').trim();
  const streetNumber = String(input.streetNumber || input.numero || '').trim();
  const neighborhood = String(input.neighborhood || input.colonia || '').trim();
  const postalCode = String(input.postalCode || input.codigoPostal || '').trim();
  const municipality = String(input.municipality || input.municipio || '').trim();
  const state = String(input.state || input.estado || '').trim();
  let address = String(input.address || '').trim().replace(/\s+/g, ' ');

  if (street || streetNumber || neighborhood || postalCode || municipality || state) {
    if (street && !addressPattern.test(street)) errors.street = 'Escribe una calle válida.';
    if (streetNumber && !addressPattern.test(streetNumber)) errors.streetNumber = 'Escribe un número válido.';
    if (neighborhood && !addressPattern.test(neighborhood)) errors.neighborhood = 'Escribe una colonia válida.';
    if (postalCode && !/^\d{5}$/.test(postalCode)) errors.postalCode = 'El código postal debe ser de 5 dígitos.';
    if (municipality && !addressPattern.test(municipality)) errors.municipality = 'Escribe un municipio válido.';
    if (state && !addressPattern.test(state)) errors.state = 'Escribe un estado válido.';

    const addrParts = [];
    if (street) addrParts.push(streetNumber ? `${street} #${streetNumber}` : street);
    if (neighborhood) addrParts.push(`Col. ${neighborhood}`);
    if (postalCode) addrParts.push(`C.P. ${postalCode}`);
    if (municipality) addrParts.push(municipality);
    if (state) addrParts.push(state);
    if (!address && addrParts.length) address = addrParts.join(', ');
  }

  if (!address || !addressPattern.test(address) || address.length > 255) errors.address = 'Escribe la dirección del cliente.';

  const workshopId = String(input.workshopId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workshopId)) {
    errors.workshopId = 'Selecciona un taller válido.';
  }

  if (Object.keys(errors).length) throw Object.assign(new Error('Revisa los campos marcados.'), { status: 400, details: errors });

  return {
    customerName,
    firstName,
    lastName,
    contactPhone,
    personalPhone: personalPhone || null,
    workPhone: workPhone || null,
    alternativeContactName: alternativeContactName || null,
    alternativeContactPhone: alternativeContactPhone || null,
    email,
    address,
    street: street || null,
    streetNumber: streetNumber || null,
    neighborhood: neighborhood || null,
    postalCode: postalCode || null,
    municipality: municipality || null,
    state: state || null,
    workshopId
  };
}

/** Valida un vehículo y su propietario dentro del mismo taller. */
export function validateVehicle(input) {
  const errors = {};
  const workshopId = String(input.workshopId || '').trim();
  const make = String(input.make || '').trim().replace(/\s+/g, ' ');
  const model = String(input.model || '').trim().replace(/\s+/g, ' ');
  const plate = String(input.plate || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const vin = String(input.vin || '').trim().toUpperCase();
  const version = String(input.version || '').trim();
  const color = String(input.color || '').trim();
  const year = input.modelYear ? Number(input.modelYear) : null;
  const mileage = input.mileage === '' || input.mileage === undefined || input.mileage === null ? null : Number(input.mileage);
  if (!/^[\p{L}\p{M}\p{N} .'-]{2,60}$/u.test(make)) errors.make = 'Escribe la marca.';
  if (!/^[\p{L}\p{M}\p{N} .'-]{1,80}$/u.test(model)) errors.model = 'Escribe el modelo.';
  if (!/^[A-Z0-9]{5,12}$/.test(plate)) errors.plate = 'Escribe una placa válida (5–12 letras y números).';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) errors.vin = 'El VIN debe tener 17 caracteres válidos.';
  if (version.length > 80 || !/^[\p{L}\p{M}\p{N} .,'()/_-]{1,80}$/u.test(version)) errors.version = 'Escribe una versión válida (máximo 80 caracteres).';
  if (!/^[\p{L}\p{M}\p{N} .,'#()/_-]{2,50}$/u.test(color)) errors.color = 'Escribe un color válido.';
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) errors.modelYear = 'Escribe un año válido.';
  if (year === null) errors.modelYear = 'Escribe el año del vehículo.';
  if (mileage !== null && (!Number.isInteger(mileage) || mileage < 0 || mileage > 2000000)) errors.mileage = 'El kilometraje debe ser un entero entre 0 y 2,000,000.';
  if (!/^\w{8}-\w{4}-7\w{3}-[89ab]\w{3}-\w{12}$/i.test(workshopId)) errors.workshopId = 'Selecciona un taller.';
  if (Object.keys(errors).length) throw Object.assign(new Error('Revisa los campos marcados.'), { status: 400, details: errors });
  return { workshopId, make, model, plate, vin, version, color, mileage, modelYear: year };
}
