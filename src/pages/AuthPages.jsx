import React, { useEffect, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';
import { patterns, validate } from '../validators.js';
import { Brand, Field } from '../components/Brand.jsx';

function setPageQuery(page) {
  const url = new URL(window.location.href);
  url.search = page === 'login' ? '' : `?view=${page}`;
  window.history.pushState({}, '', url);
}

function CredentialsFields({ values, errors, includePassword = true }) {
  return <>
    <Field label="Nombre" name="firstName" placeholder="Ej. María" autoComplete="given-name" maxLength={80} pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{0,78}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]" value={values.firstName} onChange={values.onChange} error={errors.firstName} />
    <Field label="Apellidos" name="lastName" placeholder="Ej. López García" autoComplete="family-name" maxLength={80} pattern="[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ .'-]{0,78}[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.]" value={values.lastName} onChange={values.onChange} error={errors.lastName} />
    <Field label="Nombre de usuario" name="username" placeholder="maria.lopez" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" value={values.username} onChange={values.onChange} error={errors.username} />
    <Field label="Correo electrónico" name="email" type="email" placeholder="nombre@correo.com" autoComplete="email" maxLength={190} value={values.email} onChange={values.onChange} error={errors.email} />
    <Field label="Teléfono de contacto" name="phoneNumber" type="tel" placeholder="Ej. 55 1234 5678" autoComplete="tel" maxLength={20} pattern="[+]?[0-9][0-9 ()-]{8,18}[0-9]" value={values.phoneNumber} onChange={values.onChange} error={errors.phoneNumber} />
    {includePassword && <Field label="Contraseña" name="password" type="password" placeholder="Mínimo 12 caracteres" autoComplete="new-password" minLength={12} maxLength={128} pattern={patterns.password.source} value={values.password} onChange={values.onChange} error={errors.password} />}
    {includePassword && <Field label="Confirmar contraseña" name="confirmPassword" type="password" placeholder="Escribe de nuevo tu contraseña" autoComplete="new-password" minLength={12} maxLength={128} value={values.confirmPassword} onChange={values.onChange} error={errors.confirmPassword} />}
  </>;
}

