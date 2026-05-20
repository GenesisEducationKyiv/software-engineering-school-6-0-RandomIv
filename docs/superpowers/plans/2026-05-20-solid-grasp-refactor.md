# SOLID & GRASP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `github-release-notifier` into a hexagonal architecture (`domain` / `application` / `infrastructure` / `presentation`) with classes + constructor DI, a manual composition root, and polymorphic exception translation — so each SOLID and GRASP principle is locatable in code.

**Architecture:** Inward-pointing dependencies. `application/` knows only `domain/` + `application/ports/`. `infrastructure/` implements those ports. `presentation/` (Express + gRPC) holds use cases and delegates. `src/composition-root.ts` is the only place concretions are wired.

**Tech Stack:** Node.js + TypeScript (CommonJS), Express, gRPC, Prisma, PostgreSQL, Redis (optional), nodemailer, node-cron, Zod, Pino, Jest + Supertest, prom-client.

**Spec:** `docs/superpowers/specs/2026-05-20-solid-grasp-refactor-design.md` (commit `c3fd3bb`).

---

## File Structure (target)

```
src/
├── domain/
│   ├── subscription/subscription.entity.ts
│   ├── repository/repository.entity.ts
│   └── errors/
│       ├── app.error.ts
│       ├── bad-request.error.ts
│       ├── conflict.error.ts
│       ├── not-found.error.ts
│       ├── rate-limit.error.ts
│       ├── unauthorized.error.ts
│       └── index.ts
├── application/
│   ├── ports/
│   │   ├── cache.port.ts
│   │   ├── clock.port.ts
│   │   ├── email.sender.port.ts
│   │   ├── github.client.port.ts
│   │   ├── http-client.port.ts
│   │   ├── logger.port.ts
│   │   ├── repository.repository.port.ts
│   │   ├── scheduler.port.ts
│   │   └── subscription.repository.port.ts
│   ├── subscription/
│   │   ├── subscribe.use-case.ts
│   │   ├── confirm-subscription.use-case.ts
│   │   ├── unsubscribe.use-case.ts
│   │   └── list-subscriptions.use-case.ts
│   └── scanner/
│       ├── check-releases.use-case.ts
│       └── notify-repository-subscribers.use-case.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── prisma.client.ts
│   │   ├── prisma-subscription.repository.ts
│   │   └── prisma-repository.repository.ts
│   ├── github/
│   │   ├── github-http.client.ts
│   │   └── github-cache-keys.ts
│   ├── email/
│   │   ├── nodemailer.sender.ts
│   │   ├── app-url-builder.ts
│   │   └── templates/
│   │       ├── confirmation-email.template.ts
│   │       └── release-email.template.ts
│   ├── cache/
│   │   ├── redis.cache.ts
│   │   └── noop.cache.ts
│   ├── http/fetch.http-client.ts
│   ├── logging/pino.logger.ts
│   └── scheduler/node-cron.scheduler.ts
├── presentation/
│   ├── http/
│   │   ├── http-app.factory.ts
│   │   ├── api.router.ts
│   │   ├── web.router.ts
│   │   ├── controllers/subscription.controller.ts
│   │   ├── middlewares/
│   │   │   ├── api-key.middleware.ts
│   │   │   ├── rate-limit.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── error-translators/
│   │   │   ├── exception-translator.port.ts
│   │   │   ├── exception-translator.registry.ts
│   │   │   ├── zod.translator.ts
│   │   │   ├── prisma.translator.ts
│   │   │   ├── app-error.translator.ts
│   │   │   └── fallback.translator.ts
│   │   ├── views/html.template.ts
│   │   └── utils/web-error.util.ts
│   └── grpc/
│       ├── grpc.server.ts
│       ├── grpc.handlers.ts
│       ├── grpc.types.ts
│       └── error-translators/
│           ├── grpc-exception-translator.port.ts
│           ├── grpc-exception-translator.registry.ts
│           ├── zod.grpc-translator.ts
│           ├── app-error.grpc-translator.ts
│           └── fallback.grpc-translator.ts
├── config/                       # unchanged
├── composition-root.ts           # new
└── index.ts                      # rewritten
```

---

## Phase 0 — Baseline

### Task 0.1: Capture green baseline

**Files:** none

- [ ] **Step 1: Confirm clean working tree on the refactor branch**

Run: `git status`
Expected: branch `fix-hw1-cleancode`, working tree clean.

- [ ] **Step 2: Run the existing test suite as a baseline**

Run: `npm test`
Expected: all suites pass. If anything fails, stop and fix before refactoring.

- [ ] **Step 3: Verify the dev server builds**

Run: `npm run build`
Expected: `tsc` exits 0.

- [ ] **Step 4: Tag the baseline (no-op if not desired)**

Run: `git tag -a pre-refactor-baseline -m "Pre-refactor baseline"`
Expected: tag created locally. (Optional — for quick rollback only; not pushed.)

---

## Phase 1 — Scaffolding (move pure pieces, add re-export shims)

### Task 1.1: Create the new top-level folders

**Files:**
- Create (empty): `src/domain/`, `src/application/`, `src/application/ports/`, `src/application/subscription/`, `src/application/scanner/`, `src/infrastructure/`, `src/presentation/`, `src/presentation/http/`, `src/presentation/http/controllers/`, `src/presentation/http/middlewares/`, `src/presentation/http/error-translators/`, `src/presentation/http/views/`, `src/presentation/http/utils/`, `src/presentation/grpc/`, `src/presentation/grpc/error-translators/`

- [ ] **Step 1: Create folders**

Run:
```bash
mkdir -p src/domain/subscription src/domain/repository src/domain/errors \
         src/application/ports src/application/subscription src/application/scanner \
         src/infrastructure/persistence src/infrastructure/github src/infrastructure/email/templates \
         src/infrastructure/cache src/infrastructure/http src/infrastructure/logging src/infrastructure/scheduler \
         src/presentation/http/controllers src/presentation/http/middlewares src/presentation/http/error-translators \
         src/presentation/http/views src/presentation/http/utils \
         src/presentation/grpc/error-translators
```
Expected: directories created; no output.

- [ ] **Step 2: Verify directories**

Run: `find src/{domain,application,infrastructure,presentation} -type d | sort`
Expected: lists all the directories above.

(No commit yet — empty dirs aren't tracked. We'll commit after Task 1.2.)

---

### Task 1.2: Move the error hierarchy into `src/domain/errors/`

**Files:**
- Create: `src/domain/errors/app.error.ts`, `bad-request.error.ts`, `conflict.error.ts`, `not-found.error.ts`, `rate-limit.error.ts`, `unauthorized.error.ts`, `index.ts`
- Modify: `src/common/errors/app-error.ts` → re-export shim
- Modify: `src/common/errors/index.ts` → re-export shim

- [ ] **Step 1: Create `src/domain/errors/app.error.ts`**

```ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
```

- [ ] **Step 2: Create per-error files**

`src/domain/errors/not-found.error.ts`:
```ts
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(HttpStatus.NOT_FOUND, message);
  }
}
```

`src/domain/errors/bad-request.error.ts`:
```ts
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}
```

`src/domain/errors/unauthorized.error.ts`:
```ts
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}
```

`src/domain/errors/rate-limit.error.ts`:
```ts
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests from GitHub API') {
    super(HttpStatus.TOO_MANY_REQUESTS, message);
  }
}
```

`src/domain/errors/conflict.error.ts`:
```ts
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(HttpStatus.CONFLICT, message);
  }
}
```

`src/domain/errors/index.ts`:
```ts
export { AppError } from './app.error';
export { BadRequestError } from './bad-request.error';
export { ConflictError } from './conflict.error';
export { NotFoundError } from './not-found.error';
export { RateLimitError } from './rate-limit.error';
export { UnauthorizedError } from './unauthorized.error';
```

- [ ] **Step 3: Replace `src/common/errors/app-error.ts` with a re-export shim**

```ts
// Re-export shim — to be deleted in Phase 9. See domain/errors/app.error.ts.
export { AppError } from '../../domain/errors/app.error';
```

- [ ] **Step 4: Replace `src/common/errors/index.ts` with a re-export shim**

```ts
// Re-export shim — to be deleted in Phase 9. See domain/errors/index.ts.
export * from '../../domain/errors';
```

- [ ] **Step 5: Compile**

Run: `npm run build`
Expected: `tsc` exits 0.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/errors src/common/errors
git commit -m "refactor(errors): move error classes to domain/errors with re-export shims"
```

---

### Task 1.3: Move the logger interface to `application/ports/logger.port.ts`

**Files:**
- Create: `src/application/ports/logger.port.ts`
- Modify: `src/common/logger/logger.interface.ts` → re-export shim

- [ ] **Step 1: Create `src/application/ports/logger.port.ts`**

```ts
export interface LoggerPort {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
```

- [ ] **Step 2: Replace `src/common/logger/logger.interface.ts` with a re-export shim**

```ts
// Re-export shim — to be deleted in Phase 9. See application/ports/logger.port.ts.
export type { LoggerPort as Logger } from '../../application/ports/logger.port';
```

- [ ] **Step 3: Compile + test**

Run: `npm run build && npm test`
Expected: build passes, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/application/ports/logger.port.ts src/common/logger/logger.interface.ts
git commit -m "refactor(logger): move Logger interface to application/ports/logger.port.ts"
```

---

## Phase 2 — Ports

Each port is a `.ts` file containing **only** an `export interface` (and lightweight value types where unavoidable). No implementations yet. No tests for these — they're contracts, type-checked by their adapters and consumers.

### Task 2.1: Subscription repository port

**Files:** Create `src/application/ports/subscription.repository.port.ts`

- [ ] **Step 1: Write file**

```ts
import { Subscription } from '../../domain/subscription/subscription.entity';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export interface CreateSubscriptionInput {
  email: string;
  repositoryId: string;
}

export interface SubscriptionRepositoryPort {
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  findByConfirmationToken(token: string): Promise<Subscription | null>;
  markConfirmed(id: string): Promise<void>;
  deleteByUnsubscribeToken(token: string): Promise<boolean>;
  deleteById(id: string): Promise<void>;
  findConfirmedByEmail(email: string): Promise<SubscriptionWithRepository[]>;
}
```

> **Note:** `Subscription` entity is created in Phase 4 (Task 4.1). Until then this file won't compile in isolation; we'll add the entity before we type-check the port. Do **not** build/test after this step — wait until Task 4.1 is done. Just write the file and move on to the next port.

---

### Task 2.2: Repository repository port

**Files:** Create `src/application/ports/repository.repository.port.ts`

- [ ] **Step 1: Write file**

```ts
import { Repository } from '../../generated/prisma/client';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';

export interface RepositoryRepositoryPort {
  getOrCreate(fullName: string): Promise<Repository>;
  listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]>;
  updateLastSeenTag(id: string, tag: string): Promise<void>;
}
```

> `Repository` is still imported from the generated Prisma client at this phase. After Phase 4 we may swap it for a hand-rolled `Repository` entity — left for a future refactor; out of scope per spec §13.

---

### Task 2.3: GitHub client port

**Files:** Create `src/application/ports/github.client.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface GitHubClientPort {
  repoExists(fullName: string): Promise<boolean>;
  getLatestReleaseTag(fullName: string): Promise<string | null>;
}
```

---

### Task 2.4: Email sender port

**Files:** Create `src/application/ports/email.sender.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>;
}
```

---

### Task 2.5: Cache port

**Files:** Create `src/application/ports/cache.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface CachePort {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}
```

---

### Task 2.6: HTTP client port

**Files:** Create `src/application/ports/http-client.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface HttpClientPort {
  request<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}
```

---

### Task 2.7: Scheduler port

**Files:** Create `src/application/ports/scheduler.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface SchedulerPort {
  schedule(task: () => Promise<void> | void): void;
  stop(): Promise<void>;
}
```

---

### Task 2.8: Clock port

**Files:** Create `src/application/ports/clock.port.ts`

- [ ] **Step 1: Write file**

```ts
export interface ClockPort {
  now(): Date;
}
```

---

### Task 2.9: Commit Phase 2

- [ ] **Step 1: Commit (build will fail at this point; we accept that until Phase 4 lands the Subscription entity — confirm only the ports themselves are staged)**

```bash
git add src/application/ports
git commit -m "refactor: add application ports for hexagonal layering"
```

> Build & tests are intentionally **not** run between Phase 2 and Phase 4. The interim state references the `Subscription` entity that arrives in Phase 4.

---

## Phase 3 — Infrastructure adapters

Adapters can be built before the entity if we treat `Subscription` from `application/ports/subscription.repository.port.ts` opaquely. So we land them concurrently with Phase 4 but as a separate set of commits. For ordering simplicity here: write the entity first (Task 4.1), then come back to Phase 3.

> **Execution note:** Implementers should do Task 4.1 (Subscription entity) **before** the adapters in Task 3.2.

### Task 3.1: Prisma client adapter

**Files:** Create `src/infrastructure/persistence/prisma.client.ts`

- [ ] **Step 1: Write file**

```ts
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

export const createPrismaClient = (databaseUrl: string): PrismaClient => {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/persistence/prisma.client.ts
git commit -m "refactor(persistence): add createPrismaClient factory"
```

---

### Task 3.2: PrismaSubscriptionRepository (DEPENDS ON 4.1)

**Files:**
- Create: `src/infrastructure/persistence/prisma-subscription.repository.ts`
- Test: `tests/unit/infrastructure/persistence/prisma-subscription.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/infrastructure/persistence/prisma-subscription.repository.spec.ts
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { PrismaClient, Prisma } from '../../../../src/generated/prisma/client';
import { PrismaSubscriptionRepository } from '../../../../src/infrastructure/persistence/prisma-subscription.repository';
import { ConflictError } from '../../../../src/domain/errors';

describe('PrismaSubscriptionRepository', () => {
  let prisma: MockProxy<PrismaClient>;
  let repo: PrismaSubscriptionRepository;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    repo = new PrismaSubscriptionRepository(prisma);
  });

  it('translates Prisma P2002 to ConflictError on create', async () => {
    prisma.subscription.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );

    await expect(
      repo.create({ email: 'a@b.c', repositoryId: 'r1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
```

- [ ] **Step 2: Run — expect fail (file does not exist)**

Run: `npm test -- prisma-subscription.repository.spec`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Write the implementation**

```ts
// src/infrastructure/persistence/prisma-subscription.repository.ts
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { Subscription } from '../../domain/subscription/subscription.entity';
import { ConflictError } from '../../domain/errors';
import {
  CreateSubscriptionInput,
  SubscriptionRepositoryPort,
} from '../../application/ports/subscription.repository.port';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

type SubscriptionRow = Prisma.SubscriptionGetPayload<object>;

const toEntity = (row: SubscriptionRow): Subscription =>
  new Subscription(
    row.id,
    row.email,
    row.repositoryId,
    row.confirmationToken,
    row.unsubscribeToken,
    row.confirmed,
  );

export class PrismaSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    try {
      const row = await this.prisma.subscription.create({
        data: {
          email: input.email,
          confirmed: false,
          repositoryId: input.repositoryId,
        },
      });
      return toEntity(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Email already subscribed to this repository');
      }
      throw error;
    }
  }

  async findByConfirmationToken(token: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { confirmationToken: token },
    });
    return row ? toEntity(row) : null;
  }

  async markConfirmed(id: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: { confirmed: true },
    });
  }

  async deleteByUnsubscribeToken(token: string): Promise<boolean> {
    const result = await this.prisma.subscription.deleteMany({
      where: { unsubscribeToken: token },
    });
    return result.count > 0;
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.subscription.deleteMany({ where: { id } });
  }

  async findConfirmedByEmail(
    email: string,
  ): Promise<SubscriptionWithRepository[]> {
    return this.prisma.subscription.findMany({
      where: { email, confirmed: true },
      include: { repository: true },
    });
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- prisma-subscription.repository.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/persistence/prisma-subscription.repository.ts \
        tests/unit/infrastructure/persistence/prisma-subscription.repository.spec.ts
git commit -m "refactor(persistence): add PrismaSubscriptionRepository adapter"
```

---

### Task 3.3: PrismaRepositoryRepository

**Files:**
- Create: `src/infrastructure/persistence/prisma-repository.repository.ts`
- Test: `tests/unit/infrastructure/persistence/prisma-repository.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { PrismaClient } from '../../../../src/generated/prisma/client';
import { PrismaRepositoryRepository } from '../../../../src/infrastructure/persistence/prisma-repository.repository';

describe('PrismaRepositoryRepository', () => {
  let prisma: MockProxy<PrismaClient>;
  let repo: PrismaRepositoryRepository;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    repo = new PrismaRepositoryRepository(prisma);
  });

  it('upserts on getOrCreate', async () => {
    prisma.repository.upsert.mockResolvedValueOnce({
      id: 'r1',
      fullName: 'owner/repo',
      lastSeenTag: null,
      createdAt: new Date(),
    } as never);

    const result = await repo.getOrCreate('owner/repo');

    expect(prisma.repository.upsert).toHaveBeenCalledWith({
      where: { fullName: 'owner/repo' },
      update: {},
      create: { fullName: 'owner/repo' },
    });
    expect(result.id).toBe('r1');
  });

  it('updates lastSeenTag', async () => {
    prisma.repository.update.mockResolvedValueOnce({} as never);
    await repo.updateLastSeenTag('r1', 'v2');
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { lastSeenTag: 'v2' },
    });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- prisma-repository.repository.spec`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/infrastructure/persistence/prisma-repository.repository.ts
import { PrismaClient, Repository } from '../../generated/prisma/client';
import { RepositoryRepositoryPort } from '../../application/ports/repository.repository.port';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';

export class PrismaRepositoryRepository implements RepositoryRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(fullName: string): Promise<Repository> {
    return this.prisma.repository.upsert({
      where: { fullName },
      update: {},
      create: { fullName },
    });
  }

