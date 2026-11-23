# BauMar

Sistema de taller automotriz con React 18 + Vite 6, Node.js + Express 4 y MySQL. Esta carpeta es la raíz independiente de BauMar; las carpetas vecinas de otros proyectos no forman parte de su ejecución.

## Desarrollo local

Requisitos: Node.js 20 o posterior, pnpm 11.25.0 y Docker Desktop. Desde `BauMar/`:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Completa `.env` con los valores de conexión existentes, las contraseñas ya usadas por el volumen de BauMar y un `JWT_SECRET` aleatorio de al menos 32 caracteres. No reutilices el Compose de la carpeta padre: pertenece a otro proyecto. BauMar incluye su propio `compose.yaml`, que monta el esquema desde `BauMar/server/sql/schema.sql` y referencia el volumen persistente existente `newproject_baumar_mysql_data`.

Inicia MySQL, Express y la interfaz Dockerizada:

```powershell
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
```

La interfaz se publica en `http://localhost:8080`; Workbench usa host `127.0.0.1`, puerto `3307` (configurable con `MYSQL_EXPOSED_PORT`). El esquema SQL se monta como archivo de inicialización y MySQL solo lo ejecuta al inicializar un volumen vacío; nunca borres el volumen existente. Comprueba `/api/health` antes de probar operaciones.

Para desarrollo directo fuera de Docker, configura `.env` apuntando a una instancia MySQL disponible y ejecuta:

```powershell
pnpm dev
```

Vite sirve React en `http://localhost:5173` y reenvía `/api` a Express en `http://localhost:4000`. La raíz `index.html` monta `src/main.jsx` dentro de `#root`. Express necesita MySQL para autenticación, lecturas y escrituras; `/api/health` informa el estado de esa conexión.

## Verificación

```powershell
pnpm test
pnpm build
```

El backend usa `server/sql/schema.sql` como esquema actual. `server/sql/migrations/001` a `006` son cambios secuenciales para instalaciones previas; no deben ejecutarse sobre el esquema actual ni repetirse sin comprobar el estado de la base. En esta etapa se conservaron sus contenidos y no se aplicaron a ninguna base de datos.

Las cargas locales viven en `server/uploads/` y los logs en `server/logs/`; ambos directorios se excluyen de Git y Docker. Para producción se deberá configurar almacenamiento persistente para fotos.
