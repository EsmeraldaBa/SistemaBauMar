# Guía de desarrollo y comprobación · BauMar

La aplicación ya está implementada. Esta guía presenta el recorrido de sus etapas, con archivos concretos y una comprobación antes de continuar. Ejecuta los comandos desde la carpeta `BauMar` (raíz independiente del proyecto) en PowerShell. Usa las mismas verificaciones después de cada cambio futuro.

## Etapa 1 — Requisitos previos

**Archivos:** ninguno. **Necesitas:** Node.js 20+, pnpm 11.25.0 y Docker Desktop con la imagen MySQL 8.4 disponible.

```powershell
node --version
pnpm --version
```

**Resultado/comprobación:** Node, pnpm y Docker CLI están disponibles. El Compose propio de BauMar se encuentra en `compose.yaml`.

## Etapa 2 — React, HTML5 y CSS3

**Archivos:** `package.json`, `index.html`, `vite.config.js`, `src/main.jsx`, `src/styles.css`.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

**Resultado/comprobación:** Vite indica `http://localhost:5173`; la página muestra marca BauMar. El HTML tiene `lang="es"`, viewport y título accesible. El script inicia los procesos mediante pnpm para que no dependa de que `npm` esté agregado al PATH.

## Etapa 3 — Configurar Express

**Archivos:** `server/src/index.js`, `server/src/config.js`, `server/src/routes/`.

La API registra JSON, CORS local, folios de solicitud, rutas y middleware central de errores.

**Resultado/comprobación:** `pnpm dev` inicia Vite y Express. La API escucha en el puerto 4000 y requiere `JWT_SECRET` con al menos 32 caracteres.

## Etapa 4 — Configurar MySQL mediante Docker

**Archivos:** `.env.example`, `.env` local, `compose.yaml` y `server/sql/schema.sql`. No uses la configuración Compose de la carpeta padre: corresponde a otro proyecto.

```powershell
Copy-Item .env.example .env
# Completa los secretos y conserva las credenciales con que se creó el volumen existente.
docker compose -f compose.yaml config
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
```

Compose usa `./server/sql/schema.sql`, ruta relativa a `BauMar/`, y el volumen externo `newproject_baumar_mysql_data`. Esto evita el montaje roto a `New project/server/sql/schema.sql` y conserva los datos de BauMar. No borres ni recrees el volumen. Abre `http://localhost:8080`; revisa `Invoke-RestMethod http://localhost:8080/api/health`.

## Etapa 5 — Crear base y tablas

**Archivo:** `server/sql/schema.sql`.

El esquema actual define usuarios, roles, asignaciones, perfiles por rol y tokens de recuperación, además de los seis roles iniciales. Compose monta el archivo como inicializador; MySQL solo lo ejecuta cuando crea un volumen vacío. El volumen BauMar existente no vuelve a inicializarse ni recibe migraciones automáticamente.

**Resultado/comprobación:** verifica `/api/health` y consulta el esquema existente con Workbench. Las seis migraciones numeradas son actualizaciones para instalaciones previas, no un instalador fresco ni ejecutables repetidamente.

## Etapa 6 — UUIDv7

**Archivo:** `server/src/utils/uuidv7.js`; sus consumidores son `accountService.js`, `roleService.js` y `UserFactory.js`.

`uuidv7()` codifica timestamp de 48 bits y configura versión 7/variante RFC. IDs de usuarios, catálogo personalizado, perfil, asignación y reset se generan en Node.

```powershell
pnpm test
```

**Resultado/comprobación:** la prueba UUID muestra versión `7` y no se repite el valor. `information_schema.columns` no muestra columnas `AUTO_INCREMENT`.

## Etapa 7 — Conexión Node/MySQL

**Archivos:** `.env`, `server/src/config.js`, `server/src/db.js`.

La conexión usa el pool de `mysql2/promise`, zona UTC, UTF-8 y el usuario de aplicación.

```powershell
Invoke-RestMethod http://localhost:4000/api/health
```

**Resultado/comprobación:** `{ "status": "ok", "database": "connected" }`. Un fallo se registra y se devuelve como mensaje legible.

## Etapa 8 — Arquitectura del backend

**Archivos:** `server/src/routes/`, `controllers/`, `services/`, `models/`, `middleware/`, `validators/`, `utils/`.

Las rutas delegan en controladores, reglas y transacciones viven en servicios, las consultas frecuentes se encapsulan en modelos y autenticación/error en middleware.

**Comprobación:** `pnpm test` pasa y `pnpm build` compila el frontend. React no importa `mysql2` ni contiene credenciales de base de datos.

## Etapa 9 — Factory Method

**Archivo:** `server/src/factories/UserFactory.js`; se invoca desde `accountService.js` al asignar un rol.

Cada rol de sistema crea su perfil concreto. Roles personalizados no fabrican una tabla, pero conservan su asignación de catálogo. SQL de perfil usa tablas de una lista cerrada de código.

**Comprobación:** las pruebas verifican que `technician` produce `technician_profiles` y que un rol personalizado no elige una tabla.

## Etapa 10 — API REST

**Archivos:** `server/src/routes/authRoutes.js`, `server/src/routes/adminRoutes.js`, controladores y servicios.

Las rutas están listadas en el README principal. Solicitudes/respuestas usan JSON; Bearer JWT autentica operaciones privadas.

**Comprobación:** `/api/health` responde 200 y rutas no encontradas responden JSON 404 con folio.

## Etapa 11 — Adapter frontend/backend

**Archivo:** `src/adapters/httpAdapter.js`.

Convierte operaciones de servicio en `fetch`, agrega JSON/Bearer token y adapta errores HTTP a errores con mensaje, código y folio para React.

**Comprobación:** los componentes llaman servicios, no ejecutan `fetch` ni SQL. Al apagar la API, el aviso dice que no se pudo conectar.

## Etapa 12 — Facade frontend

**Archivo:** `src/facades/BauMarFacade.js`; servicios: `src/services/authService.js` y `adminService.js`.