  async listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]> {
    return this.prisma.repository.findMany({
      where: { subscriptions: { some: { confirmed: true } } },
      include: { subscriptions: { where: { confirmed: true } } },
    });
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    await this.prisma.repository.update({
      where: { id },
      data: { lastSeenTag: tag },
    });
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- prisma-repository.repository.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/persistence/prisma-repository.repository.ts \
        tests/unit/infrastructure/persistence/prisma-repository.repository.spec.ts
git commit -m "refactor(persistence): add PrismaRepositoryRepository adapter"
```

---

### Task 3.4: FetchHttpClient adapter

**Files:**
- Create: `src/infrastructure/http/fetch.http-client.ts`
- Test: `tests/unit/infrastructure/http/fetch.http-client.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { FetchHttpClient } from '../../../../src/infrastructure/http/fetch.http-client';
import { NotFoundError, RateLimitError, AppError } from '../../../../src/domain/errors';

const mockResponse = (body: unknown, status = 200, contentType = 'application/json'): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => (k === 'content-type' ? contentType : null) },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

describe('FetchHttpClient', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('parses JSON on 200', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse({ a: 1 }));
    const client = new FetchHttpClient();
    await expect(client.request<{ a: number }>('https://x/y')).resolves.toEqual({ a: 1 });
  });

  it('throws NotFoundError on 404', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse('', 404));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws RateLimitError on 429', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse('', 429));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws AppError when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('connection refused'));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- fetch.http-client.spec`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/infrastructure/http/fetch.http-client.ts
