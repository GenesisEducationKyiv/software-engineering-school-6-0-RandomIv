## 🧪 Testing & Quality Assurance

This project implements a multi-layered testing strategy (Unit, Integration, and End-to-End) along with strict static analysis tools to ensure code quality and system reliability.

### 📌 Prerequisites

Before running integration or E2E tests, ensure you have **Docker** and **Docker Compose** installed and running on your local machine:
```bash
docker --version
docker compose version

```

---

### 1. Initial Setup & Code Quality

```bash
# 1. Install precise dependencies
npm ci

# 2. Generate Prisma Client (Required for types resolution)
npm run db:generate

# 3. Run ESLint checks
npm run lint

# 4. Fix automatic formatting/linting issues (if any)
npm run lint -- --fix

# 5. Verify TypeScript type integrity and compile the project
npm run build

```

---

### 2. Unit Tests

Unit tests are isolated from external dependencies and focus purely on business logic. Once the initial setup is complete, execute them via Jest:

```bash
npm run test:unit

```

---

### 3. Integration Tests

Integration tests verify the communication between the application layer and real infrastructure components.

Running the command below will spin up isolated, ephemeral **PostgreSQL** (mapped to port `5433`),
**Redis** (mapped to port `6380`) and **RabbitMQ** (mapped to port `5673`) containers, automatically
apply database migrations, run the test suites, and safely wipe out the containers afterward. The
RabbitMQ container is exercised directly by the notification queue and saga round-trip specs.

```bash
# Spin up integration environment, run migrations, execute tests, and tear down
npm run test:integration:env

```

---

### 4. End-to-End (E2E) Tests

E2E tests simulate complete real-world user journeys using Playwright and a mocked SMTP environment via MailHog.

This process builds the two production-ready Docker images that make up the system — the **API
service** (`Dockerfile`) and the **notification microservice** (`Dockerfile.notification`) — and
spins them up alongside isolated **PostgreSQL** (mapped to port `5434`), **Redis**, **RabbitMQ**
(which carries the confirmation saga; release notifications instead use a direct gRPC call) and
**MailHog** containers inside a dedicated Docker network, then fires Playwright browser actions
against the API service. A confirmation email sent during a test round-trips through the real saga:
API service → RabbitMQ → notification microservice → MailHog.

```bash
# Install required Playwright browser binaries and system dependencies
npx playwright install --with-deps chromium

# Spin up the entire E2E stack, deploy migrations, run Playwright, and clean up
npm run test:e2e:env

```

#### 📊 Inspecting E2E Failures

If an E2E test fails locally or in CI, Playwright generates a rich visual HTML report. You can review the exact steps, screenshots, and network logs by running:

```bash
npx playwright show-report

```