Los componentes usan `bauMar` como interfaz sencilla para cuenta, login, usuarios, roles y asignaciones. La fachada coordina el token con el Adapter.

**Comprobación:** buscar `bauMar.` en `src/pages` muestra operaciones de alto nivel; ninguna vista debe importar directamente `httpAdapter`.

## Etapa 13 — Strategy para vistas

**Archivo:** `src/strategies/ViewStrategy.js`; selector de vistas: `src/main.jsx`.

`ViewContext` resuelve una estrategia por sección. Después del login muestra el panel de control; el menú lateral se filtra por rol y presenta únicamente las áreas habilitadas para esa cuenta. La vista de asignación se abre desde el botón de Roles y no ocupa un enlace lateral.

**Comprobación:** cambia secciones desde la barra lateral; cada opción muestra la vista correspondiente.

## Etapa 14 — Registro

**Archivos:** `src/pages/AuthPages.jsx`, `server/src/controllers/authController.js`, `accountService.js`.

Crear cuenta registra identidad y contraseña derivada. La política pública crea rol Cliente explícitamente. La creación administrativa del módulo Usuarios no concede roles.

**Comprobación:** un nuevo registro inicia sesión como cliente; la cuenta creada por admin aparece “Sin rol” hasta que se use Administración de roles.

## Etapa 15 — Login

**Archivos:** `src/pages/AuthPages.jsx`, `accountService.js`, `authRoutes.js`, `middleware/auth.js`.

Admite nombre de usuario o correo. Hash de contraseña se verifica antes de emitir JWT de ocho horas.

**Comprobación:** acceso correcto abre el espacio de trabajo; credenciales incorrectas muestran mensaje general y generan log sin contraseña.

## Etapa 16 — Recuperación de contraseña

**Archivos:** `src/pages/AuthPages.jsx`, `server/src/controllers/authController.js`, `accountService.js`, `passwords.js`.

Permite solicitar recuperación mediante **correo electrónico o número de teléfono registrado**. La respuesta no enumera cuentas por motivos de seguridad; el token criptográfico de un solo uso vence en 30 minutos y se persiste en MySQL únicamente como huella SHA-512 (`password_reset_tokens`). En desarrollo (`RESET_TOKEN_EXPOSE_IN_DEVELOPMENT=true`) se genera el enlace local y un botón directo para cambiar la contraseña inmediatamente; en producción se integra con un servicio SMS o de correo transaccional.

**Comprobación:** reset válido con correo o teléfono permite asignar nueva contraseña; token reutilizado o vencido responde 400; el log no guarda token ni contraseña y registra el canal (`via: 'email'` o `via: 'phone'`).

## Etapa 17 — Usuarios

**Archivos:** `src/pages/AdminPages.jsx` (`UsersPage`), `adminController.js`, `userModel.js`.

El directorio se consulta con sesión; solo administración puede crear, editar o cambiar estados. Los datos de contacto se reservan al administrador. Las cuentas creadas desde Usuarios quedan sin rol hasta una asignación explícita.

**Comprobación:** la lista carga con sesión y oculta correo/teléfono a perfiles no administrativos; operaciones de alta/edición/estado desde una cuenta normal reciben 403. Admin no puede desactivar su cuenta o la última cuenta administradora.

## Etapa 18 — Roles

**Archivos:** `src/pages/AdminPages.jsx` (`RolesPage`), `roleService.js`, `roleModel.js`, tabla `roles`.

Crear rol solo inserta en el catálogo. `UNIQUE(role_key)` y `UNIQUE(role_name)` bloquean duplicados.

**Comprobación:** nuevo rol muestra cero asignaciones; volver a crear igual da 409 “El rol ya existe”.

## Etapa 19 — Administración de roles

**Archivos:** `src/pages/AdminPages.jsx` (`RoleAdministrationPage`), `adminRoutes.js`, middleware y `roleService.js`.

Solo admin lista, concede y retira. Se llega desde **Roles → Administrar asignaciones**; la opción ya no aparece en la barra lateral. La base impide repetir `(user_id, role_id)` y guarda quién concedió.

**Comprobación:** admin puede asignar; cliente/técnico manualmente por HTTP recibe 403. Cuenta no puede quedarse sin al menos un administrador activo.

## Etapa 20 — Clientes

**Archivos:** `src/pages/WorkshopPages.jsx` (`ClientsManagementPage`), `server/src/controllers/workshopController.js`, tablas `customers` y `workshops`.

La sección Clientes permite consultar y registrar clientes para administrador y recepción. El taller activo es obligatorio y se valida de nuevo en el servidor.

**Comprobación:** un usuario permitido puede consultar y registrar un cliente vinculado a taller; una petición sin taller devuelve 400 y una petición de técnico/cliente devuelve 403.

## Etapa 21 — Validaciones Regex

**Archivos:** `src/validators.js`, `server/src/validators/input.js`, formularios React.

Comprueba nombres, apellidos, usuario, correo, rol, contraseña, confirmación y longitudes. Las validaciones se repiten en servidor.

**Comprobación:** formulario muestra el campo inválido; enviar directo por HTTP los mismos datos recibe 400 con detalles JSON.

## Etapa 22 — Logs

**Archivos:** `server/src/utils/logger.js`, `server/src/middleware/errorHandler.js`, `server/src/index.js`.

Cada línea es JSON con hora, nivel, módulo, endpoint, método, requestId, usuario si existe y stack solo técnico. No se serializa body ni secreto.

```powershell
Get-Content server/logs/application.log -Tail 10
```

**Resultado/comprobación:** al provocar una credencial inválida o una ruta desconocida hay una línea nueva y no contiene contraseña, hash ni token.

## Etapa 23 — Pruebas

**Archivo:** `server/test/core.test.js`.

```powershell
pnpm test
pnpm build
```

**Resultado/comprobación:** pruebas de UUID, hash, factory, validaciones, permiso admin y hash de token pasan; Vite genera `dist/`. E2E del API requieren Docker activo y se detallan en README.

