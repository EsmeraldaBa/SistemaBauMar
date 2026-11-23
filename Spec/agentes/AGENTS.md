# Repository Guidelines

## Project Structure & Modules

BauMar is a React/Vite frontend and Node.js/Express API. Pages/components are in `../../src/pages` and `src/components/`; frontend adapters, facades, services, and strategies are in `src/`. Backend code is organized under `server/src/`. MySQL schema and migrations are in `server/sql/`; tests are in `server/test/`; project documentation is in `Spec`.

## Build, Test & Run

- `pnpm install --frozen-lockfile` installs the locked dependencies.
- Configure MySQL through BauMar's own `compose.yaml` and `.env`; never run a Compose file from the parent folder or another project. Its MySQL service reuses the verified `newproject_baumar_mysql_data` volume, so do not remove or recreate that volume.
- `docker compose -f compose.yaml up -d --build` starts MySQL, Express, and the UI at `http://localhost:8080/`.
- `pnpm dev` starts Express and Vite for direct development; open `http://localhost:5173/`.
- `pnpm test` runs the Node built-in test suite in `server/test/`.
- `pnpm build` creates the production frontend bundle in `dist/`.

Configure local credentials and secrets in `.env` using `.env.example`; never commit `.env`. Before replacing a database index, check whether it also supports a foreign key and add a replacement index first.

## Code Style & Naming

Use JavaScript ES modules and two-space indentation. Name React components/classes in PascalCase and functions/variables in camelCase. Separate API route, controller, service, and model responsibilities. Use UUIDv7 IDs, validate input in UI and API, and enforce authorization in backend middleware.

## Testing

Run `pnpm test` and `pnpm build` after changes. Add descriptive tests to `server/test/core.test.js` covering relevant validation, permissions, UUIDv7, and schema behavior. Verify persistence changes against a disposable MySQL database.

## Commits & Pull Requests

Git history is unavailable in this checkout, so no repository-specific commit convention could be confirmed. Prefer concise Conventional Commit subjects such as `feat: add workshop address lookup` or `fix: show local password reset result`. PRs should describe behavior and relevant schema changes, list test/build results, note configuration or migration steps, and include screenshots for UI changes.

## Security & Operations

Never log passwords, reset tokens, or secrets. Keep password hashing, role checks, and database access in the backend. Add schema changes as versioned SQL migrations and update `Spec` when setup or user flows change.

The Performance Analyst reports technical telemetry only. Keep its access administrator-only, bound its in-memory samples, fingerprint SQL without literal values, and never include workshop, vehicle, customer, credential, or request-body data. Document metric reset behavior after API restarts.

## Agent Workflow References

For BauMar changes, read `Spec/arquitectura/orquestador.md`, `Spec/skills/skills.md`, and the relevant frontend or backend guide under `Spec/arquitectura/documentacion/`. Keep them synchronized with security rules, data relationships, and module ownership.
