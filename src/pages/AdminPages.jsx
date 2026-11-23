import React, { useEffect, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';
import { patterns, validate } from '../validators.js';
import { Field } from '../components/Brand.jsx';

const blankUser = { firstName: '', lastName: '', username: '', email: '', phoneNumber: '', password: '', confirmPassword: '' };

function ForbiddenPanel() { return <div className="empty-panel"><span className="empty-icon">⌑</span><h3>Acceso administrativo</h3><p>Esta sección requiere el rol de administrador. Solicita acceso al dueño del taller.</p></div>; }
function LoadingError({ error, onRetry }) { return <div className="inline-error"><span>{error}</span><button className="button secondary" onClick={onRetry}>Reintentar</button></div>; }
function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div><span className="overline">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }

/** Directorio de usuarios; cuentas autenticadas consultan y el administrador gestiona cuentas y datos de contacto. */
export function UsersPage({ isAdmin, notify }) {
  const [users, setUsers] = useState([]); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [editing, setEditing] = useState(null); const [formOpen, setFormOpen] = useState(false); const [form, setForm] = useState(blankUser); const [fieldErrors, setFieldErrors] = useState({}); const [busy, setBusy] = useState(false);
  async function load() { try { const data = await bauMar.users(); setUsers(data.users); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  function beginEdit(user = null) { setEditing(user); setForm(user ? { ...blankUser, ...user, password: '', confirmPassword: '' } : { ...blankUser }); setFieldErrors({}); setFormOpen(true); }
  function update(e) { setForm((old) => ({ ...old, [e.target.name]: e.target.value })); setFieldErrors((old) => ({ ...old, [e.target.name]: undefined })); }
  async function save(e) {
    e.preventDefault();
    const data = { ...form };
    const errors = validate(data, { passwordRequired: !editing || Boolean(data.password) });
    if (data.password && data.password !== data.confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';
    setFieldErrors(errors); if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      if (editing) await bauMar.updateUser(editing.userId, { firstName: form.firstName, lastName: form.lastName, username: form.username, email: form.email, phoneNumber: form.phoneNumber, ...(form.password ? { password: form.password, confirmPassword: form.confirmPassword } : {}) });
      else await bauMar.createUser(form);
      notify({ type: 'success', message: editing ? 'Datos del usuario actualizados.' : 'Usuario creado sin rol asignado.' }); setEditing(null); setFormOpen(false); setForm(blankUser); await load();
    } catch (e2) { setFieldErrors(e2.details || {}); notify({ type: 'error', message: e2.message }); }
    finally { setBusy(false); }
  }
  async function toggle(user, status) {
    try { await bauMar.setUserStatus(user.userId, status); notify({ type: 'success', message: `Estado de la cuenta: ${{ active: 'activo', inactive: 'inactivo', deleted: 'eliminado' }[status]}.` }); await load(); }
    catch (e) { notify({ type: 'error', message: e.message }); }
  }
  const visible = users.filter((u) => `${u.firstName} ${u.lastName} ${u.username} ${u.email} ${u.phoneNumber || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeading eyebrow="DIRECTORIO BAUMAR" title="Usuarios" description={isAdmin ? 'Consulta y gestiona las cuentas del equipo. Los roles se conceden en Administración de roles.' : 'Consulta el directorio del taller. La creación y edición de cuentas están reservadas al administrador.'} action={isAdmin && <button className="button primary" onClick={() => beginEdit()}>＋ Nuevo usuario</button>} />
    {error && <LoadingError error={error} onRetry={load} />}
    {!isAdmin && <div className="info-banner">Modo de consulta: la creación y edición de cuentas están reservadas al administrador.</div>}
    <div className="list-tools"><div className="search-input"><span>⌕</span><input aria-label="Buscar usuarios" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, usuario o correo" /></div><span className="result-count">{visible.length} usuarios</span></div>
    {formOpen && <section className="form-panel"><div className="panel-header"><div><span className="overline">{editing ? 'EDITAR CUENTA' : 'NUEVA CUENTA'}</span><h2>{editing ? `${editing.firstName} ${editing.lastName}` : 'Registrar usuario'}</h2></div><button className="icon-close" onClick={() => { setEditing(null); setFormOpen(false); setForm(blankUser); }}>×</button></div><p className="subtle">El alta de usuario no asigna ningún rol.</p><form className="field-grid" onSubmit={save} noValidate><Field label="Nombre" name="firstName" value={form.firstName} onChange={update} maxLength={80} error={fieldErrors.firstName} /><Field label="Apellidos" name="lastName" value={form.lastName} onChange={update} maxLength={80} error={fieldErrors.lastName} /><Field label="Usuario" name="username" value={form.username} onChange={update} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" error={fieldErrors.username} /><Field label="Correo electrónico" name="email" type="email" value={form.email} onChange={update} maxLength={190} error={fieldErrors.email} /><Field label="Teléfono de contacto" name="phoneNumber" type="tel" value={form.phoneNumber} onChange={update} maxLength={20} pattern="[+]?[0-9][0-9 ()-]{8,18}[0-9]" error={fieldErrors.phoneNumber} /><Field label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'} name="password" type="password" value={form.password} onChange={update} minLength={12} maxLength={128} pattern={patterns.password.source} error={fieldErrors.password} /><Field label="Confirmar contraseña" name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} minLength={12} maxLength={128} error={fieldErrors.confirmPassword} /><div className="form-actions"><span>Contraseñas protegidas con PBKDF2 + SHA-512.</span><button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</button></div></form></section>}
    <section className="table-card"><div className="table-scroll"><table className="data-table"><thead><tr><th>PERSONA</th><th>USUARIO</th><th>ROLES</th><th>ESTADO</th><th>ÚLTIMO ACCESO</th>{isAdmin && <th>ACCIONES</th>}</tr></thead><tbody>{visible.map((user) => <tr key={user.userId}><td><div className="person"><span className="avatar">{`${user.firstName[0] || ''}${user.lastName[0] || ''}`.toUpperCase()}</span><div><b>{user.firstName} {user.lastName}</b><small>{user.email}{user.phoneNumber ? ` · ${user.phoneNumber}` : ''}</small></div></div></td><td>@{user.username}</td><td><span className="role-list">{user.roles}</span></td><td><span className={`status-label ${user.status}`}><i />{{ active: 'Activo', inactive: 'Inactivo', deleted: 'Eliminado' }[user.status]}</span></td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-MX') : 'Sin acceso'}</td>{isAdmin && <td><div className="row-actions"><button className="text-action" onClick={() => beginEdit(user)}>Editar</button><select aria-label={`Cambiar estado de ${user.username}`} value={user.status} onChange={(e) => toggle(user, e.target.value)}><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="deleted">Eliminado</option></select></div></td>}</tr>)}{visible.length === 0 && <tr><td colSpan={isAdmin ? '6' : '5'} className="empty-cell">{error ? 'No se pudo cargar la lista.' : query ? 'No hay coincidencias.' : 'Todavía no hay usuarios registrados.'}</td></tr>}</tbody></table></div></section>
    <div className="table-note">Los roles se administran por separado para evitar asignaciones accidentales.</div>
  </>;
}

/** Catálogo de roles: crea nombres únicos, consulta roles existentes y nunca concede permisos a usuarios. */
export function RolesPage({ isAdmin, notify, onNavigate }) {
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ roleName: '', description: '' });
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await bauMar.roles();
      setRoles(data.roles);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    const errors = validate(form, { passwordRequired: false, role: true });
    setFieldError(errors.roleName || '');
    if (errors.roleName) return;
    setBusy(true);
    try {
      await bauMar.createRole(form);
      notify({ type: 'success', message: 'Rol creado en catálogo. Sigue sin estar asignado a usuarios.' });
      setForm({ roleName: '', description: '' });
      await load();
    } catch (e2) {
      notify({ type: 'error', message: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="CATÁLOGO DE PERMISOS"
        title="Crear roles"
        description="Define nuevos perfiles de acceso para el equipo. Crear un rol no lo asigna a ningún usuario."
        action={isAdmin && <button className="button secondary" onClick={() => onNavigate('assignments')}>Administración de roles →</button>}
      />
      {error && <LoadingError error={error} onRetry={load} />}
      {isAdmin && (
        <form className="role-form" onSubmit={submit} noValidate>
          <div>
            <span className="overline">NUEVO ROL</span>
            <h2>Agregar al catálogo</h2>
            <p>El nombre debe ser único. La asignación y administración se realiza en Administración de roles.</p>
          </div>
          <div className="role-form-controls">
            <Field
              label="Nombre del rol"
              name="roleName"
              value={form.roleName}
              onChange={(e) => {
                setForm((old) => ({ ...old, roleName: e.target.value }));
                setFieldError('');
              }}
              maxLength={80}
              error={fieldError}
            />
            <Field
              label="Descripción (opcional)"
              name="description"
              value={form.description}
              onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))}
              maxLength={255}
            />
            <button className="button primary" disabled={busy}>{busy ? 'Creando…' : 'Crear rol'}</button>
          </div>
        </form>
      )}
      {!isAdmin && <div className="info-banner">Solo el administrador puede crear roles. Puedes consultar el catálogo actual.</div>}
      <section className="role-grid">
        {roles.map((role, index) => (
          <article className="role-card" key={role.roleId}>
            <div className="role-card-header">
              <span className="role-number">{String(index + 1).padStart(2, '0')}</span>
              <span className={`status-label ${role.status === 'suspended' ? 'inactive' : 'active'}`}>
                <i />{role.status === 'suspended' ? 'Suspendido' : 'Activo'}
              </span>
            </div>
            <h3>{role.roleName}</h3>
            <p>{role.description || 'Rol configurado en BauMar.'}</p>
            <footer>
              <span>{role.isSystem ? 'PREDEFINIDO (SISTEMA)' : 'PERSONALIZADO'}</span>
              <b>{role.assignedUsers} asignados</b>
            </footer>
          </article>
        ))}
      </section>
    </>
  );
}

/** Pantalla de administración de roles: permite renombrar roles personalizados, cambiar su estatus a Activo/Suspendido en base de datos y conceder permisos. */
export function RoleAdministrationPage({ isAdmin, notify }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [items, setItems] = useState([]);
  const [selection, setSelection] = useState({ userId: '', roleId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Estado para editar nombre de rol
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ roleName: '', description: '' });
  const [roleErrors, setRoleErrors] = useState({});

  async function load() {
    if (!isAdmin) return;
    try {
      const [userData, roleData, assignmentData] = await Promise.all([
        bauMar.users(),
        bauMar.roles(),
        bauMar.assignments()
      ]);
      setUsers(userData.users);
      setRoles(roleData.roles);
      setItems(assignmentData.assignments);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [isAdmin]);

  async function assign(e) {
    e.preventDefault();
    if (!selection.userId || !selection.roleId) {
      setError('Selecciona usuario y rol.');
      return;
    }
    setBusy(true);
    try {
      await bauMar.assignRole(selection.userId, selection.roleId);
      notify({ type: 'success', message: 'Rol asignado al usuario.' });
      setSelection({ userId: '', roleId: '' });
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(item) {
    if (!window.confirm(`¿Retirar el rol “${item.roleName}” de @${item.username}?`)) return;
    try {
      await bauMar.removeAssignment(item.assignmentId);
      notify({ type: 'success', message: 'Asignación retirada.' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEditRole(role) {
    setEditingRole(role);
    setRoleForm({ roleName: role.roleName, description: role.description || '' });
    setRoleErrors({});
  }

  async function saveRoleName(e) {
    e.preventDefault();
    const cleanName = roleForm.roleName.trim();
    if (!cleanName || cleanName.length < 2) {
      setRoleErrors({ roleName: 'Escribe un nombre de rol de al menos 2 caracteres.' });
      return;
    }
    setBusy(true);
    try {
      await bauMar.updateRole(editingRole.roleId, { roleName: cleanName, description: roleForm.description });
      notify({ type: 'success', message: `Nombre del rol actualizado a "${cleanName}".` });
      setEditingRole(null);
      await load();
    } catch (err) {
      notify({ type: 'error', message: err.message });
      setRoleErrors(err.details || {});
    } finally {
      setBusy(false);
    }
  }

  async function toggleRoleStatus(role) {
    const nextStatus = role.status === 'suspended' ? 'active' : 'suspended';
    const actionText = nextStatus === 'active' ? 'activar' : 'suspender';
    if (!window.confirm(`¿Deseas ${actionText} el rol "${role.roleName}" en la base de datos?`)) return;
    try {
      await bauMar.setRoleStatus(role.roleId, nextStatus);
      notify({
        type: 'success',
        message: `El rol "${role.roleName}" fue ${nextStatus === 'active' ? 'activado' : 'suspendido'} en la base de datos.`
      });
      await load();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    }
  }

  if (!isAdmin) return <ForbiddenPanel />;

  return (
    <>
      <PageHeading
        eyebrow="CONTROL DE ACCESOS Y ESTADOS"
        title="Administración de roles"
        description="Actualiza el nombre de roles personalizados, cambia su estatus (Activo/Suspendido) en base de datos y gestiona las asignaciones a usuarios."
      />
      {error && <LoadingError error={error} onRetry={load} />}

      {/* Formulario modal de edición de nombre de rol */}
      {editingRole && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <span className="overline">ACTUALIZAR ROL</span>
              <h2>Modificar "{editingRole.roleName}"</h2>
            </div>
            <button className="icon-close" type="button" onClick={() => setEditingRole(null)}>×</button>
          </div>
          <p className="subtle">Solo se pueden renombrar roles personalizados; los roles de sistema se encuentran protegidos.</p>
          <form className="field-grid" onSubmit={saveRoleName} noValidate>
            <Field
              label="Nombre del rol"
              name="roleName"
              value={roleForm.roleName}
              onChange={(e) => setRoleForm((old) => ({ ...old, roleName: e.target.value }))}
              maxLength={80}
              error={roleErrors.roleName}
            />
            <Field
              label="Descripción"
              name="description"
              value={roleForm.description}
              onChange={(e) => setRoleForm((old) => ({ ...old, description: e.target.value }))}
              maxLength={255}
            />
            <div className="form-actions">
              <span>El cambio se guardará en la base de datos y afectará a todas las asignaciones existentes.</span>
              <button className="button primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </form>
        </section>
      )}

      {/* Sección 1: Administración del catálogo de roles */}
      <section className="table-card" style={{ marginBottom: '24px' }}>
        <div className="table-title">
          <div>
            <span className="overline">CATÁLOGO Y ESTADOS EN BASE DE DATOS</span>
            <h2>Roles registrados</h2>
          </div>
          <span>{roles.length} roles en catálogo</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ROL</th>
                <th>IDENTIFICADOR</th>
                <th>TIPO</th>
                <th>ESTATUS EN BD</th>
                <th>USUARIOS</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.roleId}>
                  <td>
                    <b>{role.roleName}</b>
                    {role.description && <small className="table-subtext">{role.description}</small>}
                  </td>
                  <td><code>{role.roleKey}</code></td>
                  <td>
                    <span className={`role-badge ${role.isSystem ? 'system-badge' : 'custom-badge'}`}>
                      {role.isSystem ? 'Sistema (Predefinido)' : 'Personalizado'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-label ${role.status === 'suspended' ? 'inactive' : 'active'}`}>
                      <i />{role.status === 'suspended' ? 'Suspendido' : 'Activo'}
                    </span>
                  </td>
                  <td>{role.assignedUsers} asignados</td>
                  <td>
                    {role.isSystem ? (
                      <span className="subtle" style={{ fontSize: '12px' }}>🔒 Protegido del sistema</span>
                    ) : (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => startEditRole(role)}
                        >
                          Editar nombre
                        </button>
                        <button
                          type="button"
                          className={`text-action ${role.status === 'suspended' ? 'primary-text-action' : 'danger-action'}`}
                          onClick={() => toggleRoleStatus(role)}
                        >
                          {role.status === 'suspended' ? 'Activar rol' : 'Suspender rol'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sección 2: Conceder un rol a un usuario */}
      <form className="assignment-form" onSubmit={assign}>
        <div className="assignment-copy">
          <span className="overline">NUEVA ASIGNACIÓN</span>
          <h2>Conceder un rol</h2>
          <p>Esta operación queda registrada con el administrador que la autorizó.</p>
        </div>
        <label className="field">
          <span>Usuario</span>
          <select value={selection.userId} onChange={(e) => setSelection((old) => ({ ...old, userId: e.target.value }))}>
            <option value="">Selecciona una cuenta</option>
            {users.map((user) => (
              <option value={user.userId} key={user.userId}>@{user.username} · {user.firstName} {user.lastName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rol</span>
          <select value={selection.roleId} onChange={(e) => setSelection((old) => ({ ...old, roleId: e.target.value }))}>
            <option value="">Selecciona un rol</option>
            {roles.map((role) => (
              <option value={role.roleId} key={role.roleId} disabled={role.status === 'suspended'}>
                {role.roleName} {role.status === 'suspended' ? '(Suspendido)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy}>{busy ? 'Asignando…' : 'Asignar rol'}</button>
      </form>

      {/* Sección 3: Permisos vigentes */}
      <section className="table-card">
        <div className="table-title">
          <div>
            <span className="overline">PERMISOS VIGENTES</span>
            <h2>Asignaciones</h2>
          </div>
          <span>{items.length} roles asignados</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>USUARIO</th>
                <th>ROL</th>
                <th>ASIGNADO POR</th>
                <th>FECHA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.assignmentId}>
                  <td>
                    <div className="person">
                      <span className="avatar">{`${item.firstName[0] || ''}${item.lastName[0] || ''}`.toUpperCase()}</span>
                      <div>
                        <b>{item.firstName} {item.lastName}</b>
                        <small>@{item.username} · {item.email}</small>
                      </div>
                    </div>
                  </td>
                  <td><span className="role-badge">{item.roleName}</span></td>
                  <td>{item.assignedByUsername ? `@${item.assignedByUsername}` : 'Configuración del sistema'}</td>
                  <td>{new Date(item.assignedAt).toLocaleDateString('es-MX')}</td>
                  <td><button className="text-action danger-action" onClick={() => revoke(item)}>Retirar</button></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="5" className="empty-cell">Aún no hay roles asignados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** Placeholder intencional de clientes; presenta el plan del módulo sin consultar ni mostrar información de clientes. */
export function ClientsPage() { return <><PageHeading eyebrow="SIGUIENTE ETAPA" title="Clientes" description="El espacio está preparado para incorporarse en una siguiente fase." /><div className="empty-panel client-empty"><span className="empty-icon">♧</span><h3>Módulo en preparación</h3><p>En esta etapa no se muestran ni gestionan datos de clientes. La arquitectura ya permite añadir clientes, vehículos e historial de servicio.</p><div className="future-list"><span>◯ Perfil del cliente</span><span>◯ Vehículos</span><span>◯ Historial de servicio</span></div></div></>; }

/** Portada privada con saludo y resumen del alcance actual. */
export function DashboardPage({ user }) { return <><PageHeading eyebrow="PANEL DE CONTROL" title={`Hola, ${user.firstName}.`} description="Bienvenido al espacio de gestión del taller BauMar." /><div className="dashboard-hero"><span className="hero-tag">BAUMAR · AUTOMOTRIZ</span><h2>El servicio empieza<br /><em>con un buen equipo.</em></h2><p>Gestiona accesos, organiza los perfiles del taller y prepara la información para los siguientes módulos.</p><div className="hero-road"><span>BM</span></div></div><div className="dashboard-cards"><article><span>01</span><h3>Usuarios</h3><p>Crea y administra las cuentas del equipo.</p></article><article><span>02</span><h3>Roles</h3><p>Define perfiles independientes de acceso.</p></article><article><span>03</span><h3>Administración de roles</h3><p>Concede permisos con autorización de administrador.</p></article></div></>; }