## Etapa 24 — Corrección de errores

**Archivos:** `server/src/middleware/errorHandler.js`, `src/adapters/httpAdapter.js`, `src/components/Brand.jsx`.

Los errores técnicos se traducen a mensajes simples y folios; los detalles de validación se muestran junto a cada campo.

**Comprobación:** prueba un endpoint con JSON inválido, duplicado, sin token y con token sin privilegios. Espera 400, 409, 401 y 403 respectivamente; revisa el log por folio.

## Etapa 25 — Puesta en funcionamiento

**Archivos:** `.env`, `package.json`, `README.md`.

```powershell
pnpm dev
```

**Resultado/comprobación:** MySQL está healthy, health API conecta y la pantalla inicial muestra Login. Si aún no existe una cuenta administrador, abre `http://localhost:5173/?view=setup`, crea la cuenta inicial y vuelve a Login. Antes de producción configura email de recuperación, HTTPS, CSP y límites de intentos.

## Etapas 26 a 31 — Taller, clientes y seguimiento vehicular

### Etapa 26 — Catálogo de estados compartido

**Archivos:** `server/sql/migrations/001_workshops_customers_status.sql`, `server/sql/migrations/002_normalize_user_status.sql`, `server/src/constants/statuses.js`.

Las migraciones crean `statuses` con Activo, Inactivo y Eliminado UUIDv7, y cambian `users.status_id` a FK. Las bajas son lógicas y conservan historial.

**Comprueba:** en MySQL ejecuta `SELECT status_key,status_name FROM statuses ORDER BY status_key;` y confirma tres filas. `SHOW COLUMNS FROM users LIKE 'status_id';` debe mostrar `char(36)` y no `AUTO_INCREMENT`.

### Etapa 27 — Alta de taller

**Archivos:** `src/pages/WorkshopPages.jsx`, `src/services/adminService.js`, `src/facades/BauMarFacade.js`, `server/src/controllers/workshopController.js`, `server/src/validators/workshopInput.js`, `server/sql/schema.sql`.

Completa nombre, RFC, Gmail, foto, domicilio completo y código postal. La foto JPG/PNG/WebP se valida y se guarda en almacenamiento temporal privado al seleccionarla; al guardar el taller el backend mueve la imagen validada y persiste el registro. El límite es 5 MB por defecto (`MAX_WORKSHOP_IMAGE_MB`), se comprueba la firma real y RFC/nombre normalizado son únicos. Enter en C.P., estado, municipio o colonia consulta SEPOMEX; al elegir una coincidencia se llenan los datos postales. No hay botones de búsqueda.

**Comprueba:** con un administrador crea un taller válido y verifica que aparece en la lista con imagen y visita inicial cero; intenta repetir RFC/nombre y sube un archivo no imagen o mayor a 5 MB. Los duplicados y archivos inválidos deben rechazarse. La carga de imagen y el guardado del taller se comprobaron por API y MySQL.

### Etapa 28 — Clientes ligados a taller

**Archivos:** `src/pages/WorkshopPages.jsx`, `server/src/routes/adminRoutes.js`, `server/src/controllers/workshopController.js`, `server/src/validators/workshopInput.js`.

Recepción y administración pueden registrar nombre, teléfono, dirección y correo solo después de elegir un taller activo. La relación es `customers.workshop_id`; MySQL no acepta `NULL` y el servidor confirma que el taller existe y está activo.

**Comprueba:** con administrador y recepcionista crea un cliente válido. Se verificó que queda persistido y ligado al taller seleccionado. Sin taller o con un técnico/cliente autenticado, intenta POST manual a `/api/admin/clients`; espera 400/403 según el caso. La UI muestra “primero registra un taller” cuando no hay uno activo.

### Etapa 29 — Visitas a taller

**Archivos:** `workshops`, `workshop_visits`, `server/src/controllers/workshopController.js`, `src/pages/WorkshopPages.jsx`.

Cada visita recibe UUIDv7, fecha, taller, cliente y usuario que la registró. El contador del administrador se calcula desde las filas de visitas.

**Comprueba:** registra una visita y confirma que `visit_count` aumenta solo para el taller correspondiente.

### Etapa 30 — Seguimiento de vehículos

**Archivos:** `vehicles`, `vehicle_status_updates`, `src/pages/WorkshopPages.jsx`, `server/src/routes/customerRoutes.js`.

Al dar de alta automóvil, se crea el estado diagnóstico inicial. Técnico o administrador registra avances y el cliente consulta únicamente los vehículos vinculados a su cuenta, junto con qué se detectó y qué trabajo falta.

**Comprueba:** `GET /api/customer/vehicles` usa el UUID de la sesión en el filtro SQL. Un cliente no ve automóviles de otra cuenta. El historial de talleres por usuario no está habilitado todavía.

### Etapa 31 — Diagramas Archify y memoria técnica

**Archivos:** ``, ``, ``.

Archify está instalado como skill global en `C:\Users\esmer\.codex\skills\archify`. Cada flujo de acceso, roles, talleres, clientes/visitas, vehículos y logs tiene fuente JSON y una exportación HTML interactiva con recibos de `validate`, `deliver`, `check` y `browser-check`.

**Comprueba:** abre cada `*-final*.html` de `` localmente; confirma que el visor admite tema y zoom. La guía DOCX se revisó en PDF renderizado; contiene seguridad, arquitectura, roles, instalación y comprobaciones.

## Bitácora de esta actualización

**Navegación:** Inicio permanece como panel mostrado después del login, pero se quitó del menú. Se retiraron de la barra lateral los enlaces de Administración de roles y Estado de vehículos. Las asignaciones siguen disponibles desde el botón de Roles y el backend permite esa operación únicamente al administrador.

**Guardado:** la imagen del taller se carga inmediatamente en una carpeta temporal privada, asociada a la sesión administrativa mediante un token firmado. Guardar el taller enlaza la imagen y los datos en MySQL; si falla la escritura de la fila, la imagen temporal se conserva para reintentar. La búsqueda postal responde con Enter y admite C.P., estado, municipio o colonia.

