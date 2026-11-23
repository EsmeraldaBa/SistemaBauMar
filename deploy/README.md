# Artefactos de despliegue BauMar

Esta carpeta contiene Dockerfiles separados para frontend y backend. La raíz de contexto de ambos builds es `BauMar/`. Para ejecutar la aplicación completa (MySQL, API y frontend) usa el Compose de esta carpeta de proyecto, `../compose.yaml`, no la configuración del directorio padre:

```powershell
docker compose -f compose.yaml config
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
```

El backend necesita variables de entorno para JWT y MySQL. El frontend usa Vite y su `index.html` propio, que monta React desde `src/main.jsx`. Nginx reenvía `/api` y `/uploads` al servicio `api` de la red donde se ejecute.

El Compose monta `./server/sql/schema.sql` y reusa como volumen externo `newproject_baumar_mysql_data`; requiere que `.env` contenga los secretos y las mismas credenciales de la base existente. No elimines el volumen. La conexión de producción a MySQL/TiDB, URL pública y almacenamiento persistente de fotos quedan pendientes de configuración para el despliegue.
