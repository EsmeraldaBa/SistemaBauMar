import React, { useEffect, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';
import { Field } from '../components/Brand.jsx';

const blankWorkshop = { workshopName: '', rfc: '', contactEmail: '', street: '', streetNumber: '', neighborhood: '', postalCode: '', municipality: '', state: '' };
const blankClient = { customerName: '', contactPhone: '', address: '', email: '', workshopId: '' };
const blankVehicle = { workshopId: '', customerId: '', make: '', model: '', modelYear: '', plate: '' };
const postalMaxMb = Number(import.meta.env.VITE_WORKSHOP_IMAGE_MB || 5);
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const gmailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;
const personalNamePattern = /^[\p{L}\p{M}][\p{L}\p{M} .,'-]{1,158}$/u;
const rfcPattern = /^(?:[A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
const workshopNamePattern = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'&()_-]{1,118}$/u;
const addressValuePattern = /^[\p{L}\p{M}\p{N} .,'#()/-]{1,120}$/u;

function Heading({ overline, title, description, action }) { return <div className="page-heading"><div><span className="overline">{overline}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function ErrorBlock({ error }) { return error ? <div className="inline-error" role="alert">{error}</div> : null; }

/** Visualización integral de talleres: muestra sedes, clientes vinculados e historial de visitas; el alta es de administrador. */
export function WorkshopsPage({ isAdmin, notify }) {
  const [workshops, setWorkshops] = useState([]);
  const [clients, setClients] = useState([]);
  const [visits, setVisits] = useState([]);
  const [expandedVisits, setExpandedVisits] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blankWorkshop);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  const [addressError, setAddressError] = useState('');

  async function load() {
    try {
      const [workshopData, clientData, visitData] = await Promise.all([
        bauMar.workshops(),
        bauMar.clients(),
        bauMar.visits().catch(() => ({ visits: [] })),
      ]);
      setWorkshops(workshopData.workshops);
      setClients(clientData.customers || []);
      setVisits(visitData.visits || []);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  function update(event) {
    const { name, value } = event.target;
    setForm((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
  }

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    setPhoto(null);
    setErrors((old) => ({ ...old, photo: undefined }));
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((old) => ({ ...old, photo: 'Solo se permiten imágenes JPG, PNG o WebP.' }));
      event.target.value = '';
      return;
    }
    if (file.size > postalMaxMb * 1024 * 1024) {
      setErrors((old) => ({ ...old, photo: `La foto no debe superar ${postalMaxMb} MB.` }));
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setPhotoBusy(true);
      try {
        const previewUrl = String(reader.result);
        const result = await bauMar.uploadWorkshopPhoto({ mimeType: file.type, dataBase64: previewUrl });
        setPhoto({ photoToken: result.photoToken, previewUrl });
        setErrors((old) => ({ ...old, photo: undefined }));
      } catch (error) {
        setPhoto(null);
        setErrors((old) => ({ ...old, photo: error.details?.photo || error.message }));
      } finally {
        setPhotoBusy(false);
      }
    };
    reader.onerror = () => setErrors((old) => ({ ...old, photo: 'No se pudo leer la imagen.' }));
    reader.readAsDataURL(file);
  }

  async function lookup(query) {
    setAddressError('');
    setLocations([]);
    try {
      const result = await bauMar.lookupAddress(query);
      setLocations(result.locations);
      if (!result.locations.length) setAddressError(result.message);
    } catch (e) {
      setAddressError(e.message);
    }
  }

  function searchAddressOnEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.currentTarget.name === 'postalCode') {
      if (!/^\d{5}$/.test(form.postalCode.trim())) {
        setAddressError('Escribe un código postal de cinco dígitos y presiona Enter.');
        return;
      }
      lookup({ postalCode: form.postalCode.trim() });
      return;
    }
    const query = {
      ...(form.state.trim() ? { state: form.state.trim() } : {}),
      ...(form.municipality.trim() ? { municipality: form.municipality.trim() } : {}),
      ...(form.neighborhood.trim() ? { neighborhood: form.neighborhood.trim() } : {}),
    };
    if (!Object.keys(query).length) {
      setAddressError('Escribe un estado, municipio o colonia y presiona Enter.');
      return;
    }
    lookup(query);
  }

  function selectLocation(location) {
    setForm((old) => ({
      ...old,
      postalCode: location.postalCode,
      neighborhood: location.neighborhood,
      municipality: location.municipality,
      state: location.state,
    }));
    setLocations([]);
    setAddressError('');
  }

  function validateWorkshopForm() {
    const next = {};
    if (!workshopNamePattern.test(form.workshopName.trim())) next.workshopName = 'Escribe un nombre de taller válido de 2 a 120 caracteres.';
    if (!rfcPattern.test(form.rfc.trim().toUpperCase())) next.rfc = 'Escribe un RFC válido de 12 o 13 caracteres.';
    if (!emailPattern.test(form.contactEmail.trim()) || !gmailPattern.test(form.contactEmail.trim())) next.contactEmail = 'Usa una dirección Gmail válida para el contacto del taller.';
    for (const key of ['street','streetNumber','neighborhood','municipality','state']) if (!addressValuePattern.test(form[key].trim())) next[key] = 'Completa este dato con letras, números y caracteres de dirección válidos.';
    if (!/^\d{5}$/.test(form.postalCode)) next.postalCode = 'Usa un código postal de cinco dígitos.';
    if (!photo) next.photo = 'Selecciona una foto JPG, PNG o WebP.';
    return next;
  }

  async function save(event) {
    event.preventDefault();
    const next = validateWorkshopForm();
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await bauMar.createWorkshop({ ...form, rfc: form.rfc.toUpperCase(), photoToken: photo.photoToken });
      setForm(blankWorkshop);
      setPhoto(null);
      setFormOpen(false);
      notify({ type: 'success', message: 'Taller registrado correctamente.' });
      await load();
    } catch (e) {
      setErrors(e.details || {});
      notify({ type: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(workshop, status) {
    try {
      await bauMar.setWorkshopStatus(workshop.workshopId, status);
      notify({ type: 'success', message: 'Estado del taller actualizado.' });
      await load();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  }

  return (
    <>
      <Heading
        overline="SEDES Y SUCURSALES"
        title="Talleres"
        description="Visualiza las sedes activas, clientes vinculados e historial de visitas. La creación y estatus corresponden al administrador."
        action={isAdmin && <button className="button primary" onClick={() => setFormOpen((open) => !open)}>＋ Nuevo taller</button>}
      />
      <ErrorBlock error={error} />
      {!isAdmin && <div className="info-banner">Modo de consulta: la creación y modificación de sedes están reservadas al administrador.</div>}
      {formOpen && isAdmin && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <span className="overline">NUEVA SEDE</span>
              <h2>Registrar taller</h2>
            </div>
            <button className="icon-close" type="button" onClick={() => { setFormOpen(false); setErrors({}); }}>×</button>
          </div>
          <form className="field-grid" onSubmit={save} noValidate>
            <Field label="Nombre del taller" name="workshopName" autoComplete="organization" maxLength={120} value={form.workshopName} onChange={update} error={errors.workshopName} />
            <Field label="RFC" name="rfc" autoCapitalize="characters" maxLength={13} value={form.rfc} onChange={update} error={errors.rfc} />
            <Field label="Gmail de contacto del taller" name="contactEmail" type="email" maxLength={190} value={form.contactEmail} onChange={update} error={errors.contactEmail} />
            <label className={`field ${errors.photo ? 'has-error' : ''}`}>
              <span>Fotografía del taller · máximo {postalMaxMb} MB</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} aria-invalid={Boolean(errors.photo)} disabled={photoBusy} />
              {photoBusy && <small>Guardando fotografía automáticamente…</small>}
              {errors.photo && <small>{errors.photo}</small>}
              {photo && (
                <>
                  <small>Fotografía guardada automáticamente.</small>
                  <img className="workshop-photo-preview" src={photo.previewUrl} alt="Vista previa de la fotografía guardada" />
                </>
              )}
            </label>
            <div className="address-lookup">
              <span className="overline">DIRECCIÓN COMPLETA</span>
              <p>Escribe el código postal y presiona Enter, o escribe estado, municipio o colonia y presiona Enter. Elige una coincidencia para completar la dirección.</p>
              {addressError && <small className="field-hint error-text">{addressError}</small>}
              {locations.length > 0 && (
                <label className="field">
                  <span>Coincidencias postales</span>
                  <select value="" onChange={(e) => selectLocation(locations[Number(e.target.value)])}>
                    <option value="">Elige colonia · C.P. · municipio · estado</option>
                    {locations.map((location, index) => (
                      <option value={index} key={`${location.postalCode}-${location.neighborhood}-${index}`}>
                        {location.neighborhood} · {location.postalCode} · {location.municipality}, {location.state}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <Field label="Calle" name="street" maxLength={120} value={form.street} onChange={update} error={errors.street} />
            <Field label="Número" name="streetNumber" maxLength={20} value={form.streetNumber} onChange={update} error={errors.streetNumber} />
            <Field label="Colonia" name="neighborhood" maxLength={100} value={form.neighborhood} onChange={update} onKeyDown={searchAddressOnEnter} error={errors.neighborhood} />
            <Field label="Código postal" name="postalCode" inputMode="numeric" maxLength={5} value={form.postalCode} onChange={update} onKeyDown={searchAddressOnEnter} error={errors.postalCode} />
            <Field label="Municipio" name="municipality" maxLength={100} value={form.municipality} onChange={update} onKeyDown={searchAddressOnEnter} error={errors.municipality} />
            <Field label="Estado" name="state" maxLength={100} value={form.state} onChange={update} onKeyDown={searchAddressOnEnter} error={errors.state} />
            <div className="form-actions">
              <span>La foto acepta JPG, PNG o WebP y se guarda al seleccionarla.</span>
              <button className="button primary" disabled={busy || photoBusy}>{busy ? 'Guardando…' : 'Guardar taller'}</button>
            </div>
          </form>
        </section>
      )}

      <div className="workshop-grid">
        {workshops.map((workshop) => {
          const shopClients = clients.filter((c) => c.workshopId === workshop.workshopId);
          const shopVisits = visits.filter((v) => v.workshopId === workshop.workshopId);
          const isVisitsOpen = Boolean(expandedVisits[workshop.workshopId]);

          return (
            <article className="workshop-card" key={workshop.workshopId}>
              <img src={workshop.photoUrl} alt={`Fotografía de ${workshop.workshopName}`} />
              <div className="workshop-card-content">
                <div className="workshop-card-title">
                  <div>
                    <span className="overline">RFC {workshop.rfc}</span>
                    <h2>{workshop.workshopName}</h2>
                  </div>
                  <span className={`status-label ${workshop.status}`}>
                    <i />
                    {{ active: 'Activo', inactive: 'Inactivo', deleted: 'Eliminado' }[workshop.status]}
                  </span>
                </div>
                <p>{workshop.contactEmail}</p>
                <p>
                  {workshop.address.street} {workshop.address.streetNumber}, {workshop.address.neighborhood}, {workshop.address.postalCode} · {workshop.address.municipality}, {workshop.address.state}
                </p>

                {isAdmin && (
                  <label className="field compact-field">
                    <span>Estado</span>
                    <select value={workshop.status} onChange={(e) => setStatus(workshop, e.target.value)}>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="deleted">Eliminado</option>
                    </select>
                  </label>
                )}

                {/* Panel de visualización de relaciones del taller */}
                <div className="workshop-relations-box">
                  <div className="relations-summary">
                    <div className="relation-stat">
                      <b>{shopClients.length}</b>
                      <span>clientes vinculados</span>
                    </div>
                    <div className="relation-stat">
                      <b>{workshop.visitCount || shopVisits.length}</b>
                      <span>visitas registradas</span>
                    </div>
                  </div>

                  <div className="workshop-clients-list">
                    <span className="overline">CLIENTES ASOCIADOS ({shopClients.length})</span>
                    {shopClients.length > 0 ? (
                      <ul className="workshop-client-items">
                        {shopClients.map((c) => (
                          <li key={c.customerId} className="workshop-client-item">
                            <div>
                              <b>{c.customerName}</b>
                              <small>{c.contactPhone}{c.email ? ` · ${c.email}` : ''}</small>
                            </div>
                            <span className={`client-badge ${c.portalLinked ? '' : 'unlinked'}`}>
                              {c.portalLinked ? 'Portal vinculado' : 'Sin portal'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="subtle">Aún no hay clientes vinculados a esta sede.</p>
                    )}
                  </div>

                  {shopVisits.length > 0 && (
                    <div className="workshop-visits-history">
                      <button
                        type="button"
                        className="text-action"
                        onClick={() =>
                          setExpandedVisits((prev) => ({
                            ...prev,
                            [workshop.workshopId]: !prev[workshop.workshopId],
                          }))
                        }
                      >
                        {isVisitsOpen ? 'Ocultar visitas ▲' : `Ver visitas registradas (${shopVisits.length}) ▼`}
                      </button>
                      {isVisitsOpen && (
                        <div className="workshop-visits-table-wrap">
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>FECHA</th>
                                <th>CLIENTE</th>
                                <th>VEHÍCULO</th>
                                <th>MOTIVO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shopVisits.map((v) => (
                                <tr key={v.visitId}>
                                  <td><small>{new Date(v.visitedAt).toLocaleDateString('es-MX')}</small></td>
                                  <td><b>{v.customerName}</b></td>
                                  <td>{v.vehicleDescription || '—'}</td>
                                  <td><small>{v.visitNote || 'Ingreso registrado'}</small></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {workshops.length === 0 && (
          <div className="empty-panel">
            <span className="empty-icon">⌂</span>
            <h3>Aún no hay talleres</h3>
            <p>Registra el primer taller para poder visualizar sedes y vincular clientes.</p>
          </div>
        )}
      </div>
    </>
  );
}

const blankCustomerExtended = {
  firstName: '',
  lastName: '',
  email: '',
  personalPhone: '',
  workPhone: '',
  alternativeContactName: '',
  alternativeContactPhone: '',
  street: '',
  streetNumber: '',
  neighborhood: '',
  postalCode: '',
  municipality: '',
  state: '',
  workshopId: '',
};

/** Pantalla dedicada a registrar nuevos clientes con alertas, validaciones y datos de contacto detallados. */
export function RegisterClientPage({ canRegisterClient, notify, onNavigate }) {
  const [form, setForm] = useState(blankCustomerExtended);
  const [workshops, setWorkshops] = useState([]);
  const [errors, setErrors] = useState({});
  const [alertError, setAlertError] = useState('');
  const [alertSuccess, setAlertSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState([]);
  const [addressLookupMsg, setAddressLookupMsg] = useState('');

  async function loadWorkshops() {
    try {
      const data = await bauMar.workshops();
      const activeShops = (data.workshops || []).filter((w) => w.status === 'active');
      setWorkshops(activeShops);
      if (activeShops.length === 1 && !form.workshopId) {
        setForm((prev) => ({ ...prev, workshopId: activeShops[0].workshopId }));
      }
    } catch (e) {
      setAlertError('No se pudieron cargar los talleres activos.');
    }
  }

  useEffect(() => { loadWorkshops(); }, []);

  function update(e) {
    const { name, value } = e.target;
    setForm((old) => ({ ...old, [name]: value }));
    setErrors((old) => ({ ...old, [name]: undefined }));
    setAlertError('');
    setAlertSuccess('');
  }

  async function lookupZip(zip) {
    if (!/^\d{5}$/.test(zip.trim())) return;
    setAddressLookupMsg('');
    try {
      const res = await bauMar.lookupAddress({ postalCode: zip.trim() });
      setLocations(res.locations || []);
      if (!res.locations?.length) setAddressLookupMsg('No se encontraron colonias para ese código postal.');
    } catch {
      setAddressLookupMsg('Consulta postal no disponible; ingresa la colonia manualmente.');
    }
  }

  function handleZipKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupZip(form.postalCode);
    }
  }

  function selectLocation(loc) {
    setForm((prev) => ({
      ...prev,
      neighborhood: loc.neighborhood,
      municipality: loc.municipality,
      state: loc.state,
      postalCode: loc.postalCode,
    }));
    setLocations([]);
    setAddressLookupMsg('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setAlertError('');
    setAlertSuccess('');

    const newErrors = {};
    if (!personalNamePattern.test(form.firstName.trim())) newErrors.firstName = 'Escribe un nombre válido (2 a 80 caracteres).';
    if (!personalNamePattern.test(form.lastName.trim())) newErrors.lastName = 'Escribe los apellidos válidos (2 a 80 caracteres).';
    if (!emailPattern.test(form.email.trim())) newErrors.email = 'Escribe un correo electrónico válido.';

    if (!form.personalPhone.trim() && !form.alternativeContactPhone.trim()) {
      newErrors.personalPhone = 'Ingresa el teléfono personal o el teléfono de contacto alternativo.';
    }
    if (form.personalPhone.trim() && !/^\+?[0-9 ()-]{8,20}$/.test(form.personalPhone.trim())) {
      newErrors.personalPhone = 'Escribe un teléfono personal válido (8 a 20 dígitos).';
    }
    if (form.workPhone.trim() && !/^\+?[0-9 ()-]{8,20}$/.test(form.workPhone.trim())) {
      newErrors.workPhone = 'Escribe un teléfono de trabajo válido.';
    }

    // Contacto alternativo
    if (form.alternativeContactPhone.trim()) {
      if (!/^\+?[0-9 ()-]{8,20}$/.test(form.alternativeContactPhone.trim())) {
        newErrors.alternativeContactPhone = 'Escribe un teléfono de contacto alternativo válido.';
      }
      if (!form.alternativeContactName.trim() || !personalNamePattern.test(form.alternativeContactName.trim())) {
        newErrors.alternativeContactName = 'Escribe el nombre completo de la persona de contacto alternativo.';
      }
    } else if (form.alternativeContactName.trim()) {
      newErrors.alternativeContactPhone = 'Ingresa el teléfono correspondiente al contacto alternativo.';
    }

    // Dirección
    if (!form.street.trim() || !addressValuePattern.test(form.street.trim())) newErrors.street = 'Escribe la calle.';
    if (!form.streetNumber.trim()) newErrors.streetNumber = 'Escribe el número.';
    if (!form.neighborhood.trim()) newErrors.neighborhood = 'Escribe la colonia.';
    if (!/^\d{5}$/.test(form.postalCode.trim())) newErrors.postalCode = 'El código postal debe tener 5 dígitos.';
    if (!form.municipality.trim()) newErrors.municipality = 'Escribe el municipio o alcaldía.';
    if (!form.state.trim()) newErrors.state = 'Escribe el estado.';

    // Taller asociado
    if (!form.workshopId) newErrors.workshopId = 'Selecciona el taller mecánico al que se asociará el cliente.';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      setAlertError('Por favor revisa los campos señalados antes de continuar.');
      return;
    }

    setBusy(true);
    try {
      const res = await bauMar.createClient(form);
      const msg = res.message || `Cliente "${form.firstName} ${form.lastName}" registrado exitosamente.`;
      setAlertSuccess(msg);
      notify({ type: 'success', message: msg });
      setForm(blankCustomerExtended);
      setLocations([]);
    } catch (err) {
      const serverDetails = err.details || {};
      setErrors(serverDetails);
      const errorMsg = err.message || 'No se pudo registrar el cliente. Revisa los datos ingresados.';
      setAlertError(errorMsg);
      notify({ type: 'error', message: errorMsg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading
        overline="ALTA DE CLIENTES"
        title="Registrar cliente"
        description="Ingresa los datos personales, de contacto alternativo, dirección y sede del taller mecánico para dar de alta al cliente."
        action={
          <button className="button secondary" onClick={() => onNavigate?.('clients')}>
            Ver administración de clientes →
          </button>
        }
      />

      {alertError && (
        <div className="inline-error" style={{ marginBottom: '16px', fontSize: '14px', padding: '12px 16px' }} role="alert">
          <strong>⚠️ Alerta: </strong> {alertError}
        </div>
      )}

      {alertSuccess && (
        <div className="info-banner" style={{ marginBottom: '16px', borderColor: 'var(--color-primary)', background: 'rgba(34,197,94,0.1)' }}>
          <strong>✓ Notificación del sistema: </strong> {alertSuccess}
        </div>
      )}

      {!canRegisterClient && (
        <div className="info-banner">
          Modo de consulta: El alta de clientes está reservada al personal autorizado de recepción y administración.
        </div>
      )}

      {canRegisterClient && workshops.length === 0 && (
        <div className="info-banner">
          ⚠️ Se requiere registrar al menos un taller mecánico activo antes de poder dar de alta clientes.
        </div>
      )}

      {canRegisterClient && (
        <section className="form-panel" style={{ marginTop: '12px' }}>
          <div className="panel-header">
            <div>
              <span className="overline">FORMULARIO OFICIAL</span>
              <h2>Ficha de alta del cliente</h2>
            </div>
          </div>
          <p className="subtle">
            Todos los datos son validados contra duplicados en el sistema (correo y teléfonos).
          </p>

          <form className="field-grid" onSubmit={handleSubmit} noValidate>
            {/* Sección: Identificación del cliente */}
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '6px', marginTop: '8px' }}>
              <span className="overline">1. IDENTIFICACIÓN BÁSICA</span>
            </div>
            <Field label="Nombre" name="firstName" placeholder="Ej. Roberto" maxLength={80} value={form.firstName} onChange={update} error={errors.firstName} />
            <Field label="Apellidos" name="lastName" placeholder="Ej. Martínez González" maxLength={80} value={form.lastName} onChange={update} error={errors.lastName} />
            <Field label="Correo electrónico" name="email" type="email" placeholder="cliente@correo.com" maxLength={190} value={form.email} onChange={update} error={errors.email} />

            {/* Sección: Teléfonos */}
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '6px', marginTop: '12px' }}>
              <span className="overline">2. TELÉFONOS DE CONTACTO</span>
            </div>
            <Field label="Teléfono personal" name="personalPhone" type="tel" placeholder="Ej. 55 1234 5678" maxLength={20} value={form.personalPhone} onChange={update} error={errors.personalPhone} />
            <Field label="Teléfono de trabajo (opcional)" name="workPhone" type="tel" placeholder="Ej. 55 8765 4321" maxLength={20} value={form.workPhone} onChange={update} error={errors.workPhone} />

            {/* Contacto alternativo */}
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '6px', marginTop: '12px' }}>
              <span className="overline">3. CONTACTO ALTERNATIVO (EN CASO DE NO LOCALIZARLO)</span>
            </div>
            <Field label="Nombre completo del contacto alternativo" name="alternativeContactName" placeholder="Ej. Claudia Martínez (Esposa)" maxLength={160} value={form.alternativeContactName} onChange={update} error={errors.alternativeContactName} />
            <Field label="Teléfono de contacto alternativo" name="alternativeContactPhone" type="tel" placeholder="Ej. 55 9876 5432" maxLength={20} value={form.alternativeContactPhone} onChange={update} error={errors.alternativeContactPhone} />

            {/* Sección: Dirección */}
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '6px', marginTop: '12px' }}>
              <span className="overline">4. DOMICILIO DEL CLIENTE</span>
            </div>
            <Field label="Calle" name="street" placeholder="Ej. Av. Insurgentes Sur" maxLength={120} value={form.street} onChange={update} error={errors.street} />
            <Field label="Número exterior / interior" name="streetNumber" placeholder="Ej. 1450 Int. 302" maxLength={20} value={form.streetNumber} onChange={update} error={errors.streetNumber} />
            <Field label="Código postal (Presiona Enter para buscar colonia)" name="postalCode" inputMode="numeric" placeholder="Ej. 03100" maxLength={5} value={form.postalCode} onChange={update} onKeyDown={handleZipKeyDown} error={errors.postalCode} />
            
            {locations.length > 0 && (
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Seleccionar colonia sugerida (SEPOMEX)</span>
                <select value="" onChange={(e) => selectLocation(locations[Number(e.target.value)])}>
                  <option value="">Elige tu colonia de la lista...</option>
                  {locations.map((loc, i) => (
                    <option key={i} value={i}>{loc.neighborhood} · {loc.municipality}, {loc.state}</option>
                  ))}
                </select>
              </label>
            )}
            {addressLookupMsg && <small style={{ gridColumn: '1 / -1', color: 'var(--text-subtle, #888)' }}>{addressLookupMsg}</small>}

            <Field label="Colonia" name="neighborhood" placeholder="Ej. Del Valle Centro" maxLength={100} value={form.neighborhood} onChange={update} error={errors.neighborhood} />
            <Field label="Municipio / Alcaldía" name="municipality" placeholder="Ej. Benito Juárez" maxLength={100} value={form.municipality} onChange={update} error={errors.municipality} />
            <Field label="Estado" name="state" placeholder="Ej. Ciudad de México" maxLength={100} value={form.state} onChange={update} error={errors.state} />

            {/* Sección: Taller mecánico */}
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--border-color, #333)', paddingBottom: '6px', marginTop: '12px' }}>
              <span className="overline">5. ASOCIACIÓN CON EL TALLER MECÁNICO</span>
            </div>
            <label className={`field ${errors.workshopId ? 'has-error' : ''}`} style={{ gridColumn: '1 / -1' }}>
              <span>Taller mecánico asociado *</span>
              <select name="workshopId" value={form.workshopId} onChange={update}>
                <option value="">Selecciona el taller mecánico</option>
                {workshops.map((w) => (
                  <option key={w.workshopId} value={w.workshopId}>{w.workshopName} — {w.rfc}</option>
                ))}
              </select>
              {errors.workshopId && <small>{errors.workshopId}</small>}
            </label>

            <div className="form-actions" style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
              <span>El cliente quedará registrado en la base de datos y se notificará en pantalla.</span>
              <button className="button primary" disabled={busy || workshops.length === 0}>
                {busy ? 'Registrando cliente…' : 'Registrar cliente'}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}

/** Administración de clientes: paginación completa (front y back), edición de datos y conmutación de estatus Activo/Suspendido sin eliminación física. */
export function ClientsManagementPage({ isAdmin, canRegisterClient, notify, onNavigate }) {
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Edición de cliente
  const [editingClient, setEditingClient] = useState(null);
  const [editForm, setEditForm] = useState(blankCustomerExtended);
  const [editErrors, setEditErrors] = useState({});
  const [editBusy, setEditBusy] = useState(false);

  // Registro de visita
  const [visitClient, setVisitClient] = useState(null);
  const [visitForm, setVisitForm] = useState({ workshopId: '', vehicleDescription: '', visitNote: '' });
  const [visitBusy, setVisitBusy] = useState(false);
  const [linkingClient, setLinkingClient] = useState(null);
  const [linkingVehicleId, setLinkingVehicleId] = useState('');

  async function fetchClients(page = pagination.page, limit = pagination.limit, q = search, status = statusFilter) {
    setLoading(true);
    try {
      const [resClients, resWorkshops, resVehicles] = await Promise.all([
        bauMar.clients({ page, limit, search: q, status }),
        bauMar.workshops(),
        canRegisterClient ? bauMar.vehicles() : Promise.resolve({ vehicles: [] }),
      ]);
      setClients(resClients.customers || []);
      setPagination(resClients.pagination || { page, limit, total: (resClients.customers || []).length, totalPages: 1 });
      setWorkshops((resWorkshops.workshops || []).filter((w) => w.status === 'active'));
      setVehicles(resVehicles.vehicles || []);
      setError('');
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }

  async function associateVehicle(e) {
    e.preventDefault();
    if (!linkingClient || !linkingVehicleId) { notify({ type: 'error', message: 'Selecciona un vehículo sin cliente.' }); return; }
    try {
      await bauMar.associateVehicleClient(linkingVehicleId, linkingClient.customerId);
      notify({ type: 'success', message: `Vehículo asociado a ${linkingClient.customerName}.` });
      setLinkingClient(null); setLinkingVehicleId(''); await fetchClients();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  }

  useEffect(() => {
    fetchClients(1, pagination.limit, search, statusFilter);
  }, [search, statusFilter]);

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    fetchClients(newPage, pagination.limit, search, statusFilter);
  }

  function handleLimitChange(newLimit) {
    const limitNum = Number(newLimit);
    fetchClients(1, limitNum, search, statusFilter);
  }

  function startEdit(client) {
    setEditingClient(client);
    setEditForm({
      firstName: client.firstName || client.customerName.split(' ')[0] || '',
      lastName: client.lastName || client.customerName.split(' ').slice(1).join(' ') || '',
      email: client.email || '',
      personalPhone: client.personalPhone || client.contactPhone || '',
      workPhone: client.workPhone || '',
      alternativeContactName: client.alternativeContactName || '',
      alternativeContactPhone: client.alternativeContactPhone || '',
      street: client.street || '',
      streetNumber: client.streetNumber || '',
      neighborhood: client.neighborhood || '',
      postalCode: client.postalCode || '',
      municipality: client.municipality || '',
      state: client.state || '',
      workshopId: client.workshopId || '',
    });
    setEditErrors({});
  }

  async function saveEdit(e) {
    e.preventDefault();
    const newErrors = {};
    if (!personalNamePattern.test(editForm.firstName.trim())) newErrors.firstName = 'Escribe un nombre válido.';
    if (!personalNamePattern.test(editForm.lastName.trim())) newErrors.lastName = 'Escribe apellidos válidos.';
    if (!emailPattern.test(editForm.email.trim())) newErrors.email = 'Escribe un correo válido.';
    if (!editForm.personalPhone.trim() && !editForm.alternativeContactPhone.trim()) {
      newErrors.personalPhone = 'Ingresa al menos un teléfono de contacto.';
    }
    if (!editForm.workshopId) newErrors.workshopId = 'Selecciona el taller asociado.';

    setEditErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setEditBusy(true);
    try {
      const res = await bauMar.updateClient(editingClient.customerId, editForm);
      notify({ type: 'success', message: res.message || 'Datos del cliente actualizados.' });
      setEditingClient(null);
      await fetchClients();
    } catch (err) {
      setEditErrors(err.details || {});
      notify({ type: 'error', message: err.message || 'Error al actualizar cliente.' });
    } finally {
      setEditBusy(false);
    }
  }

  async function toggleStatus(client) {
    const nextStatus = client.status === 'suspended' ? 'active' : 'suspended';
    const actionText = nextStatus === 'active' ? 'activar' : 'suspender';
    if (!window.confirm(`¿Deseas ${actionText} a ${client.customerName}? El registro permanecerá en el sistema sin eliminarse.`)) return;

    try {
      await bauMar.setClientStatus(client.customerId, nextStatus);
      notify({
        type: 'success',
        message: `El cliente "${client.customerName}" ahora tiene estatus: ${nextStatus === 'active' ? 'Activo' : 'Suspendido'}.`
      });
      await fetchClients();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    }
  }

  async function saveVisit(e) {
    e.preventDefault();
    if (!visitForm.workshopId) {
      notify({ type: 'error', message: 'Selecciona el taller de la visita.' });
      return;
    }
    setVisitBusy(true);
    try {
      await bauMar.recordVisit({
        workshopId: visitForm.workshopId,
        customerId: visitClient.customerId,
        vehicleDescription: visitForm.vehicleDescription,
        visitNote: visitForm.visitNote,
      });
      notify({ type: 'success', message: `Visita registrada para ${visitClient.customerName} en el taller.` });
      setVisitClient(null);
      setVisitForm({ workshopId: '', vehicleDescription: '', visitNote: '' });
      await fetchClients();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setVisitBusy(false);
    }
  }

  return (
    <>
      <Heading
        overline="SISTEMA DE GESTIÓN"
        title="Administración de clientes"
        description="Directorio paginado con actualización de datos y control de estatus (Activo/Suspendido). No se eliminan clientes del sistema."
        action={
          canRegisterClient && (
            <button className="button primary" onClick={() => onNavigate?.('registerClient')}>
              ＋ Registrar nuevo cliente
            </button>
          )
        }
      />
      <ErrorBlock error={error} />

      {/* Modal de edición completa de cliente */}
      {editingClient && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <span className="overline">MODIFICAR DATOS DEL CLIENTE</span>
              <h2>Editar · {editingClient.customerName}</h2>
            </div>
            <button className="icon-close" type="button" onClick={() => setEditingClient(null)}>×</button>
          </div>
          <p className="subtle">Actualiza la información personal, domiciliaria y de contacto. Todos los campos se guardan en el sistema.</p>
          <form className="field-grid" onSubmit={saveEdit} noValidate>
            <Field label="Nombre" name="firstName" value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} error={editErrors.firstName} />
            <Field label="Apellidos" name="lastName" value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} error={editErrors.lastName} />
            <Field label="Correo electrónico" name="email" type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} error={editErrors.email} />
            <Field label="Teléfono personal" name="personalPhone" type="tel" value={editForm.personalPhone} onChange={(e) => setEditForm((p) => ({ ...p, personalPhone: e.target.value }))} error={editErrors.personalPhone} />
            <Field label="Teléfono de trabajo" name="workPhone" type="tel" value={editForm.workPhone} onChange={(e) => setEditForm((p) => ({ ...p, workPhone: e.target.value }))} error={editErrors.workPhone} />
            <Field label="Contacto alternativo (Nombre)" name="alternativeContactName" value={editForm.alternativeContactName} onChange={(e) => setEditForm((p) => ({ ...p, alternativeContactName: e.target.value }))} error={editErrors.alternativeContactName} />
            <Field label="Teléfono contacto alternativo" name="alternativeContactPhone" type="tel" value={editForm.alternativeContactPhone} onChange={(e) => setEditForm((p) => ({ ...p, alternativeContactPhone: e.target.value }))} error={editErrors.alternativeContactPhone} />
            <Field label="Calle" name="street" value={editForm.street} onChange={(e) => setEditForm((p) => ({ ...p, street: e.target.value }))} error={editErrors.street} />
            <Field label="Número" name="streetNumber" value={editForm.streetNumber} onChange={(e) => setEditForm((p) => ({ ...p, streetNumber: e.target.value }))} error={editErrors.streetNumber} />
            <Field label="Colonia" name="neighborhood" value={editForm.neighborhood} onChange={(e) => setEditForm((p) => ({ ...p, neighborhood: e.target.value }))} error={editErrors.neighborhood} />
            <Field label="Código postal" name="postalCode" value={editForm.postalCode} onChange={(e) => setEditForm((p) => ({ ...p, postalCode: e.target.value }))} error={editErrors.postalCode} />
            <Field label="Municipio / Alcaldía" name="municipality" value={editForm.municipality} onChange={(e) => setEditForm((p) => ({ ...p, municipality: e.target.value }))} error={editErrors.municipality} />
            <Field label="Estado" name="state" value={editForm.state} onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))} error={editErrors.state} />
            <label className="field">
              <span>Taller asociado</span>
              <select value={editForm.workshopId} onChange={(e) => setEditForm((p) => ({ ...p, workshopId: e.target.value }))}>
                <option value="">Selecciona taller</option>
                {workshops.map((w) => (
                  <option key={w.workshopId} value={w.workshopId}>{w.workshopName}</option>
                ))}
              </select>
            </label>
            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <span>Los cambios quedan registrados con control de auditoría.</span>
              <button className="button primary" disabled={editBusy}>{editBusy ? 'Guardando…' : 'Guardar cambios del cliente'}</button>
            </div>
          </form>
        </section>
      )}

      {/* Formulario de registro de visita */}
      {visitClient && canRegisterClient && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <span className="overline">RELACIONAR CON TALLER</span>
              <h2>Registrar visita · {visitClient.customerName}</h2>
            </div>
            <button className="icon-close" type="button" onClick={() => setVisitClient(null)}>×</button>
          </div>
          <p className="subtle">Registra el ingreso de este cliente al taller mecánico para su seguimiento.</p>
          <form className="field-grid" onSubmit={saveVisit} noValidate>
            <label className="field">
              <span>Sede del taller</span>
              <select value={visitForm.workshopId} onChange={(e) => setVisitForm((old) => ({ ...old, workshopId: e.target.value }))} required>
                <option value="">Selecciona taller</option>
                {workshops.map((shop) => (
                  <option key={shop.workshopId} value={shop.workshopId}>{shop.workshopName}</option>
                ))}
              </select>
            </label>
            <Field label="Vehículo (opcional)" name="vehicleDescription" placeholder="Ej. Nissan Versa 2020 plata" maxLength={160} value={visitForm.vehicleDescription} onChange={(e) => setVisitForm((old) => ({ ...old, vehicleDescription: e.target.value }))} />
            <Field label="Motivo o trabajo a realizar" name="visitNote" placeholder="Ej. Cambio de balatas y afinación mayor" maxLength={500} value={visitForm.visitNote} onChange={(e) => setVisitForm((old) => ({ ...old, visitNote: e.target.value }))} />
            <div className="form-actions">
              <span>Se sumará al contador de visitas del taller seleccionado.</span>
              <button className="button primary" disabled={visitBusy}>{visitBusy ? 'Guardando…' : 'Guardar visita al taller'}</button>
            </div>
          </form>
        </section>
      )}

      {linkingClient && canRegisterClient && linkingClient.status === 'active' && (
        <section className="form-panel">
          <div className="panel-header"><div><span className="overline">VINCULAR AUTOMÓVIL</span><h2>{linkingClient.customerName}</h2></div><button className="icon-close" type="button" onClick={() => setLinkingClient(null)}>×</button></div>
          <p className="subtle">Solo aparecen autos activos sin cliente que pertenezcan al mismo taller. El servidor vuelve a validar ambas condiciones.</p>
          <form className="field-grid" onSubmit={associateVehicle} noValidate><label className="field"><span>Automóvil disponible</span><select value={linkingVehicleId} onChange={(event) => setLinkingVehicleId(event.target.value)}><option value="">Selecciona un auto</option>{vehicles.filter((vehicle) => !vehicle.customerId && vehicle.status === 'active' && vehicle.workshopId === linkingClient.workshopId).map((vehicle) => <option key={vehicle.vehicleId} value={vehicle.vehicleId}>{vehicle.plate} · {vehicle.make} {vehicle.model} ({vehicle.modelYear})</option>)}</select></label><div className="form-actions"><span>El cliente debe estar activo y compartir taller con el auto.</span><button className="button primary" disabled={!vehicles.some((vehicle) => !vehicle.customerId && vehicle.status === 'active' && vehicle.workshopId === linkingClient.workshopId)}>Vincular automóvil</button></div></form>
        </section>
      )}

      {/* Herramientas de búsqueda, filtrado y paginación */}
      <div className="list-tools" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <div className="search-input" style={{ flex: 1, minWidth: '240px' }}>
          <span>⌕</span>
          <input
            aria-label="Buscar clientes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o taller…"
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Estatus:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px' }}>
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="suspended">Suspendidos</option>
            </select>
          </label>
          <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Mostrar:</span>
            <select value={pagination.limit} onChange={(e) => handleLimitChange(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px' }}>
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>
        <span className="result-count">
          {pagination.total} cliente{pagination.total === 1 ? '' : 's'} en total
        </span>
      </div>

      {/* Tabla con datos completos del cliente */}
      <section className="table-card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>TELÉFONOS</th>
                <th>CONTACTO ALTERNATIVO</th>
                <th>DIRECCIÓN</th>
                <th>TALLER MECÁNICO</th>
                <th>AUTOMÓVILES</th>
                <th>ESTATUS EN BD</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.customerId}>
                  <td>
                    <b>{c.customerName}</b>
                    <small className="table-subtext">{c.email}</small>
                    {c.portalLinked && <span className="client-badge" style={{ marginLeft: '4px' }}>Portal</span>}
                  </td>
                  <td>
                    <div><small>Personal: </small><b>{c.personalPhone || c.contactPhone || '—'}</b></div>
                    {c.workPhone && <div><small>Trabajo: </small>{c.workPhone}</div>}
                  </td>
                  <td>
                    {c.alternativeContactName ? (
                      <div>
                        <b>{c.alternativeContactName}</b>
                        {c.alternativeContactPhone && <small className="table-subtext">Tel: {c.alternativeContactPhone}</small>}
                      </div>
                    ) : (
                      <span className="subtle">—</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '13px' }}>{c.address}</span>
                  </td>
                  <td>
                    <span className="workshop-tag">{c.workshopName}</span>
                  </td>
                  <td>
                    {(vehicles.filter((vehicle) => vehicle.customerId === c.customerId).map((vehicle) => vehicle.plate)).join(', ') || <span className="subtle">Sin autos vinculados</span>}
                  </td>
                  <td>
                    <span className={`status-label ${c.status === 'suspended' ? 'inactive' : 'active'}`}>
                      <i />{c.status === 'suspended' ? 'Suspendido' : 'Activo'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => startEdit(c)}
                      >
                        Editar datos
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className={`text-action ${c.status === 'suspended' ? 'primary-text-action' : 'danger-action'}`}
                          onClick={() => toggleStatus(c)}
                        >
                          {c.status === 'suspended' ? 'Activar' : 'Suspender'}
                        </button>
                      )}
                      {canRegisterClient && (
                        <button
                          type="button"
                          className="text-action primary-text-action"
                          onClick={() => {
                            setVisitClient(c);
                            setVisitForm({
                              workshopId: c.workshopId || (workshops[0]?.workshopId || ''),
                              vehicleDescription: '',
                              visitNote: '',
                            });
                          }}
                        >
                          ＋ Visita
                        </button>
                      )}
                      {canRegisterClient && c.status === 'active' && (
                        <button type="button" className="text-action primary-text-action" onClick={() => { setLinkingClient(c); setLinkingVehicleId(''); }}>＋ Asociar auto</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    {loading ? 'Cargando clientes…' : search ? 'No hay clientes que coincidan con la búsqueda.' : 'No hay clientes registrados en el sistema.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de paginación front y back */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid var(--border-color, #333)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-subtle, #888)' }}>
            Página {pagination.page} de {pagination.totalPages} ({pagination.total} clientes registrados)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="button secondary"
              disabled={pagination.page <= 1 || loading}
              onClick={() => handlePageChange(pagination.page - 1)}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              « Anterior
            </button>
            <button
              className="button secondary"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => handlePageChange(pagination.page + 1)}
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              Siguiente »
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

const vehicleStatuses = [['diagnostico','Diagnóstico'],['esperando_autorizacion','Esperando autorización'],['en_reparacion','En reparación'],['esperando_refacciones','Esperando refacciones'],['listo','Listo'],['entregado','Entregado']];

/** Presenta el último avance del automóvil al cliente y habilita registro/actualización al personal autorizado. */
export function VehicleStatusPage({ user, canRegisterClient, isAdmin, notify }) {
  const isCustomer = user.roles?.includes('customer') && !canRegisterClient && !isAdmin && !user.roles?.includes('technician') && !user.roles?.includes('service_advisor');
  const canUpdate = isAdmin || user.roles?.includes('technician');
  const [vehicles, setVehicles] = useState([]); const [clients, setClients] = useState([]); const [workshops, setWorkshops] = useState([]); const [form, setForm] = useState(blankVehicle); const [open, setOpen] = useState(false); const [errors, setErrors] = useState({}); const [updates, setUpdates] = useState({}); const [error, setError] = useState('');
  async function load() { try { const data = isCustomer ? await bauMar.customerVehicleStatus() : await bauMar.vehicles(); setVehicles(data.vehicles); setError(''); if (canRegisterClient) { const [customerData, workshopData] = await Promise.all([bauMar.clients(), bauMar.workshops()]); setClients(customerData.customers); setWorkshops(workshopData.workshops.filter((shop) => shop.status === 'active')); } } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, [user.id]);
  async function create(e) { e.preventDefault(); const next = {}; for (const key of ['workshopId','customerId','make','model','plate']) if (!form[key].trim()) next[key] = 'Completa este campo.'; if (form.modelYear && (!/^\d{4}$/.test(form.modelYear) || Number(form.modelYear) < 1900 || Number(form.modelYear) > new Date().getFullYear() + 1)) next.modelYear = 'Año inválido.'; setErrors(next); if (Object.keys(next).length) return; try { await bauMar.createVehicle({ ...form, modelYear: form.modelYear || null }); notify({ type: 'success', message: 'Vehículo registrado para diagnóstico.' }); setForm(blankVehicle); setOpen(false); await load(); } catch (e2) { setErrors(e2.details || {}); notify({ type: 'error', message: e2.message }); } }
  async function updateStatus(vehicle) { const data = updates[vehicle.vehicleId] || {}; if (!data.statusKey || !data.conditionSummary?.trim()) { setError('Selecciona estado y describe el avance del vehículo.'); return; } try { await bauMar.setVehicleRepairStatus(vehicle.vehicleId, data); notify({ type: 'success', message: 'Estado del vehículo actualizado.' }); setUpdates((old) => ({ ...old, [vehicle.vehicleId]: {} })); await load(); } catch (e) { setError(e.message); } }
  return <><Heading overline={isCustomer ? 'PORTAL DEL CLIENTE' : 'SEGUIMIENTO DE SERVICIO'} title={isCustomer ? 'Estado de mi automóvil' : 'Estado de vehículos'} description={isCustomer ? 'Consulta el diagnóstico, avance y trabajo pendiente de tus vehículos.' : 'Consulta los avances que recibe cada cliente y mantén al día la reparación.'} action={canRegisterClient && <button className="button primary" onClick={() => setOpen(!open)}>＋ Registrar vehículo</button>} />{error && <ErrorBlock error={error} />}
    {!canRegisterClient && !canUpdate && !isCustomer && <div className="info-banner">Modo de consulta: el registro y actualización de diagnósticos están reservados a recepción, técnicos y administración.</div>}
    {open && canRegisterClient && <section className="form-panel"><div className="panel-header"><div><span className="overline">NUEVO VEHÍCULO</span><h2>Iniciar seguimiento</h2></div><button className="icon-close" type="button" onClick={() => setOpen(false)}>×</button></div><form className="field-grid" onSubmit={create} noValidate><label className="field"><span>Taller</span><select value={form.workshopId} onChange={(e) => setForm({ ...form, workshopId: e.target.value, customerId: '' })}><option value="">Selecciona taller</option>{workshops.map((shop) => <option value={shop.workshopId} key={shop.workshopId}>{shop.workshopName}</option>)}</select>{errors.workshopId && <small>{errors.workshopId}</small>}</label><label className="field"><span>Cliente</span><select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Selecciona cliente</option>{clients.filter((client) => client.workshopId === form.workshopId).map((client) => <option value={client.customerId} key={client.customerId}>{client.customerName}</option>)}</select>{errors.customerId && <small>{errors.customerId}</small>}</label>{['make','model','modelYear','plate'].map((key) => <Field key={key} label={({ make: 'Marca', model: 'Modelo', modelYear: 'Año', plate: 'Placas' })[key]} name={key} maxLength={key === 'plate' ? 12 : 80} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} error={errors[key]} />)}<div className="form-actions"><span>El historial iniciará en diagnóstico.</span><button className="button primary">Guardar vehículo</button></div></form></section>}
    <div className="vehicle-grid">{vehicles.map((vehicle) => <article className="vehicle-card" key={vehicle.vehicleId}><div className="vehicle-head"><span className="vehicle-glyph">▰</span><div><span className="overline">{vehicle.plate}</span><h2>{vehicle.modelYear ? `${vehicle.modelYear} ` : ''}{vehicle.make} {vehicle.model}</h2><p>{vehicle.workshopName}{vehicle.customerName ? ` · ${vehicle.customerName}` : ''}</p></div></div><span className={`repair-status ${vehicle.statusKey || 'diagnostico'}`}>{vehicleStatuses.find(([key]) => key === vehicle.statusKey)?.[1] || 'Sin diagnóstico'}</span><div className="repair-details"><div><b>Qué se detectó</b><p>{vehicle.conditionSummary || 'Pendiente de diagnóstico.'}</p></div><div><b>Qué falta</b><p>{vehicle.pendingWork || 'No hay trabajos pendientes registrados.'}</p></div></div>{vehicle.statusUpdatedAt && <small className="status-date">Actualizado {new Date(vehicle.statusUpdatedAt).toLocaleString('es-MX')}</small>}
      {canUpdate && <div className="vehicle-update-form"><label className="field"><span>Estado</span><select value={updates[vehicle.vehicleId]?.statusKey || ''} onChange={(e) => setUpdates((old) => ({ ...old, [vehicle.vehicleId]: { ...old[vehicle.vehicleId], statusKey: e.target.value } }))}><option value="">Selecciona avance</option>{vehicleStatuses.map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label><Field label="Diagnóstico o avance" name="conditionSummary" maxLength={500} value={updates[vehicle.vehicleId]?.conditionSummary || ''} onChange={(e) => setUpdates((old) => ({ ...old, [vehicle.vehicleId]: { ...old[vehicle.vehicleId], conditionSummary: e.target.value } }))} /><Field label="Trabajo pendiente" name="pendingWork" maxLength={500} value={updates[vehicle.vehicleId]?.pendingWork || ''} onChange={(e) => setUpdates((old) => ({ ...old, [vehicle.vehicleId]: { ...old[vehicle.vehicleId], pendingWork: e.target.value } }))} /><button className="button secondary" onClick={() => updateStatus(vehicle)}>Guardar avance</button></div>}
      </article>)}{vehicles.length === 0 && <div className="empty-panel"><span className="empty-icon">▰</span><h3>{isCustomer ? 'Todavía no hay automóviles vinculados' : 'Sin vehículos en seguimiento'}</h3><p>{isCustomer ? 'Cuando recepción vincule una cuenta cliente y registre un vehículo, aquí verás el diagnóstico y lo que falta para terminar la reparación.' : 'Registra un vehículo para iniciar su seguimiento de diagnóstico.'}</p></div>}</div>
  </>;
}