**Persistencia verificada:** mediante las APIs autenticadas se crearon temporalmente un usuario, un rol, un taller con imagen y un cliente ligado al taller; se verificó cada registro en las listas de MySQL, incluida una edición del usuario. Después se limpiaron los registros y archivos de prueba. Las validaciones de nombre y dirección admiten acentos y caracteres comunes de RFC y domicilio.

**Datos de cuentas:** los nombres que antes tenían el prefijo “Demo” se cambiaron por nombres de muestra de formato realista. Deben sustituirse por los datos confirmados del personal de BauMar.

## Etapa 32 — Corrección del formulario de talleres y guía de recuperación

**Archivos:** `src/pages/WorkshopPages.jsx`, `src/pages/AuthPages.jsx`, `server/src/controllers/authController.js`.

Al investigar por qué el taller no se guardaba, se encontró que el formulario visible no renderizaba los campos obligatorios **Nombre del taller** ni **RFC**, aunque el estado, la validación y el API sí los requerían. Se añadieron al formulario; el RFC acepta minúsculas mientras se escribe y se normaliza a mayúsculas antes de persistir. Tras un POST exitoso, la pantalla vuelve a consultar el listado para que la nueva tarjeta aparezca.

**Recuperación local:** desde Login selecciona “¿Olvidaste tu contraseña?” y usa **Generar enlace local** con el correo, teléfono o nombre de usuario exactos de una cuenta activa. En desarrollo la pantalla indica que no envía correo. Si la cuenta existe, aparece un enlace/botón para abrir el formulario de nueva contraseña; si no, explica que se verifique el dato registrado. El nombre de usuario se acepta únicamente fuera de producción cuando `RESET_TOKEN_EXPOSE_IN_DEVELOPMENT=true`. El enlace es de un solo uso y vence. En producción el token no se expone en la respuesta: la integración de correo debe entregar el enlace al usuario.

**Comprueba:** registra un taller con nombre, RFC, Gmail, foto JPG/PNG/WebP y domicilio válidos; después confirma que aparece en la cuadrícula sin recargar manualmente. El endpoint local se probó con un usuario sintético inexistente: mostró una indicación clara y no emitió token. Para completar el restablecimiento, usa una cuenta de prueba activa; abrir el enlace permite actualizar la contraseña y volver a Login. No se cambió la contraseña de ninguna cuenta durante esta revisión.

## Etapa 33 — Corrección de codificación y acentos (UTF-8 / Mojibake)

**Archivos:** `server/sql/schema.sql`, `server/sql/migrations/001_workshops_customers_status.sql`, `server/sql/migrations/002_normalize_user_status.sql`, `server/sql/migrations/003_add_user_phone_number.sql`, `server/sql/migrations/004_fix_roles_encoding.sql`.

Al revisar la muestra de datos en la interfaz (pantalla de Roles, directorio de Usuarios y módulo de Asignaciones), se detectó que los acentos y caracteres especiales del idioma español se mostraban con caracteres incorrectos (mojibake). Ejemplos: `Administrador / dueÃ±o`, `AtenciÃ³n y recepciÃ³n de vehÃ­culos.`, `TÃ©cnico`, `Realiza diagnÃ³stico y reparaciÃ³n.`.

**Causa raíz:** la base de datos MySQL y la aplicación Node.js utilizan `utf8mb4` en sus tablas y en el pool de conexión (`mysql2/promise`). Sin embargo, durante la inicialización o ejecución de los scripts SQL iniciales por CLI sin directivas explícitas de cliente, el cliente MySQL interpretó los caracteres UTF-8 como ISO-8859-1 (Latin1) y los re-codificó como UTF-8 al insertarlos en la tabla `roles`, generando doble codificación.

**Cambios implementados:**
1. **Blindaje de scripts SQL:** se agregaron las directivas `SET NAMES utf8mb4;` y `SET CHARACTER SET utf8mb4;` al inicio de `server/sql/schema.sql` y de todas las migraciones SQL (`001`, `002`, `003`). Esto garantiza que cualquier cliente CLI o contenedor Docker ejecute los esquemas interpretando los caracteres en UTF-8 nativo independientemente del locale del sistema operativo anfitrión.
2. **Migración versionada `004_fix_roles_encoding.sql`:** se creó un script SQL que actualiza de forma idempotente todos los nombres y descripciones del catálogo de roles con su ortografía y acentuación en español correcta (`Administrador / dueño`, `Recepcionista`, `Atención y recepción de vehículos.`, `Asesor de servicio`, `Técnico`, `Realiza diagnóstico y reparación.`, `Cliente`, `Sistema`).
3. **Corrección de la base de datos activa:** se aplicó la actualización directamente en la base de datos activa en ejecución.
4. **Verificación integral:** se ejecutó un escaneo automatizado en todas las tablas y columnas de MySQL (`roles`, `users`, `statuses`, `workshops`, `customers`, `vehicles`, `workshop_visits`, perfiles). No quedó ninguna secuencia de mojibake (`Ã`, `Â` o `\uFFFD`).

**Comprueba:**
- Abre la vista de **Roles** en `http://localhost:5173/` y comprueba que las tarjetas muestran claramente "Administrador / dueño", "Recepcionista", "Atención y recepción de vehículos.", "Técnico" y "Realiza diagnóstico y reparación.".
- Abre **Usuarios** y revisa la columna *Roles*: los roles agregados (`Administrador / dueño`, `Técnico`, etc.) se visualizan correctamente con acentos y virgulillas legibles.
- En **Administración de roles**, los menús desplegables y las etiquetas de la tabla muestran la acentuación limpia.
- `pnpm test` ejecuta y pasa las 14 pruebas unitarias.

## Etapa 34 — Visualización transversal de información y control de modificaciones por rol

**Archivos:** `src/main.jsx`, `src/pages/WorkshopPages.jsx`, `src/pages/AdminPages.jsx`, `server/src/routes/adminRoutes.js`, `package.json`.

