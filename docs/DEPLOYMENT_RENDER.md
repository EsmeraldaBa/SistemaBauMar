# Despliegue BauMar en Render + TiDB

## Arquitectura detectada

- Frontend React 18 + Vite 6, servido como Static Site (Node 22.22.0 para build).
- API Node.js 22 + Express 4, imagen Docker en `deploy/backend/Dockerfile`.
- Persistencia MySQL compatible mediante `mysql2`; TiDB Cloud requiere TLS.
- Docker local está definido en `compose.yaml`. No existe Spring Boot, Maven ni Gradle en BauMar.

## Base de datos y migraciones

`server/sql/schema.sql` es el esquema completo e idempotente para una instalación nueva. En Render, el API ejecuta este esquema al arrancar, crea `DB_NAME` si falta y conserva tablas/datos existentes. El usuario TiDB configurado debe tener permiso `CREATE DATABASE` la primera vez. La conexión usa TLS con verificación del certificado/hostname, pool reducido y zona horaria UTC.

Las migraciones `001` a `006` se conservan sin editar. Son pasos de actualización para instalaciones antiguas y **no deben ejecutarse sobre una base vacía**: dependen de tablas creadas por etapas previas y algunas alteran columnas ya normalizadas en el esquema actual. Para instalaciones nuevas se usa el esquema completo. Si se migra una base histórica, primero se identifica su versión real y se aplica cada migración pendiente en orden numérico, con respaldo.

## Render Blueprint

`render.yaml` crea primero el servicio Docker `baumar-api` y un Static Site `baumar-frontend`. La API expone `/api/health`; las URLs públicas se referencian con las variables de Render, por lo que el frontend toma la URL real de la API y CORS toma la URL real del frontend. El frontend reescribe rutas SPA a `/index.html`.

En la configuración inicial del Blueprint, proporciona únicamente `DB_USER` y `DB_PASSWORD` como secretos. Render genera `JWT_SECRET`. SMTP queda desactivado (`EMAIL_ENABLED=false`); la recuperación responde indicando que el correo no está habilitado. La cuenta administradora inicial debe registrarse por la pantalla de configuración inicial con el correo acordado antes de abrir el sitio a usuarios.

## Restricciones operativas conocidas

Los servicios gratuitos de Render tienen filesystem efímero. BauMar guarda fotos en `server/uploads`, así que los archivos cargados pueden desaparecer al reiniciar, dormir o desplegar el backend. No se deben cargar fotos reales hasta conectar almacenamiento de objetos persistente (por ejemplo, S3/R2) o cambiar a un plan con disco persistente. Los logs de archivo también son efímeros; Render captura los eventos de error enviados a stderr, pero su retención depende de la plataforma.

La instancia gratuita puede dormir tras inactividad y tardar alrededor de un minuto en despertar. Esto es comportamiento del plan, no un error de API.

## Ejecución local y validación

Desde PowerShell, en la raíz de BauMar:

```powershell
pnpm install --frozen-lockfile
docker compose up -d mysql
pnpm test
pnpm run build
pnpm dev
```

Para inicializar localmente una base que no use el contenedor de desarrollo, configura `.env` sin versionarlo y define `INITIALIZE_DATABASE=true`. No coloques secretos en `render.yaml`, en la documentación ni en logs.
