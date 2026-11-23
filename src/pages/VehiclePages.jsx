import React, { useEffect, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';
import { Field } from '../components/Brand.jsx';

const maxPhotoBytes = 15 * 1024 * 1024;
const blank = { workshopId: '', vin: '', plate: '', make: '', model: '', modelYear: '', version: '', color: '', mileage: '' };
const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
const platePattern = /^[A-Z0-9]{5,12}$/;
const textPattern = /^[\p{L}\p{M}\p{N} .,'()/_-]{1,80}$/u;

function PageHeading({ title, description, action }) { return <div className="page-heading"><div><span className="overline">FLOTILLA BAUMAR</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function ErrorMessage({ children }) { return children ? <small className="field-error" role="alert">{children}</small> : null; }
function normalizePlate(value) { return value.replace(/[^a-z0-9]/gi, '').toUpperCase(); }

/** Registro separado de propietario para permitir que recepción capture el automóvil antes de asociarlo a un cliente. */
export function RegisterVehiclePage({ canRegisterClient, notify }) {
  const [form, setForm] = useState(blank); const [workshops, setWorkshops] = useState([]); const [photoTokens, setPhotoTokens] = useState([]); const [photoNames, setPhotoNames] = useState([]);
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { bauMar.workshops().then(({ workshops: rows }) => setWorkshops(rows.filter((row) => row.status === 'active'))).catch((error) => notify({ type: 'error', message: error.message })).finally(() => setLoading(false)); }, []);
  async function handlePhotos(event) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    const invalid = files.find((file) => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > maxPhotoBytes);
    if (invalid) { notify({ type: 'error', message: `${invalid.name}: selecciona JPG, PNG o WebP de máximo 15 MB.` }); return; }
    try {
      const uploaded = [];
      for (const file of files) {
        const dataBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se pudo leer una fotografía.')); reader.readAsDataURL(file); });
        uploaded.push(await bauMar.uploadVehiclePhoto({ mimeType: file.type, dataBase64 }));
      }
      setPhotoTokens((old) => [...old, ...uploaded.map((item) => item.photoToken)]); setPhotoNames((old) => [...old, ...files.map((item) => item.name)]);
      notify({ type: 'success', message: `${files.length} fotografía(s) guardada(s) temporalmente.` });
    } catch (error) { notify({ type: 'error', message: error.message }); }
  }
  function validate() {
    const next = {};
    if (!form.workshopId) next.workshopId = 'Selecciona un taller activo.';
    if (!vinPattern.test(form.vin.trim().toUpperCase())) next.vin = 'El VIN debe tener 17 caracteres válidos (sin I, O ni Q).';
    if (!platePattern.test(normalizePlate(form.plate))) next.plate = 'La placa debe tener de 5 a 12 letras y números.';
    if (!textPattern.test(form.make.trim())) next.make = 'Escribe una marca válida.';
    if (!textPattern.test(form.model.trim())) next.model = 'Escribe un modelo válido.';
    const year = Number(form.modelYear); if (!/^\d{4}$/.test(form.modelYear) || year < 1900 || year > new Date().getFullYear() + 1) next.modelYear = 'Escribe un año válido.';
    if (!textPattern.test(form.version.trim())) next.version = 'Escribe una versión válida.';
    if (!/^[\p{L}\p{M}\p{N} .,'#()/_-]{2,50}$/u.test(form.color.trim())) next.color = 'Escribe un color válido.';
    if (form.mileage !== '' && (!/^\d{1,7}$/.test(form.mileage) || Number(form.mileage) > 2000000)) next.mileage = 'El kilometraje debe ser de 0 a 2,000,000.';
    return next;
  }
  async function submit(event) {
    event.preventDefault(); if (!canRegisterClient) return;
    const next = validate(); setErrors(next); if (Object.keys(next).length) return;
    setBusy(true);
    try { await bauMar.createVehicle({ ...form, vin: form.vin.toUpperCase(), plate: normalizePlate(form.plate), modelYear: Number(form.modelYear), mileage: form.mileage === '' ? null : Number(form.mileage), photoTokens }); setForm(blank); setPhotoTokens([]); setPhotoNames([]); setErrors({}); notify({ type: 'success', message: 'Automóvil registrado. Puedes asociarlo a su cliente desde Administración de clientes.' }); }
    catch (error) { setErrors(error.details || {}); notify({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  }
  if (!canRegisterClient) return <><PageHeading title="Registro de auto" description="Alta reservada al administrador y recepción."/><div className="info-banner">No tienes permisos para registrar vehículos.</div></>;
  return <><PageHeading title="Registro de auto" description="Captura los datos de identificación y fotografías. El cliente se vincula después desde su administración."/><section className="form-panel"><div className="panel-header"><div><span className="overline">NUEVO AUTOMÓVIL</span><h2>Datos del vehículo</h2></div></div>{loading ? <p>Cargando talleres activos…</p> : <form className="field-grid" onSubmit={submit} noValidate>
    <label className="field"><span>Taller asociado *</span><select value={form.workshopId} onChange={(event) => setForm({ ...form, workshopId: event.target.value })}><option value="">Selecciona taller</option>{workshops.map((shop) => <option key={shop.workshopId} value={shop.workshopId}>{shop.workshopName}</option>)}</select><ErrorMessage>{errors.workshopId}</ErrorMessage></label>
    <Field label="VIN *" name="vin" maxLength={17} value={form.vin} onChange={(event) => setForm({ ...form, vin: event.target.value.toUpperCase() })} error={errors.vin}/>
    <Field label="Placa *" name="plate" maxLength={12} value={form.plate} onChange={(event) => setForm({ ...form, plate: normalizePlate(event.target.value) })} error={errors.plate}/>
    <Field label="Marca *" name="make" maxLength={60} value={form.make} onChange={(event) => setForm({ ...form, make: event.target.value })} error={errors.make}/>
    <Field label="Modelo *" name="model" maxLength={80} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} error={errors.model}/>
    <Field label="Año *" name="modelYear" type="number" min="1900" max={new Date().getFullYear() + 1} value={form.modelYear} onChange={(event) => setForm({ ...form, modelYear: event.target.value })} error={errors.modelYear}/>
    <Field label="Versión *" name="version" maxLength={80} value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} error={errors.version}/>
    <Field label="Color *" name="color" maxLength={50} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} error={errors.color}/>
    <Field label="Kilometraje (opcional)" name="mileage" type="number" min="0" max="2000000" value={form.mileage} onChange={(event) => setForm({ ...form, mileage: event.target.value })} error={errors.mileage}/>
    <label className="field" style={{ gridColumn: '1 / -1' }}><span>Fotografías del vehículo (JPG, PNG o WebP; máximo 15 MB cada una)</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotos}/><small>{photoNames.length ? `${photoNames.length} foto(s): ${photoNames.join(', ')}` : 'Puedes elegir varias fotografías.'}</small><ErrorMessage>{errors.photos || errors.photo}</ErrorMessage></label>
    <div className="form-actions"><span>VIN y placas son únicos en todo BauMar.</span><button className="button primary" disabled={busy || !workshops.length}>{busy ? 'Guardando…' : 'Registrar auto'}</button></div>
  </form>}</section></>;
}

/** Inventario administrativo de vehículos: edición de datos y baja lógica, sin controlar la asociación con clientes. */
export function VehicleAdministrationPage({ canRegisterClient, notify }) {
  const [vehicles, setVehicles] = useState([]); const [workshops, setWorkshops] = useState([]); const [editing, setEditing] = useState(null); const [form, setForm] = useState(blank); const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { const [vehicleData, workshopData] = await Promise.all([bauMar.vehicles(), bauMar.workshops()]); setVehicles(vehicleData.vehicles || []); setWorkshops((workshopData.workshops || []).filter((row) => row.status === 'active')); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  function startEdit(vehicle) { setEditing(vehicle); setForm({ workshopId: vehicle.workshopId, vin: vehicle.vin || '', plate: vehicle.plate, make: vehicle.make, model: vehicle.model, modelYear: String(vehicle.modelYear || ''), version: vehicle.version || '', color: vehicle.color || '', mileage: vehicle.mileage ?? '' }); setErrors({}); }
  async function save(event) { event.preventDefault(); const next = {}; if (!vinPattern.test(form.vin.toUpperCase())) next.vin = 'El VIN debe tener 17 caracteres válidos.'; if (!platePattern.test(normalizePlate(form.plate))) next.plate = 'Placa inválida.'; if (!form.workshopId) next.workshopId = 'Selecciona un taller.'; for (const key of ['make','model','version']) if (!textPattern.test(form[key].trim())) next[key] = 'Completa este dato con texto válido.'; if (!/^[\p{L}\p{M}\p{N} .,'#()/_-]{2,50}$/u.test(form.color.trim())) next.color = 'Color inválido.'; const year = Number(form.modelYear); if (!/^\d{4}$/.test(form.modelYear) || year < 1900 || year > new Date().getFullYear()+1) next.modelYear = 'Año inválido.'; if (form.mileage !== '' && (!/^\d{1,7}$/.test(String(form.mileage)) || Number(form.mileage)>2000000)) next.mileage = 'Kilometraje inválido.'; setErrors(next); if (Object.keys(next).length) return; setBusy(true); try { await bauMar.updateVehicle(editing.vehicleId, { ...form, vin: form.vin.toUpperCase(), plate: normalizePlate(form.plate), modelYear: year, mileage: form.mileage === '' ? null : Number(form.mileage) }); notify({ type: 'success', message: 'Datos del automóvil actualizados.' }); setEditing(null); await load(); } catch (e) { setErrors(e.details || {}); notify({ type: 'error', message: e.message }); } finally { setBusy(false); } }
  async function toggle(vehicle) { const status = vehicle.status === 'active' ? 'inactive' : 'active'; if (!window.confirm(`¿${status === 'active' ? 'Activar' : 'Desactivar'} el vehículo ${vehicle.plate}?`)) return; try { await bauMar.setVehicleStatus(vehicle.vehicleId, status); notify({ type: 'success', message: `Auto ${status === 'active' ? 'activado' : 'desactivado'}.` }); await load(); } catch (e) { notify({ type: 'error', message: e.message }); } }
  return <><PageHeading title="Administración de vehículo" description="Consulta y actualiza la flotilla; la relación con un cliente se administra desde Clientes."/>{error && <div className="inline-error" role="alert">{error}</div>}{editing && <section className="form-panel"><div className="panel-header"><div><span className="overline">EDITAR AUTOMÓVIL</span><h2>{editing.plate}</h2></div><button className="icon-close" type="button" onClick={() => setEditing(null)}>×</button></div><form className="field-grid" onSubmit={save} noValidate>
    <label className="field"><span>Taller</span><select value={form.workshopId} onChange={(e) => setForm({ ...form, workshopId: e.target.value })}><option value="">Selecciona taller</option>{workshops.map((w) => <option key={w.workshopId} value={w.workshopId}>{w.workshopName}</option>)}</select><ErrorMessage>{errors.workshopId}</ErrorMessage></label>
    <Field label="VIN" name="vin" maxLength={17} value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} error={errors.vin}/><Field label="Placa" name="plate" maxLength={12} value={form.plate} onChange={(e) => setForm({ ...form, plate: normalizePlate(e.target.value) })} error={errors.plate}/><Field label="Marca" name="make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} error={errors.make}/><Field label="Modelo" name="model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} error={errors.model}/><Field label="Año" name="modelYear" type="number" value={form.modelYear} onChange={(e) => setForm({ ...form, modelYear: e.target.value })} error={errors.modelYear}/><Field label="Versión" name="version" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} error={errors.version}/><Field label="Color" name="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} error={errors.color}/><Field label="Kilometraje (opcional)" name="mileage" type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} error={errors.mileage}/><div className="form-actions"><span>La edición no cambia el cliente asociado.</span><button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div>
  </form></section>}
  <section className="table-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>VEHÍCULO</th><th>IDENTIFICADORES</th><th>TALLER / CLIENTE</th><th>FOTOS</th><th>ESTATUS</th><th>ACCIONES</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.vehicleId}><td><b>{vehicle.make} {vehicle.model}</b><small className="table-subtext">{vehicle.modelYear} · {vehicle.version} · {vehicle.color}{vehicle.mileage !== null ? ` · ${vehicle.mileage.toLocaleString('es-MX')} km` : ''}</small></td><td><b>{vehicle.plate}</b><small className="table-subtext">VIN {vehicle.vin || 'pendiente'}</small></td><td>{vehicle.workshopName}<small className="table-subtext">{vehicle.customerName || 'Sin cliente vinculado'}</small></td><td><div className="vehicle-photo-list">{(vehicle.photos || []).map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer" aria-label={`Abrir foto de ${vehicle.plate}`}><img src={photo} alt={`Vehículo ${vehicle.plate}`} loading="lazy"/></a>)}{!vehicle.photos?.length && <span>0</span>}</div></td><td><span className={`status-label ${vehicle.status === 'active' ? 'active' : 'inactive'}`}><i/>{vehicle.status === 'active' ? 'Activo' : 'Inactivo'}</span></td><td><div className="row-actions">{canRegisterClient && <><button type="button" className="text-action" onClick={() => startEdit(vehicle)}>Editar</button><button type="button" className="text-action" onClick={() => toggle(vehicle)}>{vehicle.status === 'active' ? 'Desactivar' : 'Activar'}</button></>}</div></td></tr>)}{vehicles.length === 0 && <tr><td colSpan={6} className="empty-cell">No hay automóviles registrados.</td></tr>}</tbody></table></div></section></>;
}