Cada rol dispone de funciones operativas específicas, pero anteriormente las secciones completas estaban ocultas en el menú lateral o bloqueadas en los componentes para los roles sin permisos de escritura. Se adaptó la navegación y las vistas para que cualquier rol autenticado pueda **visualizar la información** de las distintas áreas del taller en modo de lectura, reservando la creación, edición y cambios de estado estrictamente al personal autorizado.

**Matriz de permisos y modo consulta:**
1. **Usuarios (`/users`):**
   - *Administrador:* crea usuarios, edita cuentas y modifica estados (activo/inactivo/eliminado).
   - *Demás roles:* visualizan el directorio de personas, usuarios, roles asignados y estatus. No disponen de botones de edición, creación ni cambio de estado. Se muestra el aviso explicativo de modo de consulta.
2. **Roles (`/roles`):**
   - *Administrador:* crea roles en el catálogo y accede a la administración de asignaciones.
   - *Demás roles:* visualizan las tarjetas de roles del sistema y personalizados, sus descripciones y el número de usuarios asignados. No se muestra el formulario de creación ni el botón de asignaciones.
3. **Talleres (`/workshops`):**
   - *Administrador:* crea talleres, sube fotografías y modifica el estado del taller.
   - *Recepción:* registra visitas de clientes en talleres activos.
   - *Demás roles (técnicos, asesores, clientes):* visualizan las tarjetas con foto, RFC, dirección completa, correo y contador de visitas. No pueden crear sedes, alterar estados ni registrar visitas.
4. **Clientes (`/clients`):**
   - *Administración y recepción:* registran nuevos clientes asociados a un taller activo.
   - *Demás roles:* visualizan el directorio de clientes, datos de contacto, dirección, taller vinculado y estatus de cuenta portal. El botón `＋ Nuevo cliente` y el formulario no se renderizan.
5. **Estado de vehículos (`/vehicles`):**
   - *Fuera del catálogo del menú:* de acuerdo con los requerimientos de estructura, "Estado de vehículos" no forma parte del catálogo de entidades principales del menú lateral y se retiró de `visibleSections` en la barra de navegación para conservar el menú exclusivamente con los catálogos del taller (`Usuarios`, `Clientes`, `Taller mecánico`, `Roles`).
   - La API y la estrategia de vista permanecen disponibles y blindadas con autorización por rol (`administrator` / `technician` para actualización, y sesiones autorizadas para consulta).

**Blindaje del Backend:**
- Se liberaron las rutas `GET /api/admin/workshops`, `GET /api/admin/clients` y `GET /api/admin/vehicles` para cualquier sesión autenticada con token JWT válido.
- Las rutas de mutación (`POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/roles`, `POST /api/admin/workshops`, `PATCH /api/admin/workshops/:id/status`, `POST /api/admin/clients`, `POST /api/admin/visits`, `POST /api/admin/vehicles`, `POST /api/admin/vehicles/:id/status`) mantienen sus middlewares de verificación de rol (`requireAdministrator` o `requireAnyRole`), respondiendo con `403 Forbidden` a cualquier solicitud no autorizada.

**Comprobación:**
- Inicia sesión con distintas cuentas (`abel` — administrador; `maria.lopez` — recepcionista; `miguel.torres` — técnico; `jose.hernandez` — asesor de servicio; `ais.seg` — cliente).
- Confirma que la barra lateral muestra los catálogos (`Usuarios`, `Clientes`, `Taller mecánico`, `Roles`) y que **no** se incluye `Estado de vehículos` en la lista del menú.
- Confirma que los botones de acción (`＋ Nuevo usuario`, `＋ Nuevo taller`, `＋ Nuevo cliente`, selectores de estatus) solo aparecen en las cuentas con permisos respectivos.
- La suite de pruebas de autorización y lógica unitaria pasa todas las pruebas (`pnpm test`: 14 pass, 0 fail).
- La compilación del frontend (`pnpm build`) se ejecuta sin advertencias ni errores.

## Etapa 35 — Reubicación de la relación cliente-taller y enriquecimiento de la visualización en sedes de taller

**Archivos:** `server/src/controllers/workshopController.js`, `server/src/routes/adminRoutes.js`, `src/services/adminService.js`, `src/facades/BauMarFacade.js`, `src/pages/WorkshopPages.jsx`, `src/styles.css`.

Se ajustó la arquitectura funcional del sistema para que la acción de **relacionar a un cliente con un taller** se realice desde el módulo de **Clientes**, y la sección de **Taller mecánico** se dedique a la **visualización** completa de las sedes, los clientes vinculados y el historial de visitas recibidas.

**Cambios implementados:**
1. **Relación con taller desde el módulo de Clientes (`ClientsManagementPage`):**
   - Se incorporó en la tabla de clientes la columna de **Acciones** para recepción y administración con el botón `＋ Registrar visita`.
   - Al pulsar la acción, se abre un panel enfocado en el cliente seleccionado que permite registrar su ingreso a cualquiera de las sedes activas de BauMar, especificando datos del vehículo atendido y motivo/nota del servicio.
   - Al guardar, la visita se persiste en `workshop_visits` y actualiza inmediatamente las estadísticas de la sede y del cliente.
   - El formulario de `＋ Nuevo cliente` continúa relacionando al nuevo cliente con su sede asociada inicial.
2. **Visualización integral en la vista de Taller (`WorkshopsPage`):**
   - Se removió de las tarjetas de taller el botón y formulario de registro de visitas (`＋ Registrar visita`), eliminando la sobrecarga operativa en esta sección.
   - Se incorporó el panel de **Visualización de relaciones de taller**:
     - Contadores consolidados: número de clientes vinculados a la sede y total de visitas registradas.
     - Lista de **Clientes asociados**: relación directa de clientes asignados a la sede con nombre, teléfono, correo y distintivo de cuenta portal.
     - Historial desplegable de **Visitas registradas**: tabla con fecha de atención, cliente recibido, descripción del vehículo y motivo del ingreso.
