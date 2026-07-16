# GitHub Release Notifier

Monolithic service that lets users subscribe to GitHub repository release notifications by email.

It includes:
- REST API (Swagger contract-compatible endpoints)
- gRPC API (alternative interface)
- Background scanner for new releases
- Email notifier
- PostgreSQL persistence with Prisma migrations
- Redis cache for GitHub API responses (TTL)
- Prometheus metrics endpoint
- Static HTML subscription page

## Architecture

Single Node.js service (Express + gRPC) with internal modules:
- **API layer**: REST routes under `/api` and gRPC service on port `50051`
- **Business layer**: subscription, repository, GitHub, notification services
- **Background job**: cron-based release scanner (`RELEASE_CHECK_CRON`)
- **Persistence**: PostgreSQL via Prisma
- **Cache**: Redis (optional via `REDIS_URL`)

Transport split:
- `subscription.api.controller.ts` — key-protected REST API transport
- `subscription.web.controller.ts` — public browser/email transport
- `grpc.handlers.ts` — gRPC transport
- shared response mapper: `subscription.mapper.ts`

## Deployment

Public deployment (Google Cloud VM):

- Base URL: `http://34.44.62.242:3000`
- Health: `http://34.44.62.242:3000/health`
- HTML page: `http://34.44.62.242:3000/`

Reviewer API key (temporary):

`PRbDeMxBtBy1bbXmQdc8s9CwSpHH9krE2lz-hhQwRpvBudUIx0Zz73kUJEhaaxns`

Example:

```bash
curl "http://34.44.62.242:3000/api/subscriptions?email=user@example.com" \
  -H "x-api-key: PRbDeMxBtBy1bbXmQdc8s9CwSpHH9krE2lz-hhQwRpvBudUIx0Zz73kUJEhaaxns"
```

Deployed gRPC check (run from repository root where `./proto/release_notifier.proto` exists):

```bash
grpcurl -plaintext -emit-defaults \
  -import-path ./proto \
  -proto release_notifier.proto \
  -H 'x-api-key: PRbDeMxBtBy1bbXmQdc8s9CwSpHH9krE2lz-hhQwRpvBudUIx0Zz73kUJEhaaxns' \
  -d '{"email":"user@example.com"}' \
  34.44.62.242:50051 release_notifier.ReleaseNotifier/GetSubscriptions
```

> Note: this key is for review/demo and should be rotated after review.

## Environment variables

Copy `.env.example` to `.env` and fill real values.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `production`, `test` |
| `PORT` | No | HTTP server port (default `3000`) |
| `APP_BASE_URL` | No | Base URL used in email links |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EMAIL_USER` | Yes | Sender Gmail address |
| `EMAIL_PASS` | Yes | Gmail App Password |
| `SMTP_HOST` | No | Custom SMTP host (falls back to Gmail transport when not set) |
| `SMTP_PORT` | No | Custom SMTP port (default `1025` when `SMTP_HOST` is set) |
| `SMTP_SECURE` | No | `true`/`false` override for SMTP TLS (otherwise auto-detected from port `465`) |
| `API_KEY` | Yes | API key for protected endpoints |
| `RELEASE_CHECK_CRON` | No | Cron expression for scanner (default `*/5 * * * *`) |
| `REDIS_URL` | No | Redis URL for cache |
| `GITHUB_CACHE_TTL_SECONDS` | No | GitHub cache TTL in seconds (default `600`) |
| `GITHUB_TOKEN` | No | GitHub token to increase rate limits |
| `GRPC_HOST` | No | gRPC host (default `0.0.0.0`) |
| `GRPC_PORT` | No | gRPC port (default `50051`) |

## Run with Docker (recommended)

```bash
docker compose up --build
```

What happens on startup:
1. Container starts the app.
2. `prisma migrate deploy` runs automatically.
3. HTTP server starts on `http://localhost:3000`.
4. gRPC server starts on `localhost:50051`.

Services started by compose:
- `app` (Node.js monolith)
- `postgres` (PostgreSQL 15)
- `redis` (Redis 7)

