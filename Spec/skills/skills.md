---
name: baumar-stack-guidelines
description: Guía técnica del proyecto BauMar para React/Vite, Node.js/Express y MySQL.
version: 1.1.0
language: es
---

# Guía técnica del proyecto BauMar

## 1. Stack confirmado

- Frontend: React 18, JavaScript ES modules y Vite 6.
- API: Node.js y Express 4, en `server/src/`.
- Base de datos: MySQL 8 mediante variables de entorno y `compose.yaml` propio de BauMar.
- Pruebas: Node.js test runner en `server/test/`.
- Paquete y comandos: `package.json` en la raíz.

Inspecciona `package.json`, `deploy/`, `.env.example` y los módulos afectados antes de depender de versiones o comportamientos. El backend activo es `server/src/index.js`.

## 2. Estructura y propiedad de módulos

```text
src/                         React/Vite
  components/                componentes compartidos
  pages/                     vistas y flujos de pantalla
  services/                  consumo de API desde UI
  adapters/                  adaptadores de infraestructura frontend
  facades/                   coordinación frontend existente
  strategies/                estrategias de vista existentes
server/src/                  API Express
  agents/                    análisis técnico y telemetría acotada
  routes/                    rutas HTTP y montaje
  controllers/               traducción HTTP y coordinación
  services/                  casos de uso y reglas de negocio
  models/                    acceso y representación de datos
  middleware/                autenticación, autorización y errores
  validators/                validación de entradas
  config.js, db.js, index.js configuración, MySQL y arranque
server/sql/                  esquema inicial y migraciones versionadas
server/test/                 pruebas del backend
Spec/                        especificaciones, arquitectura y guías
docs/                        documentación de usuario y artefactos
compose.yaml                 Compose independiente de BauMar
```

Respeta la organización existente y evita mover archivos si el requisito no lo necesita. Mantén la lógica de negocio y acceso a datos en servidor; el navegador nunca se conecta directamente a MySQL. No introduzcas una arquitectura nueva por preferencia.

## 3. Desarrollo y estilo

- Usa JavaScript ES modules y la indentación/convenios del archivo cercano.
- Componentes React y clases en PascalCase; funciones y variables en camelCase.
- Mantén rutas, controladores, servicios, modelos y validadores con responsabilidades acordes a los módulos existentes.
- Valida datos en el cliente para experiencia de uso y en el servidor como frontera de confianza.
- Conserva contratos HTTP consumidos por el frontend; define explícitamente cambios de rutas, cuerpos, respuestas y errores.
- Usa consultas parametrizadas con `mysql2`; no formes SQL con valores de entrada.
- Usa UUIDv7 donde el modelo existente lo requiera y conserva sus formatos/validadores.
- Las contraseñas se procesan con utilidades de `server/src/utils/passwords.js`; nunca las registres ni almacenes en texto plano.
- Aplica autenticación y autorización en middleware/servicios del backend; ocultar botones en React no es control de acceso.
- Mantén secretos en `.env`, usa `.env.example` solo con valores ficticios y no leas ni expongas secretos en reportes.

## 4. Persistencia y migraciones

- `server/sql/schema.sql` define la inicialización de una base vacía.
- Cambios a instalaciones existentes se agregan como migración SQL nueva en `server/sql/migrations/`, con nombre secuencial según las convenciones actuales.
- Revisa claves primarias/foráneas, restricciones, nulabilidad, índices y compatibilidad con datos existentes.
- Antes de quitar o reemplazar un índice, confirma si soporta una FK u otra consulta; crea y valida el reemplazo primero.
- No ejecutes cambios destructivos contra datos reales ni borres volúmenes.
- Verifica cambios de persistencia con MySQL local/Docker cuando el entorno esté disponible; no afirmes validación SQL si solo se revisó el archivo.

## 5. Seguridad y operación

- Trata toda entrada HTTP como no confiable y valida tipo, longitud, formato y permisos por recurso.
- Mantén consultas parametrizadas, autorización del lado servidor y manejo centralizado de errores.
- No devuelvas stack traces, SQL, tokens, hashes, secretos ni datos personales innecesarios.
- El Analista de rendimiento conserva únicamente agregados acotados: latencias por plantilla de endpoint, huellas SQL sin literales, vistas permitidas y memoria/CPU del proceso. No registra cuerpos HTTP, parámetros, datos de clientes/talleres/vehículos ni consultas SQL completas.
- Las rutas del informe y recepción de tiempos de vistas requieren administrador también en Express. Las métricas viven en memoria y se reinician al reiniciar la API.
- No registres contraseñas ni tokens de recuperación; minimiza información sensible en logs.
- No amplíes CORS, permisos, límites o datos expuestos sin necesidad vinculada al requisito.
- Conserva `.env` fuera de Git; no imprimas su contenido al inspeccionar configuración.

## 6. Comandos del repositorio

Ejecutados desde la raíz del proyecto:

```powershell
pnpm dev
pnpm test
pnpm build
docker compose -f compose.yaml config
docker compose -f compose.yaml up -d --build
```

Ejecuta solo las validaciones pertinentes y autorizadas. Los tests usan `node --test`; el build usa Vite. Las comprobaciones con Docker/MySQL requieren que Docker esté disponible. Reporta comandos realmente ejecutados y separa fallos de entorno de fallos del código.

## 7. Uso de guías especializadas

- Para cambios de UI React/CSS, cargar `Spec/skills/Front/Frontend.md`.
- Para el flujo general de especificación y ejecución, seguir `Spec/arquitectura/orquestador.md`.
- Si una guía contradice el stack o el contrato real del repositorio, prevalecen las instrucciones del entorno y el código/configuración confirmados; documenta la discrepancia y corrige la guía si el usuario lo pidió.