3. **Soporte en Backend y Fachada (`BauMarFacade`):**
   - Se habilitó la ruta `GET /api/admin/visits` en `server/src/routes/adminRoutes.js` y el controlador `listWorkshopVisits` para alimentar la visualización de visitas de cada sede.
   - Se adaptó `recordWorkshopVisit` para admitir el registro de visitas de clientes activos en cualquier sede activa de la red BauMar.
   - Se añadieron `visits()` en `adminService.js` y `BauMarFacade.js`.

**Comprueba:**
- Abre **Clientes** como recepcionista (`maria.lopez`) o administrador (`abel`) y selecciona `＋ Registrar visita` en cualquier fila de cliente; completa los datos y confirma que se registra.
- Abre **Taller mecánico** y comprueba que la tarjeta de la sede muestra la lista de **Clientes asociados** y el botón para desplegar las **Visitas registradas** con fecha, cliente y vehículo.
- Inicia sesión con roles no operativos (técnicos, clientes, asesores) y comprueba que pueden consultar la información en modo de lectura sin botones de acción.
- Ejecuta `pnpm test`: las 14 pruebas unitarias pasan exitosamente (`14 pass, 0 fail`).
- Compila con `pnpm build`: el paquete se genera sin errores.

## Etapa 36 — Checklist de accesos, barra de navegación reestructurada, registro detallado y administración de clientes con paginación, y control de estatus de roles en base de datos

**Archivos:** `server/sql/migrations/005_customers_and_roles_status.sql`, `server/src/constants/statuses.js`, `server/src/models/roleModel.js`, `server/src/services/roleService.js`, `server/src/controllers/adminController.js`, `server/src/controllers/workshopController.js`, `server/src/validators/workshopInput.js`, `server/src/routes/adminRoutes.js`, `src/services/adminService.js`, `src/facades/BauMarFacade.js`, `src/main.jsx`, `src/pages/AuthPages.jsx`, `src/pages/AdminPages.jsx`, `src/pages/WorkshopPages.jsx`, `src/styles.css`.

Se completó integralmente el checklist de requerimientos solicitado por el usuario:

1. **Checklist de Autenticación (`AuthPages.jsx`):**
   - **Login:** Formulario principal de ingreso por usuario o correo electrónico con validación de credenciales y protección PBKDF2-SHA512.
   - **Recuperar contraseña:** Solicitud de restablecimiento por correo, teléfono o usuario, generación de enlace seguro con token SHA-512 y formulario de asignación de nueva contraseña.
   - **Registrarse:** Registro de nuevas cuentas con validación de nombre, apellidos, usuario, correo, teléfono y confirmación de contraseña.

2. **Reestructuración de la Barra de Navegación Lateral (`src/main.jsx`):**
   - **Crear roles (`roles`):** Acceso al catálogo de perfiles de acceso y formulario para dar de alta nuevos roles.
   - **Administración de roles (`assignments`):** Pantalla administrativa para asignar y revocar roles, editar el nombre de roles personalizados y cambiar su estatus a Activo o Suspendido guardado en base de datos.
   - **Registrar cliente (`registerClient`):** Pantalla dedicada con formulario completo de alta para clientes del taller.
   - **Administración de clientes (`clients`):** Directorio paginado en frontend y backend con edición de datos y control de estatus.
   - **Taller mecánico (`workshops`):** Visualización de sedes, clientes asociados e historial de visitas.
   - **Usuarios (`users`):** Gestión y directorio del equipo de trabajo.
   - **Asociar vehículo:** Se mantuvo fuera de la barra de navegación conforme a la indicación del usuario (*"esto no se hace aun"*).

3. **Gestión y Estatus de Roles en Base de Datos:**
   - Se añadió el estado `'suspended'` al catálogo de base de datos (`statuses`) y la columna `status_id` con llave foránea en la tabla `roles`.
   - **Roles del sistema protegidos:** Los roles predefinidos (`administrator`, `receptionist`, `service_advisor`, `technician`, `customer`, `system`) no pueden ser renombrados ni suspendidos; el backend rechaza cualquier intento con error `400`.
   - **Roles personalizados:** El administrador puede actualizar su nombre (`PATCH /api/admin/roles/:roleId`) y conmutar su estado entre `Activo` y `Suspendido` en base de datos (`PATCH /api/admin/roles/:roleId/status`).

4. **Pantalla "Registrar cliente" (`RegisterClientPage`):**
   - **Campos capturados y persistidos en base de datos:**
     - Nombre (`firstName`), Apellidos (`lastName`), Correo electrónico (`email`).
     - Teléfono personal (`personalPhone`) y Teléfono de trabajo (`workPhone`).
     - Contacto alternativo: Nombre completo de la persona de contacto alternativo (`alternativeContactName`) y Teléfono de contacto alternativo (`alternativeContactPhone`).
     - Domicilio detallado: Calle (`street`), Número exterior/interior (`streetNumber`), Colonia (`neighborhood`), Código postal (`postalCode` con integración SEPOMEX), Municipio/Alcaldía (`municipality`) y Estado (`state`).
     - Sede asociada: Selector de taller mecánico activo (`workshopId`).
   - **Validación contra datos repetidos:** El backend verifica unicidad estricta de correo y teléfonos personales; si ya existen, responde con error `409 Conflict` y la interfaz despliega una alerta visual destacada notificando el conflicto al usuario.
   - **Notificación:** Al concluir el registro exitoso, se notifica claramente al usuario lo realizado (`Cliente "Nombre Apellido" registrado exitosamente y asociado al taller "Nombre Taller"`).