## Run locally (without Docker for app)

1. Start dependencies:
```bash
docker compose up -d postgres redis
```

2. Install packages:
```bash
npm ci
```

3. Prepare env:
```bash
cp .env.example .env
```

4. Apply migrations:
```bash
npm run db:migrate:deploy
```

5. Start app:
```bash
npm run dev
```

## REST API

Base path: `/api`

- `POST /api/subscribe` — create subscription (**requires** `x-api-key`)
- `GET /api/confirm/:token` — confirm email subscription (**requires** `x-api-key`)
- `GET /api/unsubscribe/:token` — unsubscribe by token (**requires** `x-api-key`)
- `GET /api/subscriptions?email=` — list subscriptions (**requires** `x-api-key`)

Public web routes (for browser/email links):
- `POST /web/subscribe`
- `GET /web/confirm/:token`
- `GET /web/unsubscribe/:token`

Metrics endpoint:
- `GET /metrics`
- `GET /health`

Example:

```bash
curl -X POST http://localhost:3000/api/subscribe \
  -H 'Content-Type: application/json' \
  -H "x-api-key: local-dev-api-key" \
  -d '{"email":"user@example.com","repo":"golang/go"}'
```

```bash
curl "http://localhost:3000/api/subscriptions?email=user@example.com" \
  -H "x-api-key: local-dev-api-key"
```

## HTML subscription page

Open:

```text
http://localhost:3000/
```

The page submits to `POST /web/subscribe`, so API keys are not exposed in browser code.
The public web subscribe route is rate-limited (5 requests per 15 minutes per IP).

## gRPC API

Proto file: `proto/release_notifier.proto`

Service: `release_notifier.ReleaseNotifier`

Methods:
- `Subscribe` (**requires** metadata `x-api-key`)
- `Confirm` (**requires** metadata `x-api-key`)
- `Unsubscribe` (**requires** metadata `x-api-key`)
- `GetSubscriptions` (**requires** metadata `x-api-key`)

Example with `grpcurl`:

```bash
grpcurl -plaintext \
  -import-path ./proto \
  -proto release_notifier.proto \
  -H 'x-api-key: local-dev-api-key' \
  -d '{"email":"user@example.com","repo":"golang/go"}' \
  localhost:50051 release_notifier.ReleaseNotifier/Subscribe
```

```bash
grpcurl -plaintext \
  -import-path ./proto \
  -proto release_notifier.proto \
  -H 'x-api-key: local-dev-api-key' \
  -d '{"email":"user@example.com"}' \
  localhost:50051 release_notifier.ReleaseNotifier/GetSubscriptions
```

### gRPC smoke test (reviewer-friendly)

1. Start dependencies:
```bash
docker compose up -d postgres redis
```

2. Apply migrations:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github_notifier npm run db:migrate:deploy
```

3. Start app:
```bash
API_KEY=local-dev-api-key \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github_notifier \
EMAIL_USER=test@example.com \
EMAIL_PASS=test-password \
npm run dev
```

4. Verify auth is enforced (should return `UNAUTHENTICATED`):
```bash
grpcurl -plaintext \
  -import-path ./proto \
  -proto release_notifier.proto \
  -d '{"email":"user@example.com","repo":"golang/go"}' \
  localhost:50051 release_notifier.ReleaseNotifier/Subscribe
```

5. Verify authenticated call works:
```bash
grpcurl -plaintext \
  -import-path ./proto \
  -proto release_notifier.proto \
  -H 'x-api-key: local-dev-api-key' \
  -d '{"email":"user@example.com"}' \
  localhost:50051 release_notifier.ReleaseNotifier/GetSubscriptions
```

Expected response shape:
```json
{ "subscriptions": [] }
```

6. Optional automated verification:
```bash
npm test -- --runInBand tests/integration/subscription.grpc.spec.ts
```

## Notes

- GitHub `429 Too Many Requests` is handled and mapped as rate-limit errors.
- Redis caching is optional; if `REDIS_URL` is not set, service runs without cache.
- Graceful shutdown is implemented for HTTP server, gRPC server, and cron job.
