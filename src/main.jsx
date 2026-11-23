import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bauMar } from './facades/BauMarFacade.js';
import { ViewContext, ViewStrategy } from './strategies/ViewStrategy.js';
import { Brand, Notice } from './components/Brand.jsx';
import { AuthPages } from './pages/AuthPages.jsx';
import { DashboardPage, RoleAdministrationPage, RolesPage, UsersPage } from './pages/AdminPages.jsx';
import { ClientsManagementPage, RegisterClientPage, WorkshopsPage } from './pages/WorkshopPages.jsx';
import { RegisterVehiclePage, VehicleAdministrationPage } from './pages/VehiclePages.jsx';
import { MapAgentPage } from './pages/MapAgentPage.jsx';
import { PerformancePage } from './pages/PerformancePage.jsx';
import { browserPerformanceAnalystAgent } from './agents/BrowserPerformanceAnalystAgent.js';
import './styles.css';

const sectionInfo = {
  roles: { label: 'Crear roles', icon: '⬡' },
  assignments: { label: 'Administración de roles', icon: '⚿' },
  registerClient: { label: 'Registrar cliente', icon: '✚' },
  clients: { label: 'Administración de clientes', icon: '♧' },
  workshops: { label: 'Taller mecánico', icon: '⌂' },
  mapAgent: { label: 'Agente de mapas', icon: '⌖' },
  performance: { label: 'Analista de rendimiento', icon: '▥' },
  users: { label: 'Usuarios', icon: '♙' },
  vehicleRegistration: { label: 'Registro de auto', icon: '▰' },
  vehicleAdmin: { label: 'Administración de vehículo', icon: '⚙' },
};

/** Shell autenticado; entrega el contenido de cada sección al patrón Strategy de vistas. */
function Workspace({ user, onLogout, notify, notice, closeNotice }) {
  const [activeSection, setActiveSection] = useState('dashboard');
  const transitionStart = useRef(null);
  const firstView = useRef(true);
  const isAdmin = user.roles?.includes('administrator');
  const canRegisterClient = isAdmin || user.roles?.includes('receptionist');
  const viewContext = useMemo(() => new ViewContext({
    dashboard: new ViewStrategy(DashboardPage),
    roles: new ViewStrategy(RolesPage),
    assignments: new ViewStrategy(RoleAdministrationPage),
    registerClient: new ViewStrategy(RegisterClientPage),
    clients: new ViewStrategy(ClientsManagementPage),
    workshops: new ViewStrategy(WorkshopsPage),
    mapAgent: new ViewStrategy(MapAgentPage),
    performance: new ViewStrategy(PerformancePage),
    users: new ViewStrategy(UsersPage),
    vehicleRegistration: new ViewStrategy(RegisterVehiclePage),
    vehicleAdmin: new ViewStrategy(VehicleAdministrationPage),
  }), []);
  useEffect(() => {
    if (!isAdmin) return;
    const durationMs = firstView.current ? browserPerformanceAnalystAgent.initialPageDuration() : browserPerformanceAnalystAgent.finishViewTransition(transitionStart.current ?? browserPerformanceAnalystAgent.startViewTransition());
    firstView.current = false;
    bauMar.recordPerformancePage({ view: activeSection, durationMs }).catch(() => {});
  }, [activeSection, isAdmin]);
  function navigateTo(section) {
    transitionStart.current = browserPerformanceAnalystAgent.startViewTransition();
    setActiveSection(section);
  }
  const view = viewContext.render(activeSection, { user, isAdmin, canRegisterClient, notify, onNavigate: navigateTo });
  const title = sectionInfo[activeSection]?.label || 'Inicio';
  const visibleSections = Object.entries(sectionInfo).filter(([key]) => key !== 'performance' || isAdmin);

  return <div className="workspace">
    <aside className="sidebar"><Brand /><div className="workspace-badge"><span className="shop-icon">B</span><div><b>Taller BauMar</b><small>Espacio de trabajo</small></div><span className="chevron">⌄</span></div>
      <span className="nav-caption">GESTIÓN DEL TALLER</span><nav aria-label="Navegación principal">{visibleSections.map(([key, item]) => <button key={key} className={`nav-link ${activeSection === key ? 'selected' : ''}`} onClick={() => navigateTo(key)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><span>✳</span><div><b>Acceso protegido</b><small>Conectado a BauMar</small></div></div><button className="profile-control" onClick={onLogout}><span className="avatar profile-avatar">{`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()}</span><span className="profile-text"><b>{user.firstName} {user.lastName}</b><small>{user.roles?.includes('administrator') ? 'Administrador' : user.roles?.join(', ') || 'Sin rol asignado'}</small></span><span className="logout-icon">↗</span></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>BauMar</span><i>/</i><b>{title}</b></div><div className="header-right"><span className="header-date">{new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span><span className="header-divider"/><span className="online-state"><i/> En línea</span><span className="avatar small-avatar">{`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()}</span></div></header>
      <div className="content-wrap">{notice && <Notice notice={notice} onClose={closeNotice} />}{view}<footer className="workspace-footer"><span>BAUMAR · SISTEMA DE GESTIÓN AUTOMOTRIZ</span><span>UUIDv7 · Seguridad SHA-512</span></footer></div>
    </main>
  </div>;
}

/** Orquestador React; conserva el token de sesión solo en memoria y enruta entre acceso y espacio privado. */
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    bauMar.restoreSession().then(setUser).catch((error) => setNotice({ type: 'error', message: error.message })).finally(() => setLoading(false));
  }, []);
  async function logout() { await bauMar.signOut(); setUser(null); setNotice({ type: 'success', message: 'Sesión cerrada.' }); }
  if (loading) return <div className="app-loading"><Brand /><span>Preparando tu espacio…</span></div>;
  if (!user) return <><Notice notice={notice} onClose={() => setNotice(null)} /><AuthPages onAuthenticated={(account) => { setNotice(null); setUser(account); }} notify={setNotice} /></>;
  return <Workspace user={user} onLogout={logout} notify={setNotice} notice={notice} closeNotice={() => setNotice(null)} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
