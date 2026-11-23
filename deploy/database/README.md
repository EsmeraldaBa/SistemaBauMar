# MySQL de BauMar

- La fuente del esquema actual es `server/sql/schema.sql`; las seis migraciones previas están en `server/sql/migrations/`.
- El Compose propio de BauMar está en `compose.yaml` en la raíz de este proyecto. Ejecútalo desde `BauMar/` con `docker compose -f compose.yaml up -d --build`; nunca uses la configuración de la carpeta padre, que pertenece a otro sistema.
- La ruta de inicialización del esquema es relativa al Compose: `./server/sql/schema.sql`. Esto evita montar el archivo de otro proyecto después de separar BauMar.
- El servicio reusa el volumen persistente `newproject_baumar_mysql_data`; la configuración marca el volumen como externo para evitar crear silenciosamente una base vacía o reemplazar los datos existentes.
- MySQL solo procesa `schema.sql` al crear un volumen vacío. En un volumen existente no se vuelven a ejecutar el esquema ni las seis migraciones.
- Configura `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en el entorno local de BauMar.
- Antes de cambiar el esquema de una instalación existente, respalda los datos y revisa el punto de partida; no borres la base ni ejecutes migraciones a ciegas.
- Verifica la conectividad con `/api/health` antes de probar operaciones de escritura.
