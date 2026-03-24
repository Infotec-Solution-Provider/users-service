# Copilot Instructions for `users-service`

## Purpose
`users-service` is a **small authentication and user management API** for the In.pulse CRM platform. It handles JWT-based login, session recovery, and user CRUD. Because users live in the tenant's local CRM database, this service connects to `instances-service` to look them up — it does **not** own a database of its own. It also manages online agent sessions (in-memory) and exposes the auth middleware used by other services like `customers-service`.

## Tech Stack
| Concern | Choice |
|---|---|
| Runtime | Node.js + TypeScript 5 |
| Framework | Express 4 + `express-async-errors` |
| Query builder | Knex 3 + mysql2 (no ORM, no Prisma) |
| Auth | `jsonwebtoken` (JWT, 7-day expiry) |
| Validation | `class-validator` + `@nestjs/mapped-types` (DTOs) |
| Shared libs | `@in.pulse-crm/sdk` (`InstancesClient`, `SessionData`, `User`), `@in.pulse-crm/utils` |
| Language | TypeScript 5 — `NodeNext`, `es2022`, strict |
| Port | `8001` |

## Folder Structure (`src/`)
```
src/
├── main.ts                           # Bootstrap: JSON, CORS, mount 3 controllers, error handler, logRoutes
├── global.d.ts                       # Extends Express.Request with session: SessionData
├── controllers/
│   ├── auth.controller.ts            # Login + session recovery routes
│   ├── users.controller.ts           # Users CRUD routes (auth-guarded, some admin-only)
│   ├── online-sessions.controller.ts # Track online agent tokens
│   └── deactivated/                  # Archived/disabled controllers
├── services/
│   ├── auth.service.ts               # JWT sign/verify, DB user lookup
│   ├── users.service.ts              # Knex-based user queries with filtering + pagination
│   ├── instances.service.ts          # InstancesClient singleton → proxy to instances-service
│   ├── online-sessions.service.ts    # In-memory Map of online sessions per instance
│   └── deactivated/                  # Archived services
├── middlewares/
│   ├── is-authenticated.middleware.ts # Extracts JWT, populates req.session
│   └── is-admin.middleware.ts         # Checks req.session.role === admin
├── dto/                              # class-validator DTOs
├── types/                            # Domain type definitions
└── utils/
    └── query-builder.ts              # Generic Knex query builder helper (like/date columns)
```

## API Shape
All routes under `/api`:

| Method | Path | Auth | Admin | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | ✗ | ✗ | Login with `LOGIN`, `SENHA`, `instance`; returns JWT + user |
| `GET` | `/api/auth/session` | ✗ | ✗ | Decode token and return session data |
| `GET` | `/api/users` | ✓ | ✗ | List users (paginated, filterable) |
| `GET` | `/api/users/:userId` | ✓ | ✗ | Get single user by ID |
| `POST` | `/api/users` | ✓ | ✓ | Create user |
| `PATCH` | `/api/users/:userId` | ✓ | ✓ | Update user |
| `DELETE` | `/api/users/:userId` | ✓ | ✓ | Soft-deactivate user (`ATIVO: "NAO"`) |
| `GET` | `/api/online-sessions` | ✗ | ✗ | List online sessions for given `?instance=` |
| `POST` | `/api/online-sessions` | Bearer | ✗ | Register token as online |
| `DELETE` | `/api/online-sessions` | Bearer | ✗ | Remove token from online sessions |

## Build / Dev Commands
```bash
npm run dev      # ts-node-dev --transpile-only --respawn src/main.ts (hot reload)
npm run build    # tsc → dist/
npm start        # node dist/main.js
```

## Inter-Service Connections
| Env Var | Default | Purpose |
|---|---|---|
| `INSTANCES_API_URL` | `http://localhost:8000` | SQL queries on tenant DBs via `InstancesClient` |
| `JWT_SECRET_KEY` | `inpulse2025` | Sign/verify JWTs |

- `instances.service.ts` exports a singleton `InstancesClient` — **the only DB access path**.
- SQL targets the `operadores` table (users) in each tenant's MySQL database.
- `online-sessions.service.ts` is **entirely in-memory** — tokens are stored in a `Map<string, UserSessions[]>`, lost on restart.

## Code Conventions
- **Singleton exports**: services and controllers export `export default new MyClass()`.
- **DB column names ALL-UPPERCASE**: `LOGIN`, `SENHA`, `ATIVO`, `CODIGO`, `NOME`, `NIVEL`, etc. — legacy MySQL schema. Always preserve this naming.
- **Soft-delete only**: deactivation sets `ATIVO: "NAO"` via `update` — no DELETE queries on the `operadores` table.
- **`QueryBuilder` util**: generic Knex wrapper in `src/utils/query-builder.ts` that provides `addLikeColumns`/`addDateColumns` helpers — reuse when adding filters.
- **JWT payload** carries `{ instance, userId, sectorId, role, name }` — downstream middleware uses this for authorization. Keep backward-compatible.
- **Middleware chain**: `is-authenticated` → `is-admin` for write operations. Always apply both when adding admin-only endpoints.
- **No direct DB connections**: all DB access goes through `instancesService.executeQuery(instance, sql, bindings)`.
- **Naming**: `camelCase` variables/methods, `PascalCase` classes, `kebab-case` filenames.
- **Strict TypeScript** (except `strictPropertyInitialization: false`): avoid `any`, use `unknown` in catch blocks.

## Critical Invariants
- Do **not** open direct MySQL connections. All SQL must go through `instances-service` via `InstancesClient`.
- Online sessions are in-memory only — do not add persistence for them without explicit intent.
- The `deactivated/` folders contain archived code — do not restore or reuse without understanding why they were deactivated.
- JWT secret comes from `JWT_SECRET_KEY` env var — never hardcode secrets in source.