5. **Pantalla "Administración de clientes" (`ClientsManagementPage`):**
   - **Paginación integral Frontend y Backend:** Consulta SQL con `COUNT(*)`, `LIMIT` y `OFFSET`. Controles visuales con botones `« Anterior`, `Siguiente »`, selector de tamaño de página (5, 10, 25, 50), contador de registros y buscador en tiempo real por nombre, correo, teléfono o taller.
   - **Actualización de datos:** Panel modal para editar la totalidad de los datos del cliente (identificación, teléfonos, contacto alternativo, dirección completa y sede de taller).
   - **Control de estatus (Activo / Suspendido):** Exclusivo para administradores. Se conmuta el estatus en base de datos (`PATCH /api/admin/clients/:customerId/status`).
   - **Prohibición de eliminación física:** Ningún cliente puede ser eliminado físicamente de la base de datos (`no DELETE`), garantizando la preservación histórica y la integridad referencial.

**Comprobación:**
- Ejecutar `pnpm test`: Las 14 pruebas unitarias del backend pasan al 100%.
- Ejecutar `pnpm build`: El paquete Vite compila de forma exitosa sin errores de módulos.
- Acceder a la barra de navegación lateral y verificar los ítems: `Crear roles`, `Administración de roles`, `Registrar cliente`, `Administración de clientes`, `Taller mecánico`, `Usuarios`.
- Realizar pruebas de registro con datos repetidos y verificar que se emita la alerta correspondiente.
- Cambiar estatus de roles y clientes en administración y verificar que se refleje de inmediato en la base de datos y la interfaz.

## Etapa 37 — Registro de automóviles, administración de flotilla y asociación a clientes

**Archivos:** `src/pages/VehiclePages.jsx`, `src/pages/WorkshopPages.jsx`, `src/main.jsx`, `src/services/adminService.js`, `src/facades/BauMarFacade.js`, `server/src/routes/adminRoutes.js`, `server/src/controllers/workshopController.js`, `server/src/validators/workshopInput.js`, `server/src/config.js`, `server/src/index.js`, `server/sql/migrations/006_vehicle_registry.sql`, `server/sql/schema.sql`, `server/test/core.test.js`.

Se separó el registro del automóvil de la asignación del cliente. Así el personal puede capturar primero una unidad para su taller y después relacionarla desde Administración de clientes.

1. **Registro de auto:** el formulario incluye VIN de 17 caracteres, placa normalizada (solo mayúsculas y números), marca, modelo, año, versión, color, kilometraje opcional y varias fotos. Solo acepta JPEG/PNG/WebP de hasta 15 MiB por archivo. Las imágenes se cargan automáticamente con una credencial temporal ligada al usuario y se relacionan con el registro al guardar.
2. **Administración de vehículo:** nueva sección lateral con inventario, VIN/placa, taller, cliente si existe, conteo de fotos, edición de los datos del vehículo y activación/desactivación lógica. No contiene control para cambiar cliente.
3. **Asociación desde clientes:** el directorio presenta `Asociar auto` para clientes activos a Administración/recepción. Se ofrecen vehículos activos sin propietario del mismo taller. El backend repite las comprobaciones con transacción y bloqueo de filas; el endpoint rechaza roles distintos de administración y recepción.
4. **No duplicidad:** correo de cliente, VIN y placa tienen índices `UNIQUE` globales. El backend normaliza VIN/placa y MySQL protege contra solicitudes simultáneas duplicadas. Si ya hay colisiones históricas, deben resolverse conservando los registros antes de aplicar la restricción.
5. **Preparación para técnico:** `vehicles.assigned_technician_user_id` es nullable y tiene FK UUIDv7 a usuarios. Todavía no se asignan técnicos; el módulo futuro debe comprobar que la cuenta tenga rol `technician` en backend.
6. **Datos y fotos:** las fotos se almacenan en `server/uploads/vehicles/`; `vehicle_photos` persiste UUIDv7, ruta, MIME, tamaño y usuario creador. El JSON de Express admite 22 MiB para soportar Base64 del límite de imagen. La API registra errores con folio sin guardar imágenes o secretos en el log.

**MySQL preservando datos:** una instalación nueva usa `server/sql/schema.sql`, que ya incluye el esquema actualizado y no requiere correr la migración 006. En una instalación existente que ya completó las migraciones 001–005, antes de aplicar la 006 verifica colisiones con las consultas comentadas al inicio de `server/sql/migrations/006_vehicle_registry.sql`. Resuelve los casos manualmente y respalda el volumen. Copia/aplica la migración una sola vez:

```powershell
docker cp .\server\sql\migrations\006_vehicle_registry.sql baumar_mysql:/tmp/006_vehicle_registry.sql
docker exec -it baumar_mysql mysql -u root -p baumar
```

En la consola de MySQL ejecuta `SOURCE /tmp/006_vehicle_registry.sql;` y valida con `SHOW COLUMNS FROM vehicles;`, `SHOW INDEX FROM vehicles;` y `SHOW TABLES LIKE 'vehicle_photos';`. La migración permite `customer_id` nulo para unidades aún sin cliente, crea estatus activo para filas existentes y no reinicia el volumen.

**Cómo comprobar:** con Docker/MySQL arriba, inicia API/React (`pnpm dev`), accede como administrador o recepcionista, registra un automóvil con fotos y verifica que aparece en Administración de vehículo sin cliente. En Administración de clientes, vincúlalo a un cliente activo del mismo taller y comprueba el resultado en ambos módulos. Repite con placa/VIN duplicados, foto no permitida, imagen mayor a 15 MiB, cliente inactivo, cliente de otro taller y usuario técnico: cada caso debe rechazarse y los errores de servidor deben dejar folio/log.

**Estado de validación de esta entrega (actualizado 2026-10-21):** Docker Desktop está activo y `baumar_mysql` reportó `healthy`. Se inspeccionaron los posibles duplicados de placas y correos antes de migrar; no había colisiones. La migración 006 se aplicó al volumen existente sin borrar registros. El primer intento detectó que los índices compuestos también daban soporte a las llaves foráneas de taller; el script se ajustó para agregar índices de soporte antes de reemplazar los índices únicos, y se hizo reanudable ante fallos DDL parciales. El esquema final contiene `vin`, versión, color, kilometraje, estatus, asignación futura de técnico, placas y VIN únicos, correo de cliente único global, y `vehicle_photos`. Se conservaron los conteos existentes: 7 usuarios, 1 cliente y 0 vehículos. La API respondió `HTTP 200` en `/api/health` con `database: connected`; React respondió `HTTP 200` en `/`. La suite pasó 13/13 pruebas y `vite build` terminó; Vite reporta que el bundle JS supera 500 kB sin minificar.