import { HttpClientPort, HttpRequestOptions } from '../../application/ports/http-client.port';
import { AppError, NotFoundError, RateLimitError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';

const buildUrl = (rawUrl: string, params?: HttpRequestOptions['params']): URL => {
  const url = new URL(rawUrl);
  if (!params) return url;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
};

const throwForHttpError = async (response: Response): Promise<void> => {
  if (response.status === HttpStatus.TOO_MANY_REQUESTS) throw new RateLimitError();
  if (response.status === HttpStatus.NOT_FOUND) throw new NotFoundError('Resource not found');
  if (!response.ok) {
    const details = await response.text();
    throw new AppError(response.status, details || `External API error: ${response.status}`);
  }
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return (await response.text()) as T;
  return (await response.json()) as T;
};

export class FetchHttpClient implements HttpClientPort {
  async request<T>(rawUrl: string, options: HttpRequestOptions = {}): Promise<T> {
    const { params, ...init } = options;
    const url = buildUrl(rawUrl, params);

    let response: Response;
    try {
      response = await fetch(url, { method: init.method ?? 'GET', ...init });
    } catch {
      throw new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to reach external API');
    }

    await throwForHttpError(response);
    return parseResponse<T>(response);
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- fetch.http-client.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/http/fetch.http-client.ts \
        tests/unit/infrastructure/http/fetch.http-client.spec.ts
git commit -m "refactor(http): add FetchHttpClient adapter implementing HttpClientPort"
```

---

### Task 3.5: NoopCache and RedisCache

**Files:**
- Create: `src/infrastructure/cache/noop.cache.ts`, `src/infrastructure/cache/redis.cache.ts`
- Test: `tests/unit/infrastructure/cache/noop.cache.spec.ts`

- [ ] **Step 1: Write the failing test for NoopCache**

```ts
import { NoopCache } from '../../../../src/infrastructure/cache/noop.cache';

describe('NoopCache', () => {
  it('always returns null on getJson', async () => {
    const cache = new NoopCache();
    await expect(cache.getJson('k')).resolves.toBeNull();
  });
  it('setJson is a no-op (does not throw)', async () => {
    const cache = new NoopCache();
    await expect(cache.setJson('k', { v: 1 }, 60)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- noop.cache.spec`
Expected: FAIL.

- [ ] **Step 3: NoopCache implementation**

```ts
// src/infrastructure/cache/noop.cache.ts
import { CachePort } from '../../application/ports/cache.port';

export class NoopCache implements CachePort {
  async getJson<T>(_key: string): Promise<T | null> { return null; }
  async setJson<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> { /* no-op */ }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- noop.cache.spec`
Expected: PASS.

- [ ] **Step 5: RedisCache implementation (with internal lazy-connect)**

```ts
// src/infrastructure/cache/redis.cache.ts
import { createClient, type RedisClientType } from 'redis';
import { CachePort } from '../../application/ports/cache.port';
import { LoggerPort } from '../../application/ports/logger.port';

const REDIS_CONNECT_COOLDOWN_MS = 60_000;

export class RedisCache implements CachePort {
  private client: RedisClientType | null = null;
  private connectPromise: Promise<RedisClientType | null> | null = null;
  private disabledUntil = 0;

  constructor(
    private readonly url: string,
    private readonly logger: LoggerPort,
  ) {}

  private async getClient(): Promise<RedisClientType | null> {
    if (Date.now() < this.disabledUntil) return null;
    if (this.client?.isOpen) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.client = createClient({
      url: this.url,
      socket: { connectTimeout: 2000, reconnectStrategy: () => false },
    });
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, '[Redis] Client error');
    });

    this.connectPromise = this.client
      .connect()
      .then(() => this.client)
      .catch((error: unknown) => {
        this.logger.error({ err: error }, '[Redis] Failed to connect');
        this.disabledUntil = Date.now() + REDIS_CONNECT_COOLDOWN_MS;
        this.client = null;
        return null;
      })
      .finally(() => { this.connectPromise = null; });

    return this.connectPromise;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  }
}
```

- [ ] **Step 6: Run all tests**

Run: `npm test -- cache`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/cache/noop.cache.ts src/infrastructure/cache/redis.cache.ts \
        tests/unit/infrastructure/cache/noop.cache.spec.ts
git commit -m "refactor(cache): add NoopCache + RedisCache adapters for CachePort"
```

---

### Task 3.6: PinoLogger adapter

**Files:**
- Create: `src/infrastructure/logging/pino.logger.ts`

- [ ] **Step 1: Copy the existing implementation, swap the `Logger` import to `LoggerPort`**

```ts
// src/infrastructure/logging/pino.logger.ts
import pino, { type Logger as PinoInstance } from 'pino';
import { LoggerPort } from '../../application/ports/logger.port';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const createPinoInstance = (): PinoInstance =>
  pino({
    level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
    ...(!isProd && !isTest && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    }),
  });

export class PinoLogger implements LoggerPort {
  private readonly instance: PinoInstance;

  constructor(instance: PinoInstance = createPinoInstance()) {
    this.instance = instance;
  }

  info(...args: unknown[]): void {
    this.instance.info(...(args as Parameters<PinoInstance['info']>));
  }
  warn(...args: unknown[]): void {
    this.instance.warn(...(args as Parameters<PinoInstance['warn']>));
  }
  error(...args: unknown[]): void {
    this.instance.error(...(args as Parameters<PinoInstance['error']>));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/logging/pino.logger.ts
git commit -m "refactor(logging): add PinoLogger adapter under infrastructure/logging"
```

---

### Task 3.7: AppUrlBuilder

**Files:**
- Create: `src/infrastructure/email/app-url-builder.ts`
- Test: `tests/unit/infrastructure/email/app-url-builder.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';

describe('AppUrlBuilder', () => {
  it('builds web path with a single /web prefix even when baseUrl has trailing slash', () => {
    const urls = new AppUrlBuilder('http://localhost:3000/');
    expect(urls.webPath('/confirm/abc')).toBe('http://localhost:3000/web/confirm/abc');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- app-url-builder`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/infrastructure/email/app-url-builder.ts
export class AppUrlBuilder {
  private readonly base: string;
  constructor(baseUrl: string) { this.base = baseUrl.replace(/\/+$/, ''); }
  webPath(path: string): string { return `${this.base}/web${path}`; }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- app-url-builder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/email/app-url-builder.ts \
        tests/unit/infrastructure/email/app-url-builder.spec.ts
git commit -m "refactor(email): add AppUrlBuilder"
```

---

### Task 3.8: Email templates

**Files:**
- Create: `src/infrastructure/email/templates/confirmation-email.template.ts`, `release-email.template.ts`
- Test: `tests/unit/infrastructure/email/templates/confirmation-email.template.spec.ts`, `release-email.template.spec.ts`

- [ ] **Step 1: Failing test for confirmation template**

```ts
import { ConfirmationEmailTemplate } from '../../../../../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../../../../../src/infrastructure/email/app-url-builder';
import { Subscription } from '../../../../../src/domain/subscription/subscription.entity';

describe('ConfirmationEmailTemplate', () => {
  it('renders subject and links', () => {
    const tpl = new ConfirmationEmailTemplate(new AppUrlBuilder('http://x'));
    const sub = new Subscription('id', 'a@b.c', 'r1', 'CONF-TOK', 'UNSUB-TOK', false);

    const msg = tpl.render(sub, 'owner/repo');

    expect(msg.to).toBe('a@b.c');
    expect(msg.subject).toContain('owner/repo');
    expect(msg.text).toContain('http://x/web/confirm/CONF-TOK');
    expect(msg.text).toContain('http://x/web/unsubscribe/UNSUB-TOK');
    expect(msg.html).toContain('http://x/web/confirm/CONF-TOK');
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- confirmation-email.template`
Expected: FAIL.

- [ ] **Step 3: Implementation — confirmation template**

```ts
// src/infrastructure/email/templates/confirmation-email.template.ts
import { Subscription } from '../../../domain/subscription/subscription.entity';
import { EmailMessage } from '../../../application/ports/email.sender.port';
import { AppUrlBuilder } from '../app-url-builder';

export class ConfirmationEmailTemplate {
  constructor(private readonly urls: AppUrlBuilder) {}

  render(subscription: Subscription, repository: string): EmailMessage {
    const confirmationUrl = this.urls.webPath(`/confirm/${subscription.confirmationToken}`);
    const unsubscribeUrl = this.urls.webPath(`/unsubscribe/${subscription.unsubscribeToken}`);

    return {
      to: subscription.email,
      subject: `Confirm subscription for ${repository}`,
      text: `Hello!\n\nPlease confirm your subscription for ${repository} release notifications:\n${confirmationUrl}\n\nIf you did not request this, you can unsubscribe here:\n${unsubscribeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2c3e50;">Confirm subscription</h2>
          <p>Please confirm your subscription for <b>${repository}</b> release notifications.</p>
          <p>
            <a href="${confirmationUrl}" style="background-color: #27ae60; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Confirm subscription
            </a>
          </p>
          <p style="margin-top: 20px;">If you did not request this, you can unsubscribe:
            <a href="${unsubscribeUrl}">${unsubscribeUrl}</a>
          </p>
        </div>
      `,
    };
  }
}
```

- [ ] **Step 4: Failing test for release template**

```ts
import { ReleaseEmailTemplate } from '../../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../../src/infrastructure/email/app-url-builder';

describe('ReleaseEmailTemplate', () => {
  it('renders release URL and unsubscribe link', () => {
    const tpl = new ReleaseEmailTemplate(new AppUrlBuilder('http://x'));
    const msg = tpl.render({
      to: 'a@b.c',
      repository: 'owner/repo',
      version: 'v2',
      unsubscribeToken: 'UNSUB',
    });

    expect(msg.subject).toContain('v2');
    expect(msg.text).toContain('https://github.com/owner/repo/releases/tag/v2');
    expect(msg.text).toContain('http://x/web/unsubscribe/UNSUB');
  });
});
```

- [ ] **Step 5: Run — expect fail**

Run: `npm test -- release-email.template`
Expected: FAIL.

- [ ] **Step 6: Implementation — release template**

```ts
// src/infrastructure/email/templates/release-email.template.ts
import { EmailMessage } from '../../../application/ports/email.sender.port';
import { AppUrlBuilder } from '../app-url-builder';

export interface ReleaseEmailInput {
  to: string;
  repository: string;
  version: string;
  unsubscribeToken: string;
}

export class ReleaseEmailTemplate {
  constructor(private readonly urls: AppUrlBuilder) {}

  render(input: ReleaseEmailInput): EmailMessage {
    const releaseUrl = `https://github.com/${input.repository}/releases/tag/${input.version}`;
    const unsubscribeUrl = this.urls.webPath(`/unsubscribe/${input.unsubscribeToken}`);

    return {
      to: input.to,
      subject: `New release in ${input.repository}: ${input.version}`,
      text: `Hello!\n\nA new version has just been released in the ${input.repository} repository: ${input.version}.\n\nView release: ${releaseUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2c3e50;">New Release!</h2>
          <p>Version <strong style="color: #27ae60;">${input.version}</strong> has just been released in the <b>${input.repository}</b> repository.</p>
          <p>
            <a href="${releaseUrl}" style="background-color: #2980b9; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View on GitHub
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;" />
          <small style="color: #999;">You received this email because you subscribed to notifications via GitHub Notifier.</small>
          <br />
          <small style="color: #999;">Unsubscribe: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></small>
        </div>
      `,
    };
  }
}
```

- [ ] **Step 7: Run — expect pass**

Run: `npm test -- email/templates`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/email/templates \
        tests/unit/infrastructure/email/templates
git commit -m "refactor(email): split templates into per-message classes"
```

---

### Task 3.9: NodemailerEmailSender

**Files:**
- Create: `src/infrastructure/email/nodemailer.sender.ts`
- Test: `tests/unit/infrastructure/email/nodemailer.sender.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { NodemailerEmailSender } from '../../../../src/infrastructure/email/nodemailer.sender';
import { AppError } from '../../../../src/domain/errors';

describe('NodemailerEmailSender', () => {
  it('calls transporter.sendMail with from + message', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new NodemailerEmailSender({ sendMail } as never, 'sender@x');

    await sender.send({ to: 'a@b.c', subject: 's', text: 't', html: '<p>h</p>' });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"GitHub Release Notifier" <sender@x>',
      to: 'a@b.c',
      subject: 's',
      text: 't',
      html: '<p>h</p>',
    }));
  });

  it('wraps transport errors in AppError', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP down'));
    const sender = new NodemailerEmailSender({ sendMail } as never, 'sender@x');
    await expect(
      sender.send({ to: 'a@b.c', subject: 's', text: 't', html: 'h' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- nodemailer.sender`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/infrastructure/email/nodemailer.sender.ts
import nodemailer, { Transporter } from 'nodemailer';
import { EmailMessage, EmailSenderPort } from '../../application/ports/email.sender.port';
import { AppError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';

export const createNodemailerTransport = (
  user: string,
  pass: string,
): Transporter => nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass },
});

export class NodemailerEmailSender implements EmailSenderPort {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"GitHub Release Notifier" <${this.from}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Failed to send email to ${message.to}: ${reason}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- nodemailer.sender`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/email/nodemailer.sender.ts \
        tests/unit/infrastructure/email/nodemailer.sender.spec.ts
git commit -m "refactor(email): add NodemailerEmailSender implementing EmailSenderPort"
```

---

### Task 3.10: GitHubHttpClient (with cache + http)

**Files:**
- Create: `src/infrastructure/github/github-cache-keys.ts` (copy unchanged from `src/modules/github/github.cache-keys.ts`)
- Create: `src/infrastructure/github/github-http.client.ts`
- Test: `tests/unit/infrastructure/github/github-http.client.spec.ts`

- [ ] **Step 1: Copy cache-keys file**

Copy `src/modules/github/github.cache-keys.ts` to `src/infrastructure/github/github-cache-keys.ts` verbatim.

- [ ] **Step 2: Failing test**

```ts
import { GitHubHttpClient } from '../../../../src/infrastructure/github/github-http.client';
import { CachePort } from '../../../../src/application/ports/cache.port';
import { HttpClientPort } from '../../../../src/application/ports/http-client.port';
import { LoggerPort } from '../../../../src/application/ports/logger.port';
import { NotFoundError, RateLimitError, AppError } from '../../../../src/domain/errors';
import { HttpStatus } from '../../../../src/common/constants/http-status.constants';

const silentLogger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('GitHubHttpClient', () => {
  let cache: CachePort;
  let http: HttpClientPort;
  beforeEach(() => {
    cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined) };
    http = { request: jest.fn() };
  });

  it('repoExists returns true on 200', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).resolves.toBe(true);
  });

  it('repoExists returns false on NotFoundError', async () => {
    (http.request as jest.Mock).mockRejectedValue(new NotFoundError());
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).resolves.toBe(false);
  });

  it('maps 403 "rate limit" AppError to RateLimitError', async () => {
    (http.request as jest.Mock).mockRejectedValue(
      new AppError(HttpStatus.FORBIDDEN, 'API rate limit exceeded for ...'),
    );
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('returns cached value when present', async () => {
    (cache.getJson as jest.Mock).mockResolvedValue({ tag_name: 'v1' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('a/b')).resolves.toBe('v1');
    expect(http.request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `npm test -- github-http.client`
Expected: FAIL.

- [ ] **Step 4: Implementation**

```ts
// src/infrastructure/github/github-http.client.ts
import { GitHubClientPort } from '../../application/ports/github.client.port';
import { CachePort } from '../../application/ports/cache.port';
import { HttpClientPort } from '../../application/ports/http-client.port';
import { LoggerPort } from '../../application/ports/logger.port';
import { AppError, NotFoundError, RateLimitError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { githubReleaseSchema, GitHubReleaseResponse } from '../../modules/github/github.schema';
import { getGitHubCacheKey } from './github-cache-keys';

const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

interface GitHubHttpClientConfig {
  token?: string;
  cacheTtlSeconds: number;
}

const isGitHubRateLimitError = (error: unknown): boolean =>
  error instanceof AppError &&
  error.statusCode === HttpStatus.FORBIDDEN &&
  error.message.toLowerCase().includes('rate limit');

export class GitHubHttpClient implements GitHubClientPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly cache: CachePort,
    private readonly logger: LoggerPort,
    private readonly config: GitHubHttpClientConfig,
  ) {}

  async repoExists(repository: string): Promise<boolean> {
    try {
      await this.fetchWithCache<unknown>(repository);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }

  async getLatestReleaseTag(repository: string): Promise<string | null> {
    try {
      const data = await this.fetchWithCache<GitHubReleaseResponse>(
        `${repository}/releases/latest`,
      );
      return githubReleaseSchema.parse(data).tag_name;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  private headers(): Record<string, string> {
    return this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {};
  }

  private async fetchWithCache<T>(path: string): Promise<T> {
    const normalizedPath = path.replace(/^\/+/, '');
    const cacheKey = getGitHubCacheKey(normalizedPath);

    try {
      if (cacheKey) {
        try {
          const cached = await this.cache.getJson<T>(cacheKey);
          if (cached !== null) return cached;
        } catch (cacheError) {
          this.logger.error({ cacheKey, err: cacheError }, '[GitHub] Failed to read cache');
        }
      }

      const response = await this.http.request<T>(
        `${GITHUB_API_BASE_URL}/${normalizedPath}`,
        { headers: this.headers() },
      );

      if (cacheKey) {
        try {
          await this.cache.setJson(cacheKey, response, this.config.cacheTtlSeconds);
        } catch (cacheError) {
          this.logger.error({ cacheKey, err: cacheError }, '[GitHub] Failed to write cache');
        }
      }

      return response;
    } catch (error) {
      if (isGitHubRateLimitError(error)) throw new RateLimitError();
      throw error;
    }
  }
}
```

> The import of `github.schema` from `modules/github` is intentional during the migration; in Phase 9 we move the schema next to its consumer (`src/infrastructure/github/github.schema.ts`) and delete the old folder.

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- github-http.client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/github tests/unit/infrastructure/github
git commit -m "refactor(github): add GitHubHttpClient adapter (CachePort + HttpClientPort)"
```

---

### Task 3.11: NodeCronScheduler

**Files:** Create `src/infrastructure/scheduler/node-cron.scheduler.ts`

- [ ] **Step 1: Implementation**

```ts
// src/infrastructure/scheduler/node-cron.scheduler.ts
import cron, { ScheduledTask } from 'node-cron';
import { SchedulerPort } from '../../application/ports/scheduler.port';
import { LoggerPort } from '../../application/ports/logger.port';

export class NodeCronScheduler implements SchedulerPort {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly expression: string,
    private readonly logger: LoggerPort,
  ) {}

  schedule(work: () => Promise<void> | void): void {
    this.task = cron.schedule(this.expression, async () => {
      this.logger.info(`[Scheduler] Tick at ${new Date().toISOString()}`);
      try { await work(); }
      catch (error) { this.logger.error({ err: error }, '[Scheduler] Task threw'); }
    });
    this.logger.info(`[Scheduler] Initialized (${this.expression})`);
  }

  async stop(): Promise<void> {
    if (!this.task) return;
    await this.task.stop();
    this.task = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/infrastructure/scheduler/node-cron.scheduler.ts
git commit -m "refactor(scheduler): add NodeCronScheduler implementing SchedulerPort"
```

---

## Phase 4 — Application layer

### Task 4.1: Subscription entity

**Files:**
- Create: `src/domain/subscription/subscription.entity.ts`
- Test: `tests/unit/domain/subscription/subscription.entity.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { Subscription } from '../../../../src/domain/subscription/subscription.entity';
import { BadRequestError } from '../../../../src/domain/errors';

describe('Subscription.confirm', () => {
  it('returns a new instance with confirmed=true', () => {
    const sub = new Subscription('id', 'a@b.c', 'r1', 'c-tok', 'u-tok', false);
    const confirmed = sub.confirm();
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.id).toBe('id');
    expect(sub.confirmed).toBe(false); // immutability
  });

  it('throws BadRequestError when already confirmed', () => {
    const sub = new Subscription('id', 'a@b.c', 'r1', 'c-tok', 'u-tok', true);
    expect(() => sub.confirm()).toThrow(BadRequestError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- subscription.entity`
Expected: FAIL.

- [ ] **Step 3: Entity**

```ts
// src/domain/subscription/subscription.entity.ts
import { BadRequestError } from '../errors';

export class Subscription {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly repositoryId: string,
    public readonly confirmationToken: string,
    public readonly unsubscribeToken: string,
    public readonly confirmed: boolean,
  ) {}

  confirm(): Subscription {
    if (this.confirmed) throw new BadRequestError('Token already used');
    return new Subscription(
      this.id, this.email, this.repositoryId,
      this.confirmationToken, this.unsubscribeToken, true,
    );
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- subscription.entity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/subscription tests/unit/domain
git commit -m "feat(domain): add Subscription entity with confirm() invariant"
```

---

### Task 4.2: Test fakes (shipped now so Phase 4 use case tests can rely on them)

**Files:**
- Create: `tests/fakes/in-memory-subscription.repository.ts`, `in-memory-repository.repository.ts`, `fake-github.client.ts`, `fake-email.sender.ts`, `fake-cache.ts`, `silent.logger.ts`, `fixed.clock.ts`

- [ ] **Step 1: `tests/fakes/silent.logger.ts`**

```ts
import { LoggerPort } from '../../src/application/ports/logger.port';

export class SilentLogger implements LoggerPort {
  info(): void {} warn(): void {} error(): void {}
}
```

- [ ] **Step 2: `tests/fakes/fixed.clock.ts`**

```ts
import { ClockPort } from '../../src/application/ports/clock.port';
export class FixedClock implements ClockPort {
  constructor(private readonly value: Date = new Date('2026-01-01T00:00:00Z')) {}
  now(): Date { return this.value; }
}
```

- [ ] **Step 3: `tests/fakes/fake-cache.ts`**

```ts
import { CachePort } from '../../src/application/ports/cache.port';
export class FakeCache implements CachePort {
  private store = new Map<string, string>();
  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async setJson<T>(key: string, value: T, _ttl: number): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
}
```

- [ ] **Step 4: `tests/fakes/fake-github.client.ts`**

```ts
import { GitHubClientPort } from '../../src/application/ports/github.client.port';

export class FakeGitHubClient implements GitHubClientPort {
  constructor(
    private readonly state: { exists?: boolean; latestTag?: string | null } = {},
  ) {}
  async repoExists(_full: string): Promise<boolean> {
    return this.state.exists ?? true;
  }
  async getLatestReleaseTag(_full: string): Promise<string | null> {
    return this.state.latestTag ?? null;
  }
}
```

- [ ] **Step 5: `tests/fakes/fake-email.sender.ts`**

```ts
import { EmailMessage, EmailSenderPort } from '../../src/application/ports/email.sender.port';

export class FakeEmailSender implements EmailSenderPort {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> { this.sent.push(message); }
}

export class FailingEmailSender implements EmailSenderPort {
  async send(_: EmailMessage): Promise<void> { throw new Error('SMTP down'); }
}
```

- [ ] **Step 6: `tests/fakes/in-memory-subscription.repository.ts`**

```ts
import { randomUUID } from 'node:crypto';
import {
  CreateSubscriptionInput,
  SubscriptionRepositoryPort,
} from '../../src/application/ports/subscription.repository.port';
import { Subscription } from '../../src/domain/subscription/subscription.entity';
import { SubscriptionWithRepository } from '../../src/common/types/subscription-with-repository.type';

interface RepositoryRow { id: string; fullName: string; lastSeenTag: string | null; createdAt: Date; }

export class InMemorySubscriptionRepository implements SubscriptionRepositoryPort {
  private byId = new Map<string, Subscription>();
  constructor(private readonly repositoriesByName: Map<string, RepositoryRow> = new Map()) {}

  all(): Subscription[] { return [...this.byId.values()]; }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const exists = [...this.byId.values()].some(
      s => s.email === input.email && s.repositoryId === input.repositoryId,
    );
    if (exists) {
      const { ConflictError } = await import('../../src/domain/errors');
      throw new ConflictError('Email already subscribed to this repository');
    }
    const sub = new Subscription(
      randomUUID(), input.email, input.repositoryId, randomUUID(), randomUUID(), false,
    );
    this.byId.set(sub.id, sub);
    return sub;
  }

  async findByConfirmationToken(token: string): Promise<Subscription | null> {
    return [...this.byId.values()].find(s => s.confirmationToken === token) ?? null;
  }

  async markConfirmed(id: string): Promise<void> {
    const found = this.byId.get(id);
    if (!found) return;
    this.byId.set(id, found.confirm());
  }

  async deleteByUnsubscribeToken(token: string): Promise<boolean> {
    const target = [...this.byId.values()].find(s => s.unsubscribeToken === token);
    if (!target) return false;
    this.byId.delete(target.id);
    return true;
  }

  async deleteById(id: string): Promise<void> { this.byId.delete(id); }

  async findConfirmedByEmail(email: string): Promise<SubscriptionWithRepository[]> {
    return [...this.byId.values()]
      .filter(s => s.email === email && s.confirmed)
      .map(s => {
        const repo = [...this.repositoriesByName.values()].find(r => r.id === s.repositoryId)
          ?? { id: s.repositoryId, fullName: 'unknown', lastSeenTag: null, createdAt: new Date() };
        return {
          id: s.id, email: s.email, confirmed: s.confirmed,
          repositoryId: s.repositoryId,
          confirmationToken: s.confirmationToken, unsubscribeToken: s.unsubscribeToken,
          createdAt: new Date(),
          repository: repo,
        } as SubscriptionWithRepository;
      });
  }
}
```

- [ ] **Step 7: `tests/fakes/in-memory-repository.repository.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/generated/prisma/client';
import { RepositoryRepositoryPort } from '../../src/application/ports/repository.repository.port';
import { RepositoryWithSubscriptions } from '../../src/common/types/repository-with-subscriptions.type';

export class InMemoryRepositoryRepository implements RepositoryRepositoryPort {
  readonly byName = new Map<string, Repository>();
  readonly activeOverride: RepositoryWithSubscriptions[] = [];
  readonly tagUpdates: { id: string; tag: string }[] = [];

  async getOrCreate(fullName: string): Promise<Repository> {
    const existing = this.byName.get(fullName);
    if (existing) return existing;
    const created: Repository = {
      id: randomUUID(), fullName, lastSeenTag: null, createdAt: new Date(),
    };
    this.byName.set(fullName, created);
    return created;
  }

  async listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]> {
    return this.activeOverride;
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    this.tagUpdates.push({ id, tag });
    for (const repo of this.byName.values()) {
      if (repo.id === id) repo.lastSeenTag = tag;
    }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add tests/fakes
git commit -m "test(fakes): add in-memory ports for use-case tests"
```

---

### Task 4.3: SubscribeUseCase

**Files:**
- Create: `src/application/subscription/subscribe.use-case.ts`
- Test: `tests/unit/application/subscription/subscribe.use-case.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { SubscribeUseCase } from '../../../../src/application/subscription/subscribe.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { InMemoryRepositoryRepository } from '../../../fakes/in-memory-repository.repository';
import { FakeGitHubClient } from '../../../fakes/fake-github.client';
import { FakeEmailSender, FailingEmailSender } from '../../../fakes/fake-email.sender';
import { SilentLogger } from '../../../fakes/silent.logger';
import { ConfirmationEmailTemplate } from '../../../../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';
import { NotFoundError } from '../../../../src/domain/errors';

const tpl = () => new ConfirmationEmailTemplate(new AppUrlBuilder('http://x'));

describe('SubscribeUseCase', () => {
  it('throws NotFoundError if GitHub says repo does not exist', async () => {
    const useCase = new SubscribeUseCase(
      new InMemorySubscriptionRepository(),
      new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: false }),
      new FakeEmailSender(),
      tpl(),
      new SilentLogger(),
    );
    await expect(useCase.execute({ email: 'a@b.c', repo: 'x/y' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sends a confirmation email on the happy path', async () => {
    const email = new FakeEmailSender();
    const subs = new InMemorySubscriptionRepository();
    const useCase = new SubscribeUseCase(
      subs, new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: true }),
      email, tpl(), new SilentLogger(),
    );
    await useCase.execute({ email: 'a@b.c', repo: 'x/y' });
    expect(subs.all()).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe('a@b.c');
  });

  it('deletes the subscription if email send fails', async () => {
    const subs = new InMemorySubscriptionRepository();
    const useCase = new SubscribeUseCase(
      subs, new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: true }),
      new FailingEmailSender(), tpl(), new SilentLogger(),
    );
    await expect(useCase.execute({ email: 'a@b.c', repo: 'x/y' })).rejects.toThrow();
    expect(subs.all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- subscribe.use-case`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/application/subscription/subscribe.use-case.ts
import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { RepositoryRepositoryPort } from '../ports/repository.repository.port';
import { GitHubClientPort } from '../ports/github.client.port';
import { EmailSenderPort } from '../ports/email.sender.port';
import { LoggerPort } from '../ports/logger.port';
import { NotFoundError } from '../../domain/errors';
import { ConfirmationEmailTemplate } from '../../infrastructure/email/templates/confirmation-email.template';

export interface SubscribeInput { email: string; repo: string; }

export class SubscribeUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepositoryPort,
    private readonly repositories: RepositoryRepositoryPort,
    private readonly github: GitHubClientPort,
    private readonly email: EmailSenderPort,
    private readonly confirmationTemplate: ConfirmationEmailTemplate,
    private readonly logger: LoggerPort,
  ) {}

  async execute(input: SubscribeInput): Promise<void> {
    if (!(await this.github.repoExists(input.repo))) {
      throw new NotFoundError('Repository not found on GitHub');
    }
    const repository = await this.repositories.getOrCreate(input.repo);
    const subscription = await this.subscriptions.create({
      email: input.email,
      repositoryId: repository.id,
    });

    try {
      await this.email.send(this.confirmationTemplate.render(subscription, input.repo));
    } catch (error) {
      await this.subscriptions.deleteById(subscription.id);
      this.logger.error({ err: error, email: input.email }, '[Subscribe] Rolled back subscription after email failure');
      throw error;
    }
  }
}
```

> **Note (DIP):** `SubscribeUseCase` imports `ConfirmationEmailTemplate` from `infrastructure/`. This is the one allowed exception in the spec — templates are concrete classes used as collaborators. If you'd rather keep `application/` import-clean, hoist `ConfirmationEmailTemplate` into a port in a follow-up. Out of scope for this plan.

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- subscribe.use-case`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/subscription/subscribe.use-case.ts \
        tests/unit/application/subscription/subscribe.use-case.spec.ts
git commit -m "feat(application): add SubscribeUseCase"
```

---

### Task 4.4: ConfirmSubscriptionUseCase

**Files:**
- Create: `src/application/subscription/confirm-subscription.use-case.ts`
- Test: `tests/unit/application/subscription/confirm-subscription.use-case.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { ConfirmSubscriptionUseCase } from '../../../../src/application/subscription/confirm-subscription.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { NotFoundError, BadRequestError } from '../../../../src/domain/errors';

describe('ConfirmSubscriptionUseCase', () => {
  it('throws NotFoundError when token is unknown', async () => {
    const useCase = new ConfirmSubscriptionUseCase(new InMemorySubscriptionRepository());
    await expect(useCase.execute({ token: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks subscription confirmed', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    const useCase = new ConfirmSubscriptionUseCase(subs);

    await useCase.execute({ token: created.confirmationToken });

    const found = await subs.findByConfirmationToken(created.confirmationToken);
    expect(found?.confirmed).toBe(true);
  });

  it('throws BadRequestError when already confirmed (delegates to entity invariant)', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    await subs.markConfirmed(created.id);
    const useCase = new ConfirmSubscriptionUseCase(subs);
    await expect(useCase.execute({ token: created.confirmationToken })).rejects.toBeInstanceOf(BadRequestError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- confirm-subscription.use-case`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/application/subscription/confirm-subscription.use-case.ts
import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { NotFoundError } from '../../domain/errors';

export interface ConfirmInput { token: string; }

export class ConfirmSubscriptionUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ token }: ConfirmInput): Promise<void> {
    const subscription = await this.subscriptions.findByConfirmationToken(token);
    if (!subscription) throw new NotFoundError('Token not found');

    subscription.confirm(); // enforces the invariant; throws BadRequestError if already confirmed
    await this.subscriptions.markConfirmed(subscription.id);
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- confirm-subscription.use-case`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/subscription/confirm-subscription.use-case.ts \
        tests/unit/application/subscription/confirm-subscription.use-case.spec.ts
git commit -m "feat(application): add ConfirmSubscriptionUseCase"
```

---

### Task 4.5: UnsubscribeUseCase

**Files:**
- Create: `src/application/subscription/unsubscribe.use-case.ts`
- Test: `tests/unit/application/subscription/unsubscribe.use-case.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { UnsubscribeUseCase } from '../../../../src/application/subscription/unsubscribe.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { NotFoundError } from '../../../../src/domain/errors';

describe('UnsubscribeUseCase', () => {
  it('removes the subscription matching the token', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    const useCase = new UnsubscribeUseCase(subs);

    await useCase.execute({ token: created.unsubscribeToken });

    expect(subs.all()).toEqual([]);
  });

  it('throws NotFoundError if no subscription has that token', async () => {
    const useCase = new UnsubscribeUseCase(new InMemorySubscriptionRepository());
    await expect(useCase.execute({ token: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- unsubscribe.use-case`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/application/subscription/unsubscribe.use-case.ts
import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { NotFoundError } from '../../domain/errors';

export interface UnsubscribeInput { token: string; }

export class UnsubscribeUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ token }: UnsubscribeInput): Promise<void> {
    const removed = await this.subscriptions.deleteByUnsubscribeToken(token);
    if (!removed) throw new NotFoundError('Token not found');
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- unsubscribe.use-case`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/subscription/unsubscribe.use-case.ts \
        tests/unit/application/subscription/unsubscribe.use-case.spec.ts
git commit -m "feat(application): add UnsubscribeUseCase"
```

---

### Task 4.6: ListSubscriptionsUseCase

**Files:**
- Create: `src/application/subscription/list-subscriptions.use-case.ts`
- Test: `tests/unit/application/subscription/list-subscriptions.use-case.spec.ts`

- [ ] **Step 1: Failing test**

```ts
import { ListSubscriptionsUseCase } from '../../../../src/application/subscription/list-subscriptions.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';

describe('ListSubscriptionsUseCase', () => {
  it('returns only confirmed subscriptions for the given email', async () => {
    const subs = new InMemorySubscriptionRepository();
    const a = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    await subs.create({ email: 'a@b.c', repositoryId: 'r2' });
    await subs.markConfirmed(a.id);
    const useCase = new ListSubscriptionsUseCase(subs);

    const result = await useCase.execute({ email: 'a@b.c' });

    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- list-subscriptions.use-case`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/application/subscription/list-subscriptions.use-case.ts
import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export interface ListSubscriptionsInput { email: string; }

export class ListSubscriptionsUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ email }: ListSubscriptionsInput): Promise<SubscriptionWithRepository[]> {
    return this.subscriptions.findConfirmedByEmail(email);
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- list-subscriptions.use-case`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/subscription/list-subscriptions.use-case.ts \
        tests/unit/application/subscription/list-subscriptions.use-case.spec.ts
git commit -m "feat(application): add ListSubscriptionsUseCase"
```

---

### Task 4.7: NotifyRepositorySubscribersUseCase + CheckReleasesUseCase

**Files:**
- Create: `src/application/scanner/notify-repository-subscribers.use-case.ts`, `src/application/scanner/check-releases.use-case.ts`
- Test: `tests/unit/application/scanner/notify-repository-subscribers.use-case.spec.ts`, `check-releases.use-case.spec.ts`

- [ ] **Step 1: Failing test — notify**

```ts
import { NotifyRepositorySubscribersUseCase } from '../../../../src/application/scanner/notify-repository-subscribers.use-case';
import { FakeEmailSender } from '../../../fakes/fake-email.sender';
import { ReleaseEmailTemplate } from '../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';
import { SilentLogger } from '../../../fakes/silent.logger';

const tpl = () => new ReleaseEmailTemplate(new AppUrlBuilder('http://x'));

describe('NotifyRepositorySubscribersUseCase', () => {
  it('returns true when all subscribers succeed', async () => {
    const sender = new FakeEmailSender();
    const useCase = new NotifyRepositorySubscribersUseCase(sender, tpl(), new SilentLogger());

    const ok = await useCase.execute({
      repository: 'owner/repo',
      version: 'v1',
      subscribers: [
        { email: 'a@b.c', unsubscribeToken: 't1' },
        { email: 'c@d.e', unsubscribeToken: 't2' },
      ],
    });

    expect(ok).toBe(true);
    expect(sender.sent).toHaveLength(2);
  });

  it('returns false when any subscriber fails', async () => {
    let calls = 0;
    const sender = { send: jest.fn(async () => { calls++; if (calls === 2) throw new Error('boom'); }) };
    const useCase = new NotifyRepositorySubscribersUseCase(sender as never, tpl(), new SilentLogger());

    const ok = await useCase.execute({
      repository: 'owner/repo',
      version: 'v1',
      subscribers: [
        { email: 'a@b.c', unsubscribeToken: 't1' },
        { email: 'c@d.e', unsubscribeToken: 't2' },
      ],
    });

    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- notify-repository-subscribers`
Expected: FAIL.

- [ ] **Step 3: Implementation — notify**

```ts
// src/application/scanner/notify-repository-subscribers.use-case.ts
import { EmailSenderPort } from '../ports/email.sender.port';
import { LoggerPort } from '../ports/logger.port';
import { ReleaseEmailTemplate } from '../../infrastructure/email/templates/release-email.template';

export interface NotifyInput {
  repository: string;
  version: string;
  subscribers: { email: string; unsubscribeToken: string }[];
}

export class NotifyRepositorySubscribersUseCase {
  constructor(
    private readonly email: EmailSenderPort,
    private readonly template: ReleaseEmailTemplate,
    private readonly logger: LoggerPort,
  ) {}

  async execute(input: NotifyInput): Promise<boolean> {
    let allOk = true;
    for (const sub of input.subscribers) {
      try {
        await this.email.send(this.template.render({
          to: sub.email,
          repository: input.repository,
          version: input.version,
          unsubscribeToken: sub.unsubscribeToken,
        }));
      } catch (error) {
        allOk = false;
        this.logger.error(
          { email: sub.email, repository: input.repository, err: error },
          '[Scanner] Failed to notify subscriber',
        );
      }
    }
    return allOk;
  }
}
```

- [ ] **Step 4: Failing test — check-releases**

```ts
import { CheckReleasesUseCase } from '../../../../src/application/scanner/check-releases.use-case';
import { InMemoryRepositoryRepository } from '../../../fakes/in-memory-repository.repository';
import { FakeGitHubClient } from '../../../fakes/fake-github.client';
import { FakeEmailSender } from '../../../fakes/fake-email.sender';
import { SilentLogger } from '../../../fakes/silent.logger';
import { NotifyRepositorySubscribersUseCase } from '../../../../src/application/scanner/notify-repository-subscribers.use-case';
import { ReleaseEmailTemplate } from '../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';

const buildUseCase = (overrides: Parameters<typeof build>[0] = {}) => build(overrides);

function build(o: {
  latestTag?: string | null;
  active?: Awaited<ReturnType<InMemoryRepositoryRepository['listActiveWithSubscribers']>>;
}) {
  const repos = new InMemoryRepositoryRepository();
  if (o.active) repos.activeOverride.push(...o.active);
  const github = new FakeGitHubClient({ latestTag: o.latestTag ?? null });
  const sender = new FakeEmailSender();
  const notify = new NotifyRepositorySubscribersUseCase(
    sender, new ReleaseEmailTemplate(new AppUrlBuilder('http://x')), new SilentLogger(),
  );
  const useCase = new CheckReleasesUseCase(repos, github, notify, new SilentLogger());
  return { useCase, repos, sender };
}

describe('CheckReleasesUseCase', () => {
  it('skips when latest tag is null or unchanged', async () => {
    const { useCase, repos } = buildUseCase({
      latestTag: 'v1',
      active: [{
        id: 'r1', fullName: 'owner/repo', lastSeenTag: 'v1', createdAt: new Date(),
        subscriptions: [],
      } as never],
    });
    await useCase.execute();
    expect(repos.tagUpdates).toEqual([]);
  });

  it('updates lastSeenTag when notifications succeed', async () => {
    const { useCase, repos, sender } = buildUseCase({
      latestTag: 'v2',
      active: [{
        id: 'r1', fullName: 'owner/repo', lastSeenTag: 'v1', createdAt: new Date(),
        subscriptions: [
          { id: 's1', email: 'a@b.c', confirmed: true, repositoryId: 'r1',
            confirmationToken: 'c', unsubscribeToken: 'u', createdAt: new Date() },
        ],
      } as never],
    });
    await useCase.execute();
    expect(sender.sent).toHaveLength(1);
    expect(repos.tagUpdates).toEqual([{ id: 'r1', tag: 'v2' }]);
  });
});
```

- [ ] **Step 5: Run — expect fail**

Run: `npm test -- check-releases.use-case`
Expected: FAIL.

- [ ] **Step 6: Implementation — check-releases**

```ts
// src/application/scanner/check-releases.use-case.ts
import { GitHubClientPort } from '../ports/github.client.port';
import { LoggerPort } from '../ports/logger.port';
import { RepositoryRepositoryPort } from '../ports/repository.repository.port';
import { NotifyRepositorySubscribersUseCase } from './notify-repository-subscribers.use-case';
import { RateLimitError } from '../../domain/errors';

export class CheckReleasesUseCase {
  constructor(
    private readonly repositories: RepositoryRepositoryPort,
    private readonly github: GitHubClientPort,
    private readonly notify: NotifyRepositorySubscribersUseCase,
    private readonly logger: LoggerPort,
  ) {}

  async execute(): Promise<void> {
    const repositories = await this.repositories.listActiveWithSubscribers();

    for (const repo of repositories) {
      try {
        const latestTag = await this.github.getLatestReleaseTag(repo.fullName);
        if (!latestTag || latestTag === repo.lastSeenTag) continue;

        const allOk = await this.notify.execute({
          repository: repo.fullName,
          version: latestTag,
          subscribers: repo.subscriptions.map(s => ({
            email: s.email, unsubscribeToken: s.unsubscribeToken,
          })),
        });

        if (!allOk) {
          this.logger.error(
            `[Scanner] Skipping lastSeenTag update for ${repo.fullName}: some emails failed`,
          );
          continue;
        }

        await this.repositories.updateLastSeenTag(repo.id, latestTag);
      } catch (error) {
        if (error instanceof RateLimitError) {
          this.logger.warn('[Scanner] GitHub rate limit hit. Pausing until next cycle.');
          break;
        }
        this.logger.error({ repository: repo.fullName, err: error }, '[Scanner] Failed');
      }
    }
  }
}
```

- [ ] **Step 7: Run — expect pass**

Run: `npm test -- scanner`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/application/scanner tests/unit/application/scanner
git commit -m "feat(application): add CheckReleasesUseCase + NotifyRepositorySubscribersUseCase"
```

---

## Phase 5 — Composition root + entry point

### Task 5.1: Schemas, types, constants — copy/move to stable locations

The schemas and the shared types (`SubscriptionWithRepository`, `RepositoryWithSubscriptions`, `HttpStatus`) are referenced by controllers and the error translators we still need to build. Keep them where they are (`src/common/...` and `src/modules/subscription/subscription.schema.ts`); we'll relocate at the end of Phase 9.

No file changes for this task — verification step only.

- [ ] **Step 1: Verify everything compiles after Phase 4**

Run: `npm run build && npm test`
Expected: build passes, all suites pass.

If any failure here, **stop and fix** — Phase 5+ assumes a green tree.

---

### Task 5.2: Composition root

**Files:** Create `src/composition-root.ts`

- [ ] **Step 1: Implementation**

```ts
// src/composition-root.ts
import type { Server as GrpcServer } from '@grpc/grpc-js';
import type { Application } from 'express';
import { config } from './config';

import { createPrismaClient } from './infrastructure/persistence/prisma.client';
import { PrismaSubscriptionRepository } from './infrastructure/persistence/prisma-subscription.repository';
import { PrismaRepositoryRepository } from './infrastructure/persistence/prisma-repository.repository';
import { FetchHttpClient } from './infrastructure/http/fetch.http-client';
import { NoopCache } from './infrastructure/cache/noop.cache';
import { RedisCache } from './infrastructure/cache/redis.cache';
import { PinoLogger } from './infrastructure/logging/pino.logger';
import { AppUrlBuilder } from './infrastructure/email/app-url-builder';
import { ConfirmationEmailTemplate } from './infrastructure/email/templates/confirmation-email.template';
import { ReleaseEmailTemplate } from './infrastructure/email/templates/release-email.template';
import { createNodemailerTransport, NodemailerEmailSender } from './infrastructure/email/nodemailer.sender';
import { GitHubHttpClient } from './infrastructure/github/github-http.client';
import { NodeCronScheduler } from './infrastructure/scheduler/node-cron.scheduler';

import { SubscribeUseCase } from './application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from './application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from './application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from './application/subscription/list-subscriptions.use-case';
import { NotifyRepositorySubscribersUseCase } from './application/scanner/notify-repository-subscribers.use-case';
import { CheckReleasesUseCase } from './application/scanner/check-releases.use-case';

import { SubscriptionController } from './presentation/http/controllers/subscription.controller';
import { ExceptionTranslatorRegistry } from './presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from './presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from './presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from './presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from './presentation/http/error-translators/fallback.translator';
import { buildHttpApp } from './presentation/http/http-app.factory';
import { buildGrpcServer } from './presentation/grpc/grpc.server';
import { GrpcExceptionTranslatorRegistry } from './presentation/grpc/error-translators/grpc-exception-translator.registry';
import { ZodGrpcExceptionTranslator } from './presentation/grpc/error-translators/zod.grpc-translator';
import { AppErrorGrpcTranslator } from './presentation/grpc/error-translators/app-error.grpc-translator';
import { FallbackGrpcExceptionTranslator } from './presentation/grpc/error-translators/fallback.grpc-translator';

export interface BuiltApp {
  httpApp: Application;
  startGrpcServer: () => Promise<GrpcServer>;
  scheduler: NodeCronScheduler;
}

export const buildApp = (): BuiltApp => {
  // infrastructure
  const logger      = new PinoLogger();
  const prisma      = createPrismaClient(config.DATABASE_URL);
  const httpClient  = new FetchHttpClient();
  const cache       = config.REDIS_URL ? new RedisCache(config.REDIS_URL, logger) : new NoopCache();
  const urls        = new AppUrlBuilder(config.APP_BASE_URL ?? `http://localhost:${config.PORT}`);
  const transporter = createNodemailerTransport(config.EMAIL_USER, config.EMAIL_PASS);
  const email       = new NodemailerEmailSender(transporter, config.EMAIL_USER);
  const github      = new GitHubHttpClient(httpClient, cache, logger,
    { token: config.GITHUB_TOKEN, cacheTtlSeconds: config.GITHUB_CACHE_TTL_SECONDS });
  const scheduler   = new NodeCronScheduler(config.RELEASE_CHECK_CRON, logger);

  // adapter → port
  const subscriptions = new PrismaSubscriptionRepository(prisma);
  const repositories  = new PrismaRepositoryRepository(prisma);
  const confirmationTpl = new ConfirmationEmailTemplate(urls);
  const releaseTpl      = new ReleaseEmailTemplate(urls);

  // application
  const subscribe   = new SubscribeUseCase(subscriptions, repositories, github, email, confirmationTpl, logger);
  const confirm     = new ConfirmSubscriptionUseCase(subscriptions);
  const unsubscribe = new UnsubscribeUseCase(subscriptions);
  const list        = new ListSubscriptionsUseCase(subscriptions);
  const notify      = new NotifyRepositorySubscribersUseCase(email, releaseTpl, logger);
  const checkReleases = new CheckReleasesUseCase(repositories, github, notify, logger);

  // presentation
  const subscriptionController = new SubscriptionController(subscribe, confirm, unsubscribe, list);
  const httpErrorRegistry = new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(config.NODE_ENV === 'development'),
  ]);
  const grpcErrorRegistry = new GrpcExceptionTranslatorRegistry([
    new ZodGrpcExceptionTranslator(),
    new AppErrorGrpcTranslator(),
    new FallbackGrpcExceptionTranslator(),
  ]);

  const httpApp = buildHttpApp({
    subscriptionController,
    errorRegistry: httpErrorRegistry,
    apiKey: config.API_KEY,
    logger,
  });

  const startGrpcServer = () => buildGrpcServer({
    subscriptionController, // gRPC will only use the underlying use cases via the controller's exposed methods (see grpc.handlers.ts)
    errorRegistry: grpcErrorRegistry,
    apiKey: config.API_KEY,
    logger,
    host: config.GRPC_HOST,
    port: config.GRPC_PORT,
  });

  scheduler.schedule(() => checkReleases.execute());

  return { httpApp, startGrpcServer, scheduler };
};
```

> **At this step the file will not yet compile** — the imports for presentation classes don't exist yet. We intentionally write the composition root first so the next phases have a target.

- [ ] **Step 2: Commit (do NOT build/test — Phase 6 will land the missing presentation classes)**

```bash
git add src/composition-root.ts
git commit -m "refactor: scaffold src/composition-root.ts (presentation classes follow in Phase 6)"
```

---

## Phase 6 — Presentation layer

### Task 6.1: SubscriptionController

**Files:**
- Create: `src/presentation/http/controllers/subscription.controller.ts`

- [ ] **Step 1: Implementation**

```ts
// src/presentation/http/controllers/subscription.controller.ts
import type { NextFunction, Request, Response } from 'express';
import { SubscribeUseCase } from '../../../application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../../application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../../../application/subscription/list-subscriptions.use-case';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../../../modules/subscription/subscription.schema';
import { toSubscriptionDto } from '../../../modules/subscription/subscription.mapper';

const SUBSCRIBE_OK = { message: 'Subscription successful. Confirmation email sent.' };
const CONFIRM_OK = { message: 'Subscription confirmed successfully' };
const UNSUBSCRIBE_OK = { message: 'Unsubscribed successfully' };

export class SubscriptionController {
  constructor(
    private readonly subscribe: SubscribeUseCase,
    private readonly confirm: ConfirmSubscriptionUseCase,
    private readonly unsubscribe: UnsubscribeUseCase,
    private readonly list: ListSubscriptionsUseCase,
  ) {}

  // expose the use cases for gRPC reuse
  get useCases() {
    return {
      subscribe: this.subscribe,
      confirm: this.confirm,
      unsubscribe: this.unsubscribe,
      list: this.list,
    } as const;
  }

  subscribeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = subscribeSchema.parse(req.body);
      await this.subscribe.execute(input);
      res.json(SUBSCRIBE_OK);
    } catch (e) { next(e); }
  };

  confirmHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.confirm.execute({ token });
      res.json(CONFIRM_OK);
    } catch (e) { next(e); }
  };

  unsubscribeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.unsubscribe.execute({ token });
      res.json(UNSUBSCRIBE_OK);
    } catch (e) { next(e); }
  };

  listHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = subscriptionsQuerySchema.parse(req.query);
      const subs = await this.list.execute({ email });
      res.json(subs.map(toSubscriptionDto));
    } catch (e) { next(e); }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/http/controllers/subscription.controller.ts
git commit -m "refactor(presentation): add SubscriptionController class"
```

---

### Task 6.2: API + Web router factories, middlewares, views

**Files:**
- Move (copy + import-fix): `src/common/middlewares/api-key.middleware.ts` → `src/presentation/http/middlewares/api-key.middleware.ts`
- Move (copy + import-fix): `src/common/middlewares/rate-limit.middleware.ts` → `src/presentation/http/middlewares/rate-limit.middleware.ts`
- Move: `src/common/views/html.template.ts` → `src/presentation/http/views/html.template.ts`
- Move: `src/common/utils/web-error.util.ts` → `src/presentation/http/utils/web-error.util.ts`
- Create: `src/presentation/http/api.router.ts`, `src/presentation/http/web.router.ts`

- [ ] **Step 1: Move middlewares & views**

For each of the four files: copy to the new path, update its imports to point at `src/domain/errors`, `src/application/ports/logger.port` (none required), and the new `html.template` path. Leave the old paths as **re-export shims**:

`src/common/middlewares/api-key.middleware.ts` becomes:
```ts
// shim → presentation/http/middlewares/api-key.middleware
export * from '../../presentation/http/middlewares/api-key.middleware';
```
(Repeat for `rate-limit.middleware`, `html.template`, `web-error.util`.)

The new `api-key.middleware.ts` is identical except it imports `UnauthorizedError` from `../../../domain/errors`.

The new `web-error.util.ts` is identical except it imports `AppError` from `../../../domain/errors` and `renderHtmlMessage` from `../views/html.template`.

- [ ] **Step 2: api.router.ts**

```ts
// src/presentation/http/api.router.ts
import { Router } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { requireApiKey } from './middlewares/api-key.middleware';
import { prometheusMetricsMiddleware } from '../../common/metrics/prometheus';

export const buildApiRouter = (controller: SubscriptionController): Router => {
  const router = Router();
  router.use(prometheusMetricsMiddleware);
  router.use(requireApiKey);
  router.post('/subscribe', controller.subscribeHandler);
  router.get('/confirm/:token', controller.confirmHandler);
  router.get('/unsubscribe/:token', controller.unsubscribeHandler);
  router.get('/subscriptions', controller.listHandler);
  return router;
};
```

- [ ] **Step 3: web.router.ts**

```ts
// src/presentation/http/web.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { webSubscribeLimiter } from './middlewares/rate-limit.middleware';
import { renderHtmlMessage } from './views/html.template';
import { sendWebError } from './utils/web-error.util';

export const buildWebRouter = (controller: SubscriptionController): Router => {
  const router = Router();

  router.post('/subscribe', webSubscribeLimiter, controller.subscribeHandler);

  router.get('/confirm/:token', async (req: Request, res: Response) => {
    try {
      const { token } = require('../../modules/subscription/subscription.schema').tokenParamSchema.parse(req.params);
      await controller.useCases.confirm.execute({ token });
      res.send(renderHtmlMessage('Confirmed', 'Your subscription has been confirmed successfully.'));
    } catch (error) { sendWebError(res, error); }
  });

  router.get('/unsubscribe/:token', async (req: Request, res: Response) => {
    try {
      const { token } = require('../../modules/subscription/subscription.schema').tokenParamSchema.parse(req.params);
      await controller.useCases.unsubscribe.execute({ token });
      res.send(renderHtmlMessage('Unsubscribed', 'You have been successfully unsubscribed.'));
    } catch (error) { sendWebError(res, error); }
  });

  return router;
};
```

> Replace the `require(...)` calls with proper `import` statements when writing the file. The example uses `require` only for inline-readability — author with ES imports at top of file.

- [ ] **Step 4: Build + run integration tests**

Run: `npm run build && npm test -- integration`
Expected: build passes; integration tests may still pass against the legacy `app.ts` (we haven't switched the entrypoint yet).

- [ ] **Step 5: Commit**

```bash
git add src/presentation/http src/common/middlewares src/common/views src/common/utils/web-error.util.ts
git commit -m "refactor(presentation): move HTTP middlewares + views; add router factories"
```

---

### Task 6.3: http-app.factory.ts

**Files:** Create `src/presentation/http/http-app.factory.ts`

- [ ] **Step 1: Implementation**

```ts
// src/presentation/http/http-app.factory.ts
import path from 'node:path';
import express, { Application } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { buildApiRouter } from './api.router';
import { buildWebRouter } from './web.router';
import { buildErrorMiddleware } from './middlewares/error.middleware';
import { ExceptionTranslatorRegistry } from './error-translators/exception-translator.registry';
import { LoggerPort } from '../../application/ports/logger.port';
import { NotFoundError } from '../../domain/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
} from '../../common/metrics/prometheus';

export interface HttpAppDeps {
  subscriptionController: SubscriptionController;
  errorRegistry: ExceptionTranslatorRegistry;
  apiKey: string;
  logger: LoggerPort;
}

export const buildHttpApp = (deps: HttpAppDeps): Application => {
  initPrometheusMetrics();
  const app: Application = express();
  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/metrics', prometheusMetricsHandler);

  app.use('/api', buildApiRouter(deps.subscriptionController));
  app.use('/web', buildWebRouter(deps.subscriptionController));

  app.use((_req, _res, next) => next(new NotFoundError('API route not found')));
  app.use(buildErrorMiddleware(deps.errorRegistry, deps.logger));

  return app;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/presentation/http/http-app.factory.ts
git commit -m "refactor(presentation): add buildHttpApp factory"
```

---

### Task 6.4: gRPC server + handlers (rewritten)

**Files:**
- Move: `src/modules/grpc/grpc.types.ts` → `src/presentation/grpc/grpc.types.ts` (verbatim copy)
- Create: `src/presentation/grpc/grpc.handlers.ts`, `src/presentation/grpc/grpc.server.ts`

- [ ] **Step 1: Move grpc.types.ts** (with re-export shim left behind):

`src/modules/grpc/grpc.types.ts` becomes:
```ts
export * from '../../presentation/grpc/grpc.types';
```

- [ ] **Step 2: New grpc.handlers.ts**

```ts
// src/presentation/grpc/grpc.handlers.ts
import type * as grpc from '@grpc/grpc-js';
import { UnauthorizedError } from '../../domain/errors';
import { SubscriptionController } from '../http/controllers/subscription.controller';
import { GrpcExceptionTranslatorRegistry } from './error-translators/grpc-exception-translator.registry';
import { subscribeSchema, subscriptionsQuerySchema, tokenParamSchema } from '../../modules/subscription/subscription.schema';
import { toSubscriptionDto } from '../../modules/subscription/subscription.mapper';
import type {
  ConfirmRequest, GetSubscriptionsRequest, GetSubscriptionsResponse,
  OperationResponse, ReleaseNotifierHandlers, SubscribeRequest, UnsubscribeRequest,
} from './grpc.types';

const API_KEY_METADATA_KEY = 'x-api-key';

const ensureAuthorized = (metadata: grpc.Metadata, expected: string): void => {
  const raw = metadata.get(API_KEY_METADATA_KEY)[0];
  const provided = typeof raw === 'string' ? raw : undefined;
  if (!provided || provided !== expected) {
    throw new UnauthorizedError('Invalid API key');
  }
};

export interface BuildHandlersDeps {
  controller: SubscriptionController;
  errors: GrpcExceptionTranslatorRegistry;
  apiKey: string;
}

export const buildReleaseNotifierHandlers = (deps: BuildHandlersDeps): ReleaseNotifierHandlers => {
  const wrap = <TReq, TRes>(
    work: (req: TReq, metadata: grpc.Metadata) => Promise<TRes>,
  ): grpc.handleUnaryCall<TReq, TRes> => (call, callback) => {
    work(call.request, call.metadata)
      .then((result) => callback(null, result))
      .catch((error: unknown) => callback(deps.errors.translate(error)));
  };

  const useCases = deps.controller.useCases;

  return {
    subscribe: wrap<SubscribeRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const input = subscribeSchema.parse(req);
      await useCases.subscribe.execute(input);
      return { message: 'Subscription successful. Confirmation email sent.' };
    }),
    confirm: wrap<ConfirmRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const { token } = tokenParamSchema.parse({ token: req.token });
      await useCases.confirm.execute({ token });
      return { message: 'Subscription confirmed successfully' };
    }),
    unsubscribe: wrap<UnsubscribeRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const { token } = tokenParamSchema.parse({ token: req.token });
      await useCases.unsubscribe.execute({ token });
      return { message: 'Unsubscribed successfully' };
    }),
    getSubscriptions: wrap<GetSubscriptionsRequest, GetSubscriptionsResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const { email } = subscriptionsQuerySchema.parse({ email: req.email });
      const subs = await useCases.list.execute({ email });
      return { subscriptions: subs.map(toSubscriptionDto) };
    }),
  };
};
```

- [ ] **Step 3: New grpc.server.ts**

```ts
// src/presentation/grpc/grpc.server.ts
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { LoggerPort } from '../../application/ports/logger.port';
import { SubscriptionController } from '../http/controllers/subscription.controller';
import { GrpcExceptionTranslatorRegistry } from './error-translators/grpc-exception-translator.registry';
import { buildReleaseNotifierHandlers } from './grpc.handlers';
import type { LoadedGrpcObject, ReleaseNotifierGrpcPackage } from './grpc.types';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');
const LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
};

const loadPackage = (): ReleaseNotifierGrpcPackage => {
  const definition = protoLoader.loadSync(PROTO_PATH, LOADER_OPTIONS);
  const grpcObject = grpc.loadPackageDefinition(definition) as LoadedGrpcObject;
  if (!grpcObject.release_notifier?.ReleaseNotifier?.service) {
    throw new Error('Failed to load gRPC package release_notifier.ReleaseNotifier');
  }
  return grpcObject.release_notifier as unknown as ReleaseNotifierGrpcPackage;
};

export interface BuildGrpcServerDeps {
  subscriptionController: SubscriptionController;
  errorRegistry: GrpcExceptionTranslatorRegistry;
  apiKey: string;
  logger: LoggerPort;
  host: string;
  port: number;
}

export const buildGrpcServer = async (deps: BuildGrpcServerDeps): Promise<grpc.Server> => {
  const pkg = loadPackage();
  const server = new grpc.Server();

  server.addService(pkg.ReleaseNotifier.service, buildReleaseNotifierHandlers({
    controller: deps.subscriptionController,
    errors: deps.errorRegistry,
    apiKey: deps.apiKey,
  }));

  const address = `${deps.host}:${deps.port}`;

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) { reject(error); return; }
      deps.logger.info(`gRPC server is running on ${deps.host}:${port}`);
      resolve();
    });
  });

  return server;
};
```

- [ ] **Step 4: Commit**

```bash
git add src/presentation/grpc src/modules/grpc/grpc.types.ts
git commit -m "refactor(grpc): rewrite handlers + server with DI wiring"
```

---

## Phase 7 — Error translators

### Task 7.1: HTTP translator port + registry

**Files:**
- Create: `src/presentation/http/error-translators/exception-translator.port.ts`, `exception-translator.registry.ts`

- [ ] **Step 1: Port**

```ts
// src/presentation/http/error-translators/exception-translator.port.ts
export interface HttpErrorResponse { status: number; body: Record<string, unknown>; }

export interface ExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): HttpErrorResponse;
}
```

- [ ] **Step 2: Registry**

```ts
// src/presentation/http/error-translators/exception-translator.registry.ts
import { ExceptionTranslator, HttpErrorResponse } from './exception-translator.port';

export class ExceptionTranslatorRegistry {
  constructor(private readonly translators: ExceptionTranslator[]) {}
  translate(error: unknown): HttpErrorResponse {
    const translator = this.translators.find((t) => t.canHandle(error));
    if (!translator) {
      throw new Error('No exception translator could handle the error — add a fallback translator');
    }
    return translator.translate(error);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/presentation/http/error-translators
git commit -m "refactor(errors): add HTTP exception translator port + registry"
```

---

### Task 7.2: Individual HTTP translators

**Files:** Create the four translator classes.

- [ ] **Step 1: ZodExceptionTranslator**

```ts
// src/presentation/http/error-translators/zod.translator.ts
import { ZodError, ZodIssue } from 'zod';
import { ExceptionTranslator, HttpErrorResponse } from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

const issuePath = (issue: ZodIssue): string =>
  issue.path.length === 0 ? 'body' : issue.path.map(String).join('.');

export class ZodExceptionTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is ZodError { return error instanceof ZodError; }

  translate(error: ZodError): HttpErrorResponse {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        status: 'error',
        message: 'Validation failed',
        errors: error.issues.map((issue) => ({
          field: issuePath(issue), message: issue.message, code: issue.code,
        })),
      },
    };
  }
}
```

- [ ] **Step 2: PrismaExceptionTranslator** (owns the meta-parsing helpers from the old middleware)

```ts
// src/presentation/http/error-translators/prisma.translator.ts
import { Prisma } from '../../../generated/prisma/client';
import { ExceptionTranslator, HttpErrorResponse } from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

interface PrismaMeta extends Record<string, unknown> {
  target?: string[]; constraint?: string; field_name?: string;
}

const constraintName = (m: PrismaMeta) =>
  (typeof m.constraint === 'string' && m.constraint) ||
  (typeof m.field_name === 'string' && m.field_name) || undefined;

const constraintField = (m: PrismaMeta) => {
  const c = constraintName(m); if (!c) return undefined;
  return c.includes('_') ? c.split('_')[1] : c;
};

const targetFields = (m: PrismaMeta) =>
  Array.isArray(m.target) && m.target.length > 0 ? m.target.join(', ') : undefined;

const fieldsFromMessage = (message: string): string | undefined => {
  const fields = message.match(/fields?:\s*\(([^)]+)\)/i);
  if (fields?.[1]) {
    const cleaned = fields[1].split(',').map(p => p.replace(/[`"']/g, '').trim()).filter(Boolean).join(', ');
    return cleaned || undefined;
  }
  const constraint = message.match(/constraint\s*`([^`]+)`/i);
  return constraint?.[1];
};

export class PrismaExceptionTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError;
  }

  translate(error: Prisma.PrismaClientKnownRequestError): HttpErrorResponse {
    const meta = (error.meta ?? {}) as PrismaMeta;
    const make = (status: number, message: string): HttpErrorResponse => ({
      status, body: { status: 'error', message, code: error.code },
    });

    switch (error.code) {
      case 'P2003': return make(HttpStatus.BAD_REQUEST,
        `Foreign key constraint failed: ${constraintField(meta) ?? 'unknown field'} does not reference an existing record`);
      case 'P2002': {
        const fields = targetFields(meta) ?? constraintName(meta) ?? fieldsFromMessage(error.message);
        return make(HttpStatus.CONFLICT, fields ? `Unique constraint failed on: ${fields}` : 'Unique constraint failed');
      }
      case 'P2025': return make(HttpStatus.NOT_FOUND, 'Record not found');
      case 'P2000': return make(HttpStatus.BAD_REQUEST, "The provided value for the column is too long for the column's type.");
      case 'P2001': return make(HttpStatus.NOT_FOUND, 'The record searched for in the where condition does not exist.');
      case 'P2004': return make(HttpStatus.BAD_REQUEST, 'A constraint failed on the database.');
      default: return make(HttpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
  }
}
```

- [ ] **Step 3: AppErrorTranslator**

```ts
// src/presentation/http/error-translators/app-error.translator.ts
import { AppError } from '../../../domain/errors';
import { ExceptionTranslator, HttpErrorResponse } from './exception-translator.port';

export class AppErrorTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is AppError { return error instanceof AppError; }
  translate(error: AppError): HttpErrorResponse {
    return { status: error.statusCode, body: { status: 'error', message: error.message } };
  }
}
```

- [ ] **Step 4: FallbackExceptionTranslator**

```ts
// src/presentation/http/error-translators/fallback.translator.ts
import { ExceptionTranslator, HttpErrorResponse } from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

export class FallbackExceptionTranslator implements ExceptionTranslator {
  constructor(private readonly includeStack: boolean) {}
  canHandle(_: unknown): boolean { return true; }
  translate(error: unknown): HttpErrorResponse {
    const stack = error instanceof Error ? error.stack : undefined;
    const body: Record<string, unknown> = { status: 'error', message: 'Internal Server Error' };
    if (this.includeStack && stack) body.stack = stack;
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body };
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/presentation/http/error-translators
git commit -m "refactor(errors): add HTTP exception translators (Zod, Prisma, AppError, fallback)"
```

---

### Task 7.3: New Express error middleware

**Files:** Create `src/presentation/http/middlewares/error.middleware.ts`

- [ ] **Step 1: Implementation**

```ts
// src/presentation/http/middlewares/error.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { LoggerPort } from '../../../application/ports/logger.port';
import { ExceptionTranslatorRegistry } from '../error-translators/exception-translator.registry';

export const buildErrorMiddleware = (
  registry: ExceptionTranslatorRegistry,
  logger: LoggerPort,
) => (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const name = err instanceof Error ? err.name : 'UnknownError';
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error(`[Error] ${name}: ${message}`);

  const { status, body } = registry.translate(err);
  res.status(status).json(body);
};
```

- [ ] **Step 2: Add shim to the old path so legacy tests still resolve**

`src/common/middlewares/error.middleware.ts` becomes:
```ts
// shim — to be deleted in Phase 9
export { buildErrorMiddleware as errorHandler } from '../../presentation/http/middlewares/error.middleware';
```

Note: the shim renames `buildErrorMiddleware` → `errorHandler` for callers but returns a factory, not the handler. The legacy `app.ts` will fail until it's replaced in Task 7.5. That's expected — Phase 7 lands all error-translator pieces together.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/http/middlewares/error.middleware.ts \
        src/common/middlewares/error.middleware.ts
git commit -m "refactor(errors): replace error middleware with translator-registry-driven version"
```

---

### Task 7.4: gRPC error translators

**Files:**
- Create: `grpc-exception-translator.port.ts`, `grpc-exception-translator.registry.ts`, `zod.grpc-translator.ts`, `app-error.grpc-translator.ts`, `fallback.grpc-translator.ts`

- [ ] **Step 1: Port + registry**

```ts
// src/presentation/grpc/error-translators/grpc-exception-translator.port.ts
import type { ServiceError, status } from '@grpc/grpc-js';

export interface GrpcExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): ServiceError;
}

export const buildGrpcError = (code: status, message: string): ServiceError =>
  Object.assign(new Error(message), { code, details: message }) as ServiceError;
```

```ts
// src/presentation/grpc/error-translators/grpc-exception-translator.registry.ts
import type { ServiceError } from '@grpc/grpc-js';
import { GrpcExceptionTranslator } from './grpc-exception-translator.port';

export class GrpcExceptionTranslatorRegistry {
  constructor(private readonly translators: GrpcExceptionTranslator[]) {}
  translate(error: unknown): ServiceError {
    const found = this.translators.find((t) => t.canHandle(error));
    if (!found) throw new Error('No gRPC translator could handle the error — add a fallback translator');
    return found.translate(error);
  }
}
```

- [ ] **Step 2: Zod translator**

```ts
// src/presentation/grpc/error-translators/zod.grpc-translator.ts
import { ZodError } from 'zod';
import { status } from '@grpc/grpc-js';
import { GrpcExceptionTranslator, buildGrpcError } from './grpc-exception-translator.port';

export class ZodGrpcExceptionTranslator implements GrpcExceptionTranslator {
  canHandle(error: unknown): error is ZodError { return error instanceof ZodError; }
  translate(error: ZodError) {
    const details = error.issues.length === 0
      ? 'Validation failed'
      : `Validation failed: ${error.issues.map(i => `${i.path.length ? i.path.join('.') : 'body'}: ${i.message}`).join('; ')}`;
    return buildGrpcError(status.INVALID_ARGUMENT, details);
  }
}
```

- [ ] **Step 3: AppError translator**

```ts
// src/presentation/grpc/error-translators/app-error.grpc-translator.ts
import { status } from '@grpc/grpc-js';
import { AppError } from '../../../domain/errors';
import { HttpStatus } from '../../../common/constants/http-status.constants';
import { GrpcExceptionTranslator, buildGrpcError } from './grpc-exception-translator.port';

const grpcByHttp: Partial<Record<number, status>> = {
  [HttpStatus.BAD_REQUEST]: status.INVALID_ARGUMENT,
  [HttpStatus.UNAUTHORIZED]: status.UNAUTHENTICATED,
  [HttpStatus.NOT_FOUND]: status.NOT_FOUND,
  [HttpStatus.CONFLICT]: status.ALREADY_EXISTS,
  [HttpStatus.TOO_MANY_REQUESTS]: status.RESOURCE_EXHAUSTED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: status.INTERNAL,
};

export class AppErrorGrpcTranslator implements GrpcExceptionTranslator {
  canHandle(error: unknown): error is AppError { return error instanceof AppError; }
  translate(error: AppError) {
    return buildGrpcError(grpcByHttp[error.statusCode] ?? status.INTERNAL, error.message);
  }
}
```

- [ ] **Step 4: Fallback translator**

```ts
// src/presentation/grpc/error-translators/fallback.grpc-translator.ts
import { status } from '@grpc/grpc-js';
import { GrpcExceptionTranslator, buildGrpcError } from './grpc-exception-translator.port';

export class FallbackGrpcExceptionTranslator implements GrpcExceptionTranslator {
  canHandle(_: unknown): boolean { return true; }
  translate(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildGrpcError(status.INTERNAL, message);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/presentation/grpc/error-translators
git commit -m "refactor(grpc/errors): add gRPC exception translator registry + translators"
```

---

### Task 7.5: Switch the entrypoint to `buildApp`

**Files:** Rewrite `src/index.ts`. Delete `src/app.ts` (or leave it as an unused file to be removed in Phase 9 — preferred: leave it).

- [ ] **Step 1: Rewrite `src/index.ts`**

```ts
// src/index.ts
import type { Server as HttpServer } from 'node:http';
import type * as grpc from '@grpc/grpc-js';
import { buildApp } from './composition-root';
import { config } from './config';
import { PinoLogger } from './infrastructure/logging/pino.logger';

const logger = new PinoLogger();
const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: HttpServer | null = null;
let grpcServer: grpc.Server | null = null;
let isShuttingDown = false;

const shutdownHttp = async (): Promise<void> => {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer?.close((err) => (err ? reject(err) : resolve()));
  });
};

const shutdownGrpc = async (): Promise<void> => {
  if (!grpcServer) return;
  await new Promise<void>((resolve, reject) => {
    grpcServer?.tryShutdown((err) => (err ? reject(err) : resolve()));
  });
};

const bootstrap = async (): Promise<void> => {
  const { httpApp, startGrpcServer, scheduler } = buildApp();

  httpServer = httpApp.listen(config.PORT, () => {
    logger.info(`Server is running on port ${config.PORT}`);
  });
  grpcServer = await startGrpcServer();

  const handle = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    void scheduler.stop();
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      grpcServer?.forceShutdown();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    Promise.all([shutdownHttp(), shutdownGrpc()])
      .then(() => { clearTimeout(timer); logger.info('Graceful shutdown completed.'); process.exit(0); })
      .catch((err: unknown) => { clearTimeout(timer); logger.error({ err }, 'Error during graceful shutdown'); process.exit(1); });
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
};

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'Error starting server');
  process.exit(1);
});
```

- [ ] **Step 2: Build + start to verify wiring**

Run: `npm run build`
Expected: `tsc` exits 0.

Run (foreground, kill after a few seconds): `npm run dev`
Expected: logs show "Server is running on port 3000", "gRPC server is running on 0.0.0.0:50051", "[Scheduler] Initialized (...)".

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: switch entrypoint to composition-root buildApp"
```

---

## Phase 8 — Tests

### Task 8.1: `tests/test-composition.ts`

**Files:** Create `tests/test-composition.ts`

- [ ] **Step 1: Implementation**

```ts
// tests/test-composition.ts
import type { Application } from 'express';
import { SubscribeUseCase } from '../src/application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../src/application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../src/application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../src/application/subscription/list-subscriptions.use-case';
import { SubscriptionController } from '../src/presentation/http/controllers/subscription.controller';
import { buildHttpApp } from '../src/presentation/http/http-app.factory';
// SubscriptionController is also referenced by the TestComposition type below.
import { ExceptionTranslatorRegistry } from '../src/presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from '../src/presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from '../src/presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from '../src/presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from '../src/presentation/http/error-translators/fallback.translator';

import { InMemorySubscriptionRepository } from './fakes/in-memory-subscription.repository';
import { InMemoryRepositoryRepository } from './fakes/in-memory-repository.repository';
import { FakeGitHubClient } from './fakes/fake-github.client';
import { FakeEmailSender } from './fakes/fake-email.sender';
import { SilentLogger } from './fakes/silent.logger';
import { ConfirmationEmailTemplate } from '../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../src/infrastructure/email/app-url-builder';

export interface TestComposition {
  app: Application;
  controller: SubscriptionController;
  subscriptions: InMemorySubscriptionRepository;
  repositories: InMemoryRepositoryRepository;
  github: FakeGitHubClient;
  email: FakeEmailSender;
  apiKey: string;
}

export const buildTestApp = (overrides: Partial<{
  github: FakeGitHubClient; email: FakeEmailSender; apiKey: string;
}> = {}): TestComposition => {
  const subscriptions = new InMemorySubscriptionRepository();
  const repositories = new InMemoryRepositoryRepository();
  const github = overrides.github ?? new FakeGitHubClient({ exists: true });
  const email = overrides.email ?? new FakeEmailSender();
  const logger = new SilentLogger();
  const urls = new AppUrlBuilder('http://localhost:3000');
  const tpl = new ConfirmationEmailTemplate(urls);
  const apiKey = overrides.apiKey ?? 'test-key';

  const subscribe = new SubscribeUseCase(subscriptions, repositories, github, email, tpl, logger);
  const confirm = new ConfirmSubscriptionUseCase(subscriptions);
  const unsubscribe = new UnsubscribeUseCase(subscriptions);
  const list = new ListSubscriptionsUseCase(subscriptions);
  const controller = new SubscriptionController(subscribe, confirm, unsubscribe, list);

  const errorRegistry = new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(false),
  ]);

  const app = buildHttpApp({
    subscriptionController: controller,
    errorRegistry, apiKey, logger,
  });

  return { app, controller, subscriptions, repositories, github, email, apiKey };
};
```

- [ ] **Step 2: Commit**

```bash
git add tests/test-composition.ts
git commit -m "test(composition): add buildTestApp for integration tests"
```

---

### Task 8.2: Rewrite the HTTP integration tests against `buildTestApp`

**Files:**
- Rewrite: `tests/integration/app.api.spec.ts`, `tests/integration/subscription.api.spec.ts`

- [ ] **Step 1: Read the existing integration tests**

```bash
cat tests/integration/app.api.spec.ts tests/integration/subscription.api.spec.ts
```

- [ ] **Step 2: For each test, replace mock-based wiring with `buildTestApp`**

Pattern for the new tests:
```ts
import request from 'supertest';
import { buildTestApp } from '../test-composition';

describe('Subscription API', () => {
  it('rejects missing API key', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/api/subscribe').send({ email: 'a@b.c', repo: 'x/y' });
    expect(res.status).toBe(401);
  });

  it('creates a subscription and sends a confirmation email', async () => {
    const { app, apiKey, email, subscriptions } = buildTestApp();
    const res = await request(app)
      .post('/api/subscribe').set('x-api-key', apiKey)
      .send({ email: 'a@b.c', repo: 'x/y' });
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(subscriptions.all()).toHaveLength(1);
  });
});
```

Cover at minimum each route's:
- Missing API key → 401
- Happy path → 200
- Validation error → 400
- Domain error (e.g. `NotFoundError` for unknown repo) → 404
- Conflict (re-subscribing) → 409

- [ ] **Step 3: Run integration tests**

Run: `npm test -- integration/subscription.api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/subscription.api.spec.ts tests/integration/app.api.spec.ts
git commit -m "test(integration): rewrite HTTP integration tests against buildTestApp"
```

---

### Task 8.3: Rewrite the gRPC integration tests

**Files:** Rewrite `tests/integration/grpc.api.spec.ts`

- [ ] **Step 1: Read the existing test**

```bash
cat tests/integration/grpc.api.spec.ts
```

- [ ] **Step 2: Add `buildTestGrpcServer` to `tests/test-composition.ts`**

```ts
// append to tests/test-composition.ts
import type * as grpc from '@grpc/grpc-js';
import { GrpcExceptionTranslatorRegistry } from '../src/presentation/grpc/error-translators/grpc-exception-translator.registry';
import { ZodGrpcExceptionTranslator } from '../src/presentation/grpc/error-translators/zod.grpc-translator';
import { AppErrorGrpcTranslator } from '../src/presentation/grpc/error-translators/app-error.grpc-translator';
import { FallbackGrpcExceptionTranslator } from '../src/presentation/grpc/error-translators/fallback.grpc-translator';
import { buildGrpcServer } from '../src/presentation/grpc/grpc.server';
import { PinoLogger } from '../src/infrastructure/logging/pino.logger';

export const buildTestGrpcServer = async (
  ctx: TestComposition,
  port = 0, // 0 lets the OS pick a free port
): Promise<{ server: grpc.Server; address: string }> => {
  const errorRegistry = new GrpcExceptionTranslatorRegistry([
    new ZodGrpcExceptionTranslator(),
    new AppErrorGrpcTranslator(),
    new FallbackGrpcExceptionTranslator(),
  ]);

  const server = await buildGrpcServer({
    subscriptionController: ctx.controller,
    errorRegistry,
    apiKey: ctx.apiKey,
    logger: new PinoLogger(),
    host: '127.0.0.1',
    port,
  });

  // gRPC binds asynchronously; expose the actual address for client connections.
  // When `port` is 0 the bound port is returned by `buildGrpcServer` through the
  // bindAsync callback — adjust `buildGrpcServer` to also return the bound port.
  // For now this helper assumes a fixed port is provided by the test.
  return { server, address: `127.0.0.1:${port}` };
};
```

> The test should pass an explicit port (e.g. `50071`) to avoid the bound-port discovery work. The existing `tests/integration/grpc.api.spec.ts` likely already does this; mirror that.

- [ ] **Step 3: Run gRPC integration tests**

Run: `npm test -- integration/grpc.api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/grpc.api.spec.ts tests/test-composition.ts
git commit -m "test(integration): rewrite gRPC integration tests against composition helper"
```

---

### Task 8.4: Delete obsolete unit tests that target old module paths

**Files:**
- Delete: `tests/unit/modules/subscription/subscription.service.spec.ts`, `tests/unit/modules/github/github.service.spec.ts`, `tests/unit/modules/github/github.utils.spec.ts`, `tests/unit/modules/scanner/scanner.service.spec.ts`, `tests/unit/modules/notification/email.service.spec.ts`, `tests/unit/modules/repository/repository.service.spec.ts`, `tests/unit/modules/grpc/grpc.error-mapper.spec.ts`, `tests/unit/modules/grpc/grpc.handlers.spec.ts`, `tests/unit/common/error.middleware.spec.ts`

- [ ] **Step 1: Verify each behavior is covered by the new tests**

For each deletion target, locate the corresponding new test (e.g. `subscription.service.spec.ts` → coverage now lives in `application/subscription/*.use-case.spec.ts` + integration). If anything isn't covered, **port the assertion** into the new test before deleting.

- [ ] **Step 2: Delete files**

```bash
git rm tests/unit/modules/subscription/subscription.service.spec.ts \
       tests/unit/modules/github/github.service.spec.ts \
       tests/unit/modules/github/github.utils.spec.ts \
       tests/unit/modules/scanner/scanner.service.spec.ts \
       tests/unit/modules/notification/email.service.spec.ts \
       tests/unit/modules/repository/repository.service.spec.ts \
       tests/unit/modules/grpc/grpc.error-mapper.spec.ts \
       tests/unit/modules/grpc/grpc.handlers.spec.ts \
       tests/unit/common/error.middleware.spec.ts
```

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "test: remove obsolete tests covered by new application/infrastructure suites"
```

---

## Phase 9 — Cleanup

### Task 9.1: Delete legacy module files

**Files:**
- Delete: `src/modules/subscription/subscription.service.ts`, `subscription.api.controller.ts`, `subscription.web.controller.ts`
- Delete: `src/modules/github/github.service.ts`, `github.utils.ts`, `github.cache-keys.ts` (copy already in infra), `github.schema.ts` → **move** to `src/infrastructure/github/github.schema.ts`, and update the GitHubHttpClient import.
- Delete: `src/modules/repository/repository.service.ts`
- Delete: `src/modules/scanner/scanner.service.ts`
- Delete: `src/modules/notification/email.service.ts`
- Delete: `src/modules/grpc/grpc.handlers.ts`, `grpc.server.ts`, `grpc.error-mapper.ts`
- Delete: `src/jobs/release-check.job.ts` (scheduler now lives in composition root)
- Delete: `src/app.ts`
- Delete: `src/common/utils/db.ts`, `http-client.ts` (use cases moved to infrastructure adapters)

- [ ] **Step 1: Move `github.schema.ts` into infrastructure**

```bash
git mv src/modules/github/github.schema.ts src/infrastructure/github/github.schema.ts
```

Then update the import in `src/infrastructure/github/github-http.client.ts`:
```ts
import { githubReleaseSchema, GitHubReleaseResponse } from './github.schema';
```

- [ ] **Step 2: Update `subscription.schema.ts` and `subscription.mapper.ts` location**

Move them to `src/presentation/http/dto/`:
```bash
mkdir -p src/presentation/http/dto
git mv src/modules/subscription/subscription.schema.ts src/presentation/http/dto/subscription.schema.ts
git mv src/modules/subscription/subscription.mapper.ts src/presentation/http/dto/subscription.mapper.ts
```

Update all importers (`SubscriptionController`, gRPC handlers).

- [ ] **Step 3: Delete legacy files**

```bash
git rm -r src/modules src/jobs src/app.ts src/common/utils/db.ts src/common/utils/http-client.ts
```

- [ ] **Step 4: Build + run all tests**

Run: `npm run build && npm test`
Expected: build passes; all suites pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: delete legacy src/modules, src/jobs, src/app.ts; relocate schema + mapper"
```

---

### Task 9.2: Remove re-export shims

**Files:**
- Delete: `src/common/errors/` (entire folder — already a shim)
- Delete: `src/common/logger/logger.interface.ts`, `pino.logger.ts`, `index.ts` (logger now lives under `infrastructure/logging/` + `application/ports/`)
- Delete: `src/common/middlewares/` (all shimmed already)
- Delete: `src/common/views/html.template.ts` (shim)
- Delete: `src/common/utils/web-error.util.ts` (shim)
- Delete: `src/common/cache/cache.service.ts`, `redis.client.ts` (entire folder)

Anything left under `src/common/` should be: `constants/http-status.constants.ts`, `metrics/prometheus.ts`, `types/*.ts`. Move those to `src/infrastructure/` and `src/domain/` respectively in follow-ups (out of scope; leaving under `common/` is acceptable for this plan).

- [ ] **Step 1: Find any remaining references to the shimmed paths**

Run: `grep -rn "from '.*common/errors'" src tests`
Expected: zero results.

Run: `grep -rn "from '.*common/logger'" src tests`
Expected: zero results.

Run: `grep -rn "from '.*common/middlewares'" src tests`
Expected: zero results.

Run: `grep -rn "from '.*common/views'" src tests`
Expected: zero results.

Run: `grep -rn "from '.*common/cache'" src tests`
Expected: zero results.

If any reference remains, **fix it before deleting**.

- [ ] **Step 2: Delete the shimmed folders**

```bash
git rm -r src/common/errors src/common/logger src/common/middlewares src/common/views \
          src/common/utils/web-error.util.ts src/common/cache
```

- [ ] **Step 3: Build + run all tests**

Run: `npm run build && npm test`
Expected: build passes; all suites pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove re-export shims now that all importers use new paths"
```

---

### Task 9.3: README + spec back-reference

**Files:** Modify `README.md`

- [ ] **Step 1: Update the "Architecture" section**

Replace the current "internal modules" list with the new layered description:

```md
## Architecture

Hexagonal layering with inward-pointing dependencies. Wiring lives in `src/composition-root.ts`.

```
src/
├── domain/         entities + value objects + error classes; no I/O
├── application/    use cases + ports (interfaces depended on by use cases)
├── infrastructure/ adapters that implement ports (Prisma, fetch, redis, nodemailer, node-cron, pino)
├── presentation/   Express + gRPC transports; controllers, routers, error translators
├── config/         zod-validated environment
└── composition-root.ts
```

Each transport (Express API, Express web, gRPC) delegates to the same use cases. Error
translation is polymorphic: HTTP and gRPC each have a registry of `ExceptionTranslator`s.
Design rationale: `docs/superpowers/specs/2026-05-20-solid-grasp-refactor-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): describe the new hexagonal architecture"
```

---

### Task 9.4: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `tsc` exits 0.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all suites pass; coverage on the new application + infrastructure layers.

- [ ] **Step 3: Smoke run**

Run: `npm run dev`
Expected: logs show HTTP started on `:3000`, gRPC on `:50051`, scheduler initialized.

Manual checks (curl / browser):
- `GET /health` → `200 {"status":"ok",...}`
- `GET /metrics` → Prometheus output
- `POST /api/subscribe` without API key → `401`
- `POST /api/subscribe` with valid key + body → `200` (with Postgres + email config)
- `GET /` (static page) → HTML

Stop the server (`Ctrl-C`) — graceful shutdown logs should appear.

- [ ] **Step 4: Optional final commit**

If `Task 9.4` surfaced any minor tweaks, commit them. Otherwise, the branch is ready for PR.

---

## Plan complete

Plan saved to: `docs/superpowers/plans/2026-05-20-solid-grasp-refactor.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
