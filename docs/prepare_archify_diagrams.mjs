import fs from 'node:fs';
import path from 'node:path';

const directory = path.join(import.meta.dirname, 'diagramas');
const exportsDirectory = path.join(directory, 'exportados');
fs.mkdirSync(exportsDirectory, { recursive: true });

/** Recorta texto visible para respetar el tamaño legible de nodos sin alterar relaciones ni mensajes de las aristas. */
function compact(value, max = 12) {
  const aliases = {
    'Administrador': 'Admin', 'Personal BauMar': 'Personal', 'Recepción o administrador': 'Recepción/admin',
    'Técnico o administrador': 'Técnico/admin', 'Administración de roles': 'Admin roles',
    'Formulario del taller': 'Alta taller', 'Filtro de imagen': 'Foto válida',
    'Verificar contraseña': 'Verificar clave', 'Acceso rechazado': 'Acceso denegado',
    'Validación backend': 'Validar API', 'Excepción técnica': 'Error técnico',
    'Catálogo statuses': 'Estados', 'Historial inmutable': 'Historial',
    'Diagnóstico inicial': 'Diagnóstico', 'Sin vehículo vinculado': 'Sin vehículo',
    'Taller obligatorio': 'Taller requerido', 'Correo duplicado': 'Correo existe',
    'Conteo por taller': 'Visitas', 'Alta de cliente': 'Alta cliente',
    'Registrar visita': 'Visita', 'Ficha del vehículo': 'Vehículo',
    'Formulario de avance': 'Avance', 'workshop_visits': 'Visitas taller',
    'password_reset_tokens': 'Tokens reset', 'POST /api/auth/login': 'API login',
    'POST /forgot-password': 'API recuperar', 'POST /admin/vehicles': 'API vehículo',
    'POST vehicle status': 'API estado', 'application.log': 'Log archivo',
    'Contraseñas y tokens': 'Secretos', 'Validación del perfil': 'Validar perfil',
    'Vincular cuenta cliente': 'Vincular cuenta', 'Taller disponible': 'Taller activo',
    'Verificar clave': 'Verificar', 'Acceso denegado': 'Rechazado',
    'Recepción/admin': 'Recepción', 'Vincular cuenta': 'Cuenta cliente',
    'Taller requerido': 'Sin taller',
  };
  if (!value) return value;
  if (aliases[value]) return aliases[value];
  if (value.length <= max) return value;
  return `${value.slice(0, Math.min(max, 10) - 1).trimEnd()}…`;
}

for (const filename of fs.readdirSync(directory).filter((name) => /^0[1-6]-[^.]+\.json$/u.test(name))) {
  const fullPath = path.join(directory, filename);
  const spec = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const stem = path.basename(filename, '.json');
  spec.meta.output = `docs/diagramas/exportados/${stem}.html`;
  delete spec.mainPath;
  spec.lanes = [
    { id: 'interface', label: 'Interfaz y actor' },
    { id: 'services', label: 'Servicios y validación' },
    { id: 'data', label: 'Persistencia' },
    { id: 'exceptions', label: 'Errores y alternativas', variant: 'exception' },
  ];
  const laneCounts = new Map();
  const exceptionIds = new Set(['invalid', 'message', 'bad_photo', 'duplicate', 'postal_error', 'no_role', 'no_shop', 'dup_client', 'empty_portal']);
  for (const node of spec.nodes || []) {
    node.label = compact(node.label);
    if (node.sublabel) node.sublabel = compact(node.sublabel, 11);
    const lane = node.id === 'empty_portal' ? 'interface'
      : node.lane === 'errors' || node.lane === 'excepcion' || exceptionIds.has(node.id) ? 'exceptions'
      : node.type === 'external' || node.type === 'frontend' ? 'interface'
        : node.type === 'database' ? 'data' : 'services';
    node.lane = lane;
    node.col = laneCounts.get(lane) || 0;
    laneCounts.set(lane, node.col + 1);
  }
  if (stem === '03-alta-de-taller') {
    const addressReturn = spec.edges.find((edge) => edge.id === 'pick-address');
    if (addressReturn) delete addressReturn.route;
  }
  const routeFallbacks = {
    '04-clientes-y-visitas': ['missing-shop', 'validate-workshop'],
    '05-estado-de-vehiculos': ['vehicle-persist'],
    '06-errores-y-estados': ['request-validation'],
  };
  const excludedEdges = new Set(routeFallbacks[stem] || []);
  if (excludedEdges.size) spec.edges = spec.edges.filter((edge) => !excludedEdges.has(edge.id));
  if (stem === '05-estado-de-vehiculos') {
    delete spec.cards;
    spec.meta.viewBox = [1024, 652];
  }
  const positions = new Map();
  for (const node of spec.nodes || []) {
    node.col = Math.round(node.col);
    const key = `${node.lane}:${node.col}`;
    if (positions.has(key)) {
      const next = Array.from({ length: 6 }, (_, i) => i).find((candidate) => !positions.has(`${node.lane}:${candidate}`));
      if (next !== undefined) node.col = next;
    }
    positions.set(`${node.lane}:${node.col}`, true);
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
}
console.log(`Prepared Archify sources and created ${exportsDirectory}`);