**Diagrama de la fase:** `` y su HTML ``. Archify validó el JSON y sus controles de composición; se generó el HTML. La publicación de los recibos completos de `finalize` quedó bloqueada por un journal de recuperación de la versión Archify del usuario en OneDrive. Se preservaron los archivos de recuperación y no se afirma una comprobación browser/provenance completa. La carpeta de proyecto tampoco contiene `.git`, así que el diagrama no inventa metadatos de revisión.

**Memoria de mejoras futuras:** se añadieron ``, `` y ``; el `../Spec/agentes/AGENTS.md` raíz los referencia. Documentan el flujo de análisis, arquitectura, restricciones de datos, pruebas y sincronización de documentación para las siguientes etapas.

## Etapa 38 — Agente de mapas para localizar sedes existentes

Se agregó **Agente de mapas** a la barra lateral. El agente reutiliza `bauMar.workshops()` y el contrato existente de talleres; filtra únicamente sedes activas, buscando por nombre o cualquier parte del domicilio guardado. Al seleccionar una sede, ofrece acciones para ver la ubicación y trazar una ruta; si no hay coincidencia local, puede buscar el texto libre en Google Maps. Las URL oficiales de Maps llevan `api=1`, codifican el destino y no necesitan API key. La navegación abre fuera del sistema, en Google Maps. No se agregaron coordenadas, migraciones ni paquetes, porque el esquema actual solo guarda direcciones y el catálogo SEPOMEX completa CP/municipio/estado/colonia; no existe proveedor de geocodificación ni credencial de mapas. El agente es determinista y responde con los talleres que el usuario tiene autorizados para consultar.

**Archivos:** `src/agents/WorkshopMapAgent.js`, `src/pages/MapAgentPage.jsx`, `src/main.jsx`, `src/styles.css`, `server/test/core.test.js`, `README.md`.

**Comprobación:** en **Agente de mapas**, busca una calle, colonia, CP, municipio o estado; selecciona una sede y abre su mapa o ruta. Una consulta sin coincidencia debe ofrecer la búsqueda externa. Las pruebas cubren búsqueda acentuada, exclusión de talleres inactivos, destino codificado y fallback a Google Maps. Comandos: `pnpm test` y `pnpm build`.

## Etapa 39 — Compose independiente y Analista de rendimiento

### Corrección del arranque de MySQL

El error de Docker Desktop mostraba un montaje desde `New project/server/sql/schema.sql`, ruta que quedó fuera de BauMar al separarlo. La configuración propia [`compose.yaml`](../compose.yaml) usa `./server/sql/schema.sql`, que se resuelve dentro de la carpeta BauMar. Se reemplazó únicamente el contenedor fallido de BauMar con el mismo nombre `baumar_mysql`; el volumen externo `newproject_baumar_mysql_data` se conservó. No se modificó el Compose de la carpeta padre ni se borró o reinicializó el volumen.

Antes de iniciar, copia `.env.example` a `.env` en `BauMar/`, coloca las credenciales previamente usadas para el volumen (no inventes una contraseña nueva para una base ya inicializada) y asigna un `JWT_SECRET` de 32 caracteres o más. Después:

```powershell
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
Invoke-RestMethod http://localhost:8080/api/health
```

El Compose publica la interfaz en el puerto 8080 y MySQL en 3307; puedes conectarte desde Workbench con `127.0.0.1:3307`. El esquema solo es ejecutado por la imagen MySQL cuando el volumen está vacío; el volumen existente y las seis migraciones no se alteran. Se comprobó MySQL `healthy`, la ruta corregida dentro de `BauMar/` y los conteos conservados (7 usuarios, 1 cliente, 0 vehículos, 1 taller). Si falta `.env` o las credenciales no coinciden, Compose/API no podrá completar el arranque. Nunca ejecutes `docker compose down -v`.

### Analista de rendimiento del sistema

Se añadió un agente técnico, separado del contenido de clientes, autos, reparaciones y talleres. La API agrupa solicitudes por plantilla de endpoint e informa promedio, P95, máximo, errores 5xx y formas de consulta SQL por huella SHA-256 sin literales. React mide la carga inicial y sus transiciones de vista. El agente también informa uptime, memoria residente/heap, uso acumulado de CPU y recomendaciones por umbrales.

El reporte `/api/admin/performance` y el registro `/api/admin/performance/pages` requieren rol administrador en el middleware Express; el menú solo se muestra a administradores, pero la interfaz no sustituye el control del servidor. El reporte está en la sección **Analista de rendimiento**. Se limita el número de grupos y muestras, no registra cuerpos, parámetros, contraseñas ni filas SQL, y mantiene métricas en memoria: se reinician al reiniciar Express. Las muestras de pantallas se recogen en las sesiones administrativas.

**Archivos:** `compose.yaml`, `.env.example`, `package.json`, `server/src/agents/PerformanceAnalystAgent.js`, `server/src/db.js`, `server/src/index.js`, `server/src/routes/adminRoutes.js`, `server/src/controllers/adminController.js`, `src/agents/BrowserPerformanceAnalystAgent.js`, `src/pages/PerformancePage.jsx`, `src/main.jsx`, servicios/facade, estilos, `server/test/core.test.js`, README y `Spec/`.

**Comprobación:** validar configuración con `docker compose -f compose.yaml config --quiet`; ejecutar `pnpm test` y `pnpm build`; con Docker activo y `.env` correcto, revisar `docker compose ps`, `/api/health`, la sección del analista como administrador y la respuesta `403` al endpoint con una cuenta sin privilegios. En un volumen ya inicializado, confirma que el conteo de datos se conserva antes y después.