/** Formularios de sesión, registro, configuración inicial y recuperación con validación client-side y mensajes accesibles. */
export function AuthPages({ onAuthenticated, notify }) {
  const params = new URLSearchParams(window.location.search);
  const initialView = params.has('reset') ? 'reset' : params.get('view') || 'login';
  const [page, setPage] = useState(['login','setup','register','forgot'].includes(initialView) ? initialView : 'login');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [resetUrl, setResetUrl] = useState('');
  const [recoveryHelp, setRecoveryHelp] = useState('');
  const [activeResetToken, setActiveResetToken] = useState(params.get('reset') || '');
  const [form, setForm] = useState({ identifier: '', email: '', firstName: '', lastName: '', username: '', phoneNumber: '', password: '', confirmPassword: '' });

  useEffect(() => { const onPop = () => { const p = new URLSearchParams(window.location.search); setPage(p.has('reset') ? 'reset' : p.get('view') || 'login'); }; window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);

  function changePage(next) { setErrors({}); setResetUrl(''); setRecoveryHelp(''); setPage(next); setPageQuery(next); }
  function update(event) { const { name, value } = event.target; setForm((old) => ({ ...old, [name]: value })); setErrors((old) => ({ ...old, [name]: undefined, ...(name === 'password' ? { confirmPassword: undefined } : {}) })); if (page === 'forgot' && name === 'identifier') { setRecoveryHelp(''); setResetUrl(''); } }
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const isAccount = ['register', 'setup'].includes(page);
    let validation = {};
    if (isAccount) {
      validation = validate(values);
    } else if (page === 'reset') {
      validation = validate({ password: values.password }, { passwordRequired: true });
      if (values.password !== values.confirmPassword) validation.confirmPassword = 'Las contraseñas no coinciden.';
    } else if (page === 'forgot') {
      const target = (values.identifier || values.email || '').trim();
      const isEmail = patterns.email.test(target) && target.length <= 190;
      const cleanPhone = target.replace(/[ ()-]/g, '');
      const isPhone = /^\+?\d{10,15}$/.test(cleanPhone);
      const isLocalUsername = import.meta.env.DEV && patterns.username.test(target);
      if (!target) validation.identifier = 'Escribe tu correo electrónico o número de teléfono.';
      else if (!isEmail && !isPhone && !isLocalUsername) validation.identifier = import.meta.env.DEV
        ? 'Escribe un correo válido, un teléfono de 10 a 15 dígitos o tu usuario BauMar.'
        : 'Escribe un correo válido o un teléfono de 10 a 15 dígitos.';
    } else if (page === 'login') {
      if (!values.identifier.trim() || !values.password) validation.identifier = 'Escribe usuario/correo y contraseña.';
    }
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      if (page === 'login') { const user = await bauMar.signIn({ identifier: values.identifier.trim(), password: values.password }); onAuthenticated(user); return; }
      if (page === 'setup') { await bauMar.setupAdministrator(values); notify({ type: 'success', message: 'Cuenta administradora creada. Ya puedes iniciar sesión.' }); changePage('login'); }
      if (page === 'register') { await bauMar.register(values); notify({ type: 'success', message: 'Cuenta de cliente creada. Inicia sesión para continuar.' }); changePage('login'); }
      if (page === 'forgot') {
        const target = (values.identifier || values.email || '').trim();
        const result = await bauMar.forgotPassword({ identifier: target, email: target, phoneNumber: target });
        setResetUrl(result.resetUrl || '');
        setRecoveryHelp(result.localRecoveryMessage || 'Si la cuenta está activa, recibirás instrucciones por el canal configurado.');
        if (result.resetToken) setActiveResetToken(result.resetToken);
        notify({ type: 'success', message: result.message });
      }
      if (page === 'reset') {
        const token = activeResetToken || new URLSearchParams(window.location.search).get('reset');
        if (!token) throw new Error('Falta el token de recuperación. Vuelve a solicitar el enlace.');
        await bauMar.resetPassword({ token, password: values.password, confirmPassword: values.confirmPassword });
        notify({ type: 'success', message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
        setActiveResetToken('');
        changePage('login');
      }
    } catch (error) { setErrors(error.details || {}); notify({ type: 'error', message: error.message }); }
    finally { setBusy(false); }
  }

  const isFormPage = ['setup', 'register'].includes(page);
  const title = ({ login: 'Login', setup: 'Configura BauMar.', register: 'Registrarse', forgot: 'Recuperar contraseña', reset: 'Nueva contraseña' })[page] || 'Login';
  const description = ({ login: 'Ingresa a tu espacio de trabajo.', setup: 'Registra a la persona propietaria y crea la cuenta administradora inicial.', register: 'Crea tu cuenta de cliente en BauMar.', forgot: import.meta.env.DEV ? 'Recuperación local: escribe el correo, teléfono o usuario registrado para obtener el enlace de restablecimiento.' : 'Ingresa tu correo o teléfono registrado para enviarte las instrucciones de recuperación.', reset: 'Elige una contraseña nueva para proteger tu cuenta.' })[page];
  return <main className="auth-layout"><aside className="auth-visual"><Brand light /><div className="visual-copy"><span className="overline">SERVICIO CONFIABLE, DESDE EL PRIMER DÍA</span><h1>Tu taller.<br /><em>En buenas manos.</em></h1><p>Bienvenido a BauMar, el espacio que conecta a todo el equipo del taller.</p></div><div className="visual-bottom"><span>BAUMAR · TALLER AUTOMOTRIZ</span><span>01 / 04</span></div></aside>
    <section className="auth-panel"><div className="auth-card"><div className="mobile-brand"><Brand /></div><span className="overline">{page === 'login' ? 'LOGIN / ACCESO' : page === 'setup' ? 'CONFIGURACIÓN INICIAL' : page === 'forgot' ? 'RECUPERAR CONTRASEÑA' : 'REGISTRARSE'}</span><h2>{title}</h2><p className="auth-description">{description}</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        {isFormPage && <CredentialsFields values={{ ...form, onChange: update }} errors={errors} />}
        {page === 'login' && <><Field label="Usuario o correo electrónico" name="identifier" autoComplete="username" placeholder="usuario o correo@taller.com" value={form.identifier} onChange={update} error={errors.identifier} /><Field label="Contraseña" name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" value={form.password} onChange={update} error={errors.password} /></>}
        {page === 'forgot' && <Field label="Correo, teléfono o usuario" name="identifier" type="text" autoComplete="username email tel" placeholder={import.meta.env.DEV ? 'correo@taller.com, teléfono o usuario' : 'correo@taller.com o teléfono'} maxLength={190} value={form.identifier} onChange={update} error={errors.identifier} />}
        {page === 'reset' && <><Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" placeholder="Mínimo 12 caracteres" minLength={12} maxLength={128} value={form.password} onChange={update} error={errors.password} /><Field label="Confirmar contraseña" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repite la nueva contraseña" minLength={12} maxLength={128} value={form.confirmPassword} onChange={update} error={errors.confirmPassword} /><div className="password-hint">12+ caracteres con mayúscula, minúscula, número y símbolo.</div></>}
        {page === 'login' && <button className="inline-link forgot-link" type="button" onClick={() => changePage('forgot')}>¿Olvidaste tu contraseña? (Recuperar contraseña)</button>}
        <button className="button primary wide" disabled={busy}>{busy ? 'Procesando…' : ({ login: 'Login / Iniciar sesión', setup: 'Crear cuenta administradora', register: 'Registrarse', forgot: import.meta.env.DEV ? 'Generar enlace local' : 'Enviar instrucciones', reset: 'Guardar contraseña' })[page] || 'Continuar'} <span>→</span></button>
      </form>
      {recoveryHelp && page === 'forgot' && <div className="info-banner" role="status" style={{ marginTop: '12px' }}>{recoveryHelp}</div>}
      {resetUrl && page === 'forgot' && (
        <div style={{ marginTop: '14px', textAlign: 'center' }}>
          <a className="reset-preview" href={resetUrl}>Abrir enlace de recuperación local ↗</a>
          <button
            type="button"
            className="button secondary"
            style={{ marginTop: '9px', width: '100%' }}
            onClick={() => {
              const u = new URL(resetUrl, window.location.origin);
              const token = u.searchParams.get('reset');
              if (token) setActiveResetToken(token);
              changePage('reset');
            }}
          >
            Restablecer contraseña ahora →
          </button>
        </div>
      )}
      {page === 'login' && (
        <div className="auth-switches">
          <button type="button" onClick={() => changePage('register')}>Registrarse</button>
        </div>
      )}
      {(page === 'forgot' || page === 'reset') && (
        <div className="auth-switches vertical">
          <button type="button" onClick={() => changePage('login')}>Login / Iniciar sesión</button>
          <button type="button" onClick={() => changePage('register')}>Registrarse</button>
        </div>
      )}
      {page === 'register' && (
        <div className="auth-switches">
          <button type="button" onClick={() => changePage('login')}>¿Ya tienes cuenta? Login</button>
        </div>
      )}
      {page === 'setup' && (
        <div className="auth-switches">
          <button type="button" onClick={() => changePage('login')}>Volver a Login</button>
        </div>
      )}
      <footer className="auth-footer"><span>© {new Date().getFullYear()} BauMar</span><span>Sesión segura</span></footer>
    </div></section></main>;
}
