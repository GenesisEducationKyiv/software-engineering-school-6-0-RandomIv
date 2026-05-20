# SOLID & GRASP Refactor — Design Spec

**Date:** 2026-05-20
**Branch (origin):** `fix-hw1-cleancode`
**Status:** Approved design — awaiting implementation plan

## 1. Goal & Constraints

Refactor `github-release-notifier` (a Node.js + TypeScript monolith of ~2k LOC across 46 files) so each SOLID and GRASP principle is **visibly applied** in the source layout, class structure, and tests. The branch name `fix-hw1-cleancode` and the merged `hw1-cleancode` PR indicate this work is graded coursework; the design optimizes for a grader being able to point at code that demonstrates each principle, not for the minimum diff.

**Settled design dimensions (from brainstorming):**

| Dimension | Choice |
| --- | --- |
| Goal | Homework / showcase SOLID & GRASP; existing tests may be rewritten |
| Implementation style | Classes + constructor DI |
| Layout | Hexagonal layers (`domain` / `application` / `infrastructure` / `presentation`) |
| DI mechanism | Manual composition root (no DI container) |
| Scope | All business modules + transports + error handling + infrastructure adapters |

**Non-goals:**

- Adding new product features.
- Switching frameworks (Express, Prisma, nodemailer, node-cron, Redis stay).
- Distributed/scaling rework (the system-design ADRs already document those tradeoffs).
- Adopting a DI container (tsyringe / Inversify).

## 2. Current State — Diagnosis

The starting codebase is functional-style: every module exports plain async functions, services import `prisma`, `nodemailer.transporter`, `httpClient`, and `cacheService` as module-level singletons. A few abstractions already exist (`LoggerPort`-style `logger.interface.ts`, `CacheService` interface, `AppError` hierarchy) but they are not used to decouple use cases from infrastructure.

**Visible violations to fix:**

| Violation | File | Principle(s) |
| --- | --- | --- |
| `createSubscription` orchestrates GitHub repo check + DB write + email send + compensating delete | `src/modules/subscription/subscription.service.ts` | SRP, Information Expert |
| `email.service` mixes SMTP transport, HTML/text templates, and URL building | `src/modules/notification/email.service.ts` | SRP, High Cohesion |
| Services depend directly on `prisma`, `transporter`, `fetch`, `cacheService` | most services | DIP, Pure Fabrication, Protected Variations |
| `errorHandler` is a 205-line if/else over `ZodError` / `Prisma.PrismaClientKnownRequestError` / `AppError` | `src/common/middlewares/error.middleware.ts` | OCP, Polymorphism |
| `mapPrismaException` is a `switch` with hand-rolled meta-parsing helpers | `src/common/middlewares/error.middleware.ts` | SRP, OCP |
| Three controllers (API / Web / gRPC) inline the same parse-then-call-then-respond flow per use case | `subscription.api.controller.ts`, `subscription.web.controller.ts`, `grpc.handlers.ts` | DRY, Controller (GRASP) |
| `scanner.service.checkReleases` mixes fetching, per-subscriber dispatch, error grouping, and state update | `src/modules/scanner/scanner.service.ts` | SRP |

## 3. Target Architecture

Hexagonal layering with inward-pointing dependencies (`presentation → application → domain`; `infrastructure → application`).

```
src/
├── domain/                    # pure: no I/O, no framework imports
│   ├── subscription/
│   │   ├── subscription.entity.ts
│   │   └── subscription-token.vo.ts
│   ├── repository/
│   │   └── repository.entity.ts
│   └── errors/
│       ├── app.error.ts
│       ├── not-found.error.ts
│       ├── conflict.error.ts
│       ├── bad-request.error.ts
│       ├── unauthorized.error.ts
│       └── rate-limit.error.ts
│
├── application/               # use cases + ports (interfaces)
│   ├── subscription/
│   │   ├── subscribe.use-case.ts
│   │   ├── confirm-subscription.use-case.ts
│   │   ├── unsubscribe.use-case.ts
│   │   └── list-subscriptions.use-case.ts
│   ├── scanner/
│   │   ├── check-releases.use-case.ts
│   │   └── notify-repository-subscribers.use-case.ts
│   └── ports/
│       ├── subscription.repository.port.ts
│       ├── repository.repository.port.ts
│       ├── github.client.port.ts
│       ├── email.sender.port.ts
│       ├── cache.port.ts
│       ├── http-client.port.ts
│       ├── logger.port.ts
│       ├── scheduler.port.ts
│       └── clock.port.ts
│
├── infrastructure/            # adapters (implement ports)
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
│   ├── http/
│   │   └── fetch.http-client.ts
│   ├── logging/
│   │   └── pino.logger.ts
│   └── scheduler/
│       └── node-cron.scheduler.ts
│
├── presentation/
│   ├── http/
│   │   ├── api.router.ts
│   │   ├── web.router.ts
│   │   ├── http-app.factory.ts
│   │   ├── controllers/
│   │   │   └── subscription.controller.ts
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
│   │   └── views/
│   │       └── html.template.ts
│   └── grpc/
│       ├── grpc.server.ts
│       ├── grpc.handlers.ts
│       └── error-translators/
│           ├── grpc-exception-translator.registry.ts
│           └── (parallel translator classes)
│
├── config/                    # zod-validated env (unchanged)
├── composition-root.ts        # wires everything; exports buildApp(config)
└── index.ts                   # parse config → buildApp → start servers → graceful shutdown
```

## 4. Ports

Each port is small (3–6 methods max) and lives in `application/ports/`. Use cases depend only on ports; adapters implement them in `infrastructure/`.

```ts
// application/ports/subscription.repository.port.ts
export interface SubscriptionRepositoryPort {
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  findByConfirmationToken(token: string): Promise<Subscription | null>;
  markConfirmed(id: string): Promise<void>;
  deleteByUnsubscribeToken(token: string): Promise<boolean>;
  deleteById(id: string): Promise<void>;
  findConfirmedByEmail(email: string): Promise<SubscriptionWithRepository[]>;
}

// application/ports/repository.repository.port.ts
export interface RepositoryRepositoryPort {
  getOrCreate(fullName: string): Promise<Repository>;
  listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]>;
  updateLastSeenTag(id: string, tag: string): Promise<void>;
}

// application/ports/github.client.port.ts
export interface GitHubClientPort {
  repoExists(fullName: string): Promise<boolean>;
  getLatestReleaseTag(fullName: string): Promise<string | null>;
}

// application/ports/email.sender.port.ts
export interface EmailSenderPort { send(message: EmailMessage): Promise<void>; }
export interface EmailMessage { to: string; subject: string; text: string; html: string; }

// application/ports/cache.port.ts
export interface CachePort {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

// application/ports/http-client.port.ts
export interface HttpClientPort {
  request<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}

// application/ports/logger.port.ts (keep existing shape from logger.interface.ts)
// application/ports/scheduler.port.ts
export interface SchedulerPort {
  schedule(task: () => Promise<void> | void): void;
  stop(): Promise<void>;
}

// application/ports/clock.port.ts
export interface ClockPort { now(): Date; }
```

`EmailSenderPort` is intentionally separated from rendering. Templates are concrete classes in `infrastructure/email/templates/` that produce an `EmailMessage`; they don't need a port abstraction (the polymorphic seam lives at the sender, not the template). The sender only sends.

## 5. Domain & Application Layer

### 5.1 Domain — pure, no I/O

```ts
// domain/subscription/subscription.entity.ts
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

The entity owns its own invariant (`confirm()` rejects double-confirmation) — **Information Expert**: the rule lives with the data it operates on. The use case calls `subscription.confirm()` purely to enforce the rule; persistence happens via `SubscriptionRepositoryPort.markConfirmed(id)`. The returned new instance is not required to be persisted directly — it exists so the rule check produces a value, keeping `confirm()` total over its inputs.

### 5.2 Application — one class per use case

```ts
// application/subscription/subscribe.use-case.ts
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
      ...input,
      repositoryId: repository.id,
    });

    try {
      const message = this.confirmationTemplate.render(subscription, input.repo);
      await this.email.send(message);
    } catch (error) {
      await this.subscriptions.deleteById(subscription.id); // compensating action
      throw error;
    }
  }
}
```

The remaining use cases follow the same shape:
- `ConfirmSubscriptionUseCase` — load entity → call `subscription.confirm()` → save.
- `UnsubscribeUseCase`, `ListSubscriptionsUseCase`.
- `CheckReleasesUseCase` (in `application/scanner/`) orchestrates GitHub + repository updates; the inner per-repo "notify all subscribers, only update lastSeenTag if all succeeded" loop is extracted into `NotifyRepositorySubscribersUseCase` so each class has one reason to change.

## 6. Infrastructure Adapters

Each external dependency gets a class implementing its port. Use cases never import these.

```ts
// infrastructure/persistence/prisma-subscription.repository.ts
export class PrismaSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    try {
      const row = await this.prisma.subscription.create({ data: input });
      return this.toEntity(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Email already subscribed to this repository');
      }
      throw error;
    }
  }

  // findByConfirmationToken / markConfirmed / deleteByUnsubscribeToken / deleteById / findConfirmedByEmail
  // private toEntity(row): Subscription
}
```

```ts
// infrastructure/github/github-http.client.ts
export class GitHubHttpClient implements GitHubClientPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly cache: CachePort,
    private readonly logger: LoggerPort,
    private readonly config: { token?: string; cacheTtlSeconds: number },
  ) {}

  async repoExists(fullName: string): Promise<boolean> { /* uses cache + http */ }
  async getLatestReleaseTag(fullName: string): Promise<string | null> { /* uses cache + http */ }
}
```

```ts
// infrastructure/email/nodemailer.sender.ts
export class NodemailerEmailSender implements EmailSenderPort {
  constructor(private readonly transporter: Transporter, private readonly from: string) {}
  async send(message: EmailMessage): Promise<void> { /* one responsibility: send */ }
}

// infrastructure/email/templates/confirmation-email.template.ts
export class ConfirmationEmailTemplate {
  constructor(private readonly urls: AppUrlBuilder) {}
  render(subscription: Subscription, repo: string): EmailMessage { /* one responsibility: render */ }
}

// infrastructure/email/app-url-builder.ts
export class AppUrlBuilder {
  constructor(private readonly baseUrl: string) {}
  webPath(path: string): string { return `${this.baseUrl}/web${path}`; }
}
```

Other adapters: `RedisCache`, `NoopCache` (both implement `CachePort`); `FetchHttpClient` (`HttpClientPort`); `PinoLogger` (`LoggerPort`); `NodeCronScheduler` (`SchedulerPort`).

**Two specific decisions:**

1. **`NoopCache` returns to life.** The recent commit `1ac5ed8` removed it; we restore it so use cases never need an `if cache != null` branch — that's textbook **Polymorphism (GRASP)** and **LSP**. `NoopCache.getJson` returns `null`, `setJson` is a no-op.
2. **`GitHubHttpClient` depends on `HttpClientPort` and `CachePort`** — two more ports — rather than calling `fetch` and `redisClient` directly. This is what makes the entire chain DIP-clean.

## 7. Error Handling — Polymorphic Translation

Replace the 205-line if/else in `src/common/middlewares/error.middleware.ts` with a registry of polymorphic translators.

```ts
// presentation/http/error-translators/exception-translator.port.ts
export interface ExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): HttpErrorResponse;
}
export interface HttpErrorResponse { status: number; body: Record<string, unknown>; }

// presentation/http/error-translators/exception-translator.registry.ts
export class ExceptionTranslatorRegistry {
  constructor(private readonly translators: ExceptionTranslator[]) {}
  translate(error: unknown): HttpErrorResponse {
    return this.translators.find(t => t.canHandle(error))!.translate(error);
  }
}
```

Translator classes: `ZodExceptionTranslator`, `PrismaExceptionTranslator` (owns the `P2002`/`P2003`/`P2025` decoding and the meta-parsing helpers), `AppErrorTranslator`, `FallbackExceptionTranslator` (last in chain — `canHandle` always returns `true`).

The Express middleware shrinks to ~10 lines:

```ts
export const errorMiddleware = (registry: ExceptionTranslatorRegistry, logger: LoggerPort) =>
  (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    logger.error({ err }, `[Error] ${err instanceof Error ? err.name : 'UnknownError'}`);
    const { status, body } = registry.translate(err);
    res.status(status).json(body);
  };
```

The gRPC side uses a parallel `GrpcExceptionTranslatorRegistry` mapping each `AppError` subclass to a `grpc.status` code — replaces `src/modules/grpc/grpc.error-mapper.ts`.

## 8. Presentation Layer

### 8.1 Transport-agnostic controller

```ts
// presentation/http/controllers/subscription.controller.ts
export class SubscriptionController {
  constructor(
    private readonly subscribe: SubscribeUseCase,
    private readonly confirm: ConfirmSubscriptionUseCase,
    private readonly unsubscribe: UnsubscribeUseCase,
    private readonly list: ListSubscriptionsUseCase,
  ) {}

  subscribeHandler = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = subscribeSchema.parse(req.body);
      await this.subscribe.execute(input);
      res.json({ message: 'Subscription successful. Confirmation email sent.' });
    } catch (e) { next(e); }
  };
  // confirmHandler / unsubscribeHandler / listHandler analogous
}
```

Routers `buildApiRouter` and `buildWebRouter` delegate to `SubscriptionController` (which is Express-shaped: `req, res, next`). The web router differs only in how it formats responses — `renderHtmlMessage` instead of `res.json` and `sendWebError` instead of forwarding to the error middleware — handled by separate web-flavored handler methods on the same controller, or a thin `WebSubscriptionController` that composes it.

The gRPC layer does **not** reuse `SubscriptionController` (the shapes don't match). Instead, `presentation/grpc/grpc.handlers.ts` is a sibling class that holds the same four use case instances and wraps each in a gRPC unary handler. Both presentation paths therefore depend on the same use cases — that's where the deduplication actually lives. Only the parse-and-respond plumbing is per-transport.

### 8.2 Composition root

The only file that imports concretions from every layer. The dependency graph reads top-to-bottom.

```ts
// src/composition-root.ts
export const buildApp = (config: Config): {
  httpApp: Application;
  grpcServer: grpc.Server;
  scheduler: SchedulerPort;
} => {
  // infrastructure
  const logger      = new PinoLogger();
  const prisma      = createPrismaClient(config);
  const httpClient  = new FetchHttpClient();
  const cache       = config.REDIS_URL
                      ? new RedisCache(config.REDIS_URL, logger)
                      : new NoopCache();
  const urls        = new AppUrlBuilder(config.APP_BASE_URL ?? `http://localhost:${config.PORT}`);
  const transporter = createNodemailerTransport(config);
  const email       = new NodemailerEmailSender(transporter, config.EMAIL_USER);
  const github      = new GitHubHttpClient(httpClient, cache, logger,
                        { token: config.GITHUB_TOKEN, cacheTtlSeconds: config.GITHUB_CACHE_TTL_SECONDS });
  const scheduler   = new NodeCronScheduler(config.RELEASE_CHECK_CRON, logger);

  // adapters → ports
  const subscriptionsRepo = new PrismaSubscriptionRepository(prisma);
  const repositoriesRepo  = new PrismaRepositoryRepository(prisma);
  const confirmationTpl   = new ConfirmationEmailTemplate(urls);
  const releaseTpl        = new ReleaseEmailTemplate(urls);

  // application
  const subscribe   = new SubscribeUseCase(subscriptionsRepo, repositoriesRepo, github, email, confirmationTpl, logger);
  const confirm     = new ConfirmSubscriptionUseCase(subscriptionsRepo);
  const unsubscribe = new UnsubscribeUseCase(subscriptionsRepo);
  const list        = new ListSubscriptionsUseCase(subscriptionsRepo);
  const checkReleases = new CheckReleasesUseCase(repositoriesRepo, github, email, releaseTpl, logger);

  // presentation
  const subscriptionController = new SubscriptionController(subscribe, confirm, unsubscribe, list);
  const errorRegistry = new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(config.NODE_ENV),
  ]);

  const httpApp = buildHttpApp({ subscriptionController, errorRegistry, apiKey: config.API_KEY, logger });
  const grpcServer = buildGrpcServer({ subscriptionController, errorRegistry, apiKey: config.API_KEY, logger, config });

  scheduler.schedule(() => checkReleases.execute());
  return { httpApp, grpcServer, scheduler };
};
```

`src/index.ts` shrinks to: parse config → `buildApp` → start servers → wire graceful shutdown over the returned handles.

## 9. Testing Strategy

Every collaborator is a constructor argument after the refactor, so tests use plain hand-rolled fakes — no `jest.mock` of module paths.

| Layer | Test type | Doubles |
| --- | --- | --- |
| `domain/` | Unit (pure) | None |
| `application/` use cases | Unit | Hand-rolled in-memory fakes per port |
| `infrastructure/` adapters | Integration | Real Prisma, real Redis, real fetch against a fixture server |
| `presentation/` controllers + routers | Integration | Supertest with a real `buildApp(config)` and fake adapters injected via a `TestComposition` |

**Fakes shipped with the refactor** (one file each, reusable):

```
tests/fakes/
├── in-memory-subscription.repository.ts
├── in-memory-repository.repository.ts
├── fake-github.client.ts
├── fake-email.sender.ts
├── fake-cache.ts
├── silent.logger.ts
└── fixed.clock.ts
```

**Test composition:**

```ts
// tests/test-composition.ts
export const buildTestApp = (overrides: Partial<Deps> = {}) => {
  const deps = { ...defaults(), ...overrides };
  // same wiring as buildApp, but takes injected deps
};
```

The existing integration tests (`tests/integration/{app.api,subscription.api,grpc.api}.spec.ts`) are rewritten against `buildTestApp` — same assertions, no `jest.mock` of `prisma` / `nodemailer`.

## 10. Principle-to-Artifact Cross-Reference

A grader (or reviewer) can locate each principle as follows:

### SOLID

| Principle | Where to look |
| --- | --- |
| **S**RP | `application/subscription/*.use-case.ts` (one class per workflow); `infrastructure/email/` split into `NodemailerEmailSender` / `ConfirmationEmailTemplate` / `ReleaseEmailTemplate` / `AppUrlBuilder`; `presentation/http/error-translators/*.translator.ts` (one class per error family). |
| **O**CP | `presentation/http/error-translators/` — adding a new translator means a new class + one line in the composition root, never an edit to existing code. Same shape for `CachePort` adapters and `EmailSenderPort` adapters. |
| **L**SP | `RedisCache` ↔ `NoopCache` are interchangeable behind `CachePort`; `InMemorySubscriptionRepository` ↔ `PrismaSubscriptionRepository` interchangeable in tests vs. production. |
| **I**SP | Every port has 3–6 methods. `EmailSenderPort` only sends; `CachePort` is just `getJson`/`setJson`; clients can't be forced to implement methods they don't use. |
| **D**IP | `application/` only imports `domain/` and `application/ports/`. Concretions live in `infrastructure/` and are wired in `composition-root.ts`. |

### GRASP

| Principle | Where to look |
| --- | --- |
| **Information Expert** | `Subscription.confirm()` — the entity owns the "can't confirm twice" rule. |
| **Creator** | `composition-root.ts` creates and wires every object; classes don't `new` their own collaborators. |
| **Controller** | `SubscriptionController` is the single controller for the subscription workflow; HTTP and gRPC transports both delegate to it. |
| **Low Coupling** | Use cases depend on ports; three transports share one controller; one error registry serves both HTTP and gRPC. |
| **High Cohesion** | Each use case class contains only the code for one workflow; email module split into sender / template / URL builder. |
| **Polymorphism** | `ExceptionTranslatorRegistry` chain-of-responsibility replaces type-switching; `CachePort` has two implementations the use case can't tell apart. |
| **Pure Fabrication** | `SubscriptionRepositoryPort`, `EmailSenderPort`, `ExceptionTranslatorRegistry` etc. — designed artefacts, not domain concepts. |
| **Indirection** | `ExceptionTranslatorRegistry` sits between the Express middleware and the translator classes; ports sit between use cases and adapters. |
| **Protected Variations** | Prisma error codes are decoded only inside `PrismaSubscriptionRepository` and `PrismaExceptionTranslator`; the rest of the system sees only domain errors. The fetch / SMTP / Redis / cron / pino libraries are quarantined in `infrastructure/`. |

## 11. Migration Order

```
Step 1 — Scaffolding (no behavior change)
  • Create empty domain/, application/, infrastructure/, presentation/ folders.
  • Move existing common/errors/ → domain/errors/  (already pure).
  • Move common/logger/ interface → application/ports/logger.port.ts.
  • Keep current code working by re-exporting from old paths during transition.

Step 2 — Ports
  • Author all ports in application/ports/ (no implementations yet).
  • Compiles, no runtime change.

Step 3 — Infrastructure adapters
  • Implement Prisma repositories, GitHubHttpClient, NodemailerEmailSender,
    RedisCache, NoopCache, FetchHttpClient, PinoLogger, NodeCronScheduler,
    ConfirmationEmailTemplate, ReleaseEmailTemplate, AppUrlBuilder.
  • Old module-level functions still exist; they remain unused once Step 5
    switches the entrypoint.

Step 4 — Application layer
  • Build use case classes: SubscribeUseCase, ConfirmSubscriptionUseCase,
    UnsubscribeUseCase, ListSubscriptionsUseCase, CheckReleasesUseCase,
    NotifyRepositorySubscribersUseCase.
  • Build the Subscription entity with confirm() behavior.

Step 5 — Composition root
  • Author src/composition-root.ts with buildApp(config).
  • src/index.ts switches to calling buildApp(); old modules still imported
    but unused.

Step 6 — Presentation
  • Build SubscriptionController, buildApiRouter, buildWebRouter,
    rewritten grpc.handlers using injected use cases.
  • app.ts becomes a buildHttpApp() factory.

Step 7 — Error translators
  • Build ExceptionTranslator registry and translators.
  • Replace error.middleware.ts and grpc.error-mapper.ts.

Step 8 — Tests
  • Add tests/fakes/ + tests/test-composition.ts.
  • Rewrite unit tests against fakes; rewrite integration tests against
    buildTestApp.

Step 9 — Cleanup
  • Delete src/modules/, src/jobs/, src/common/* that's been migrated.
  • Delete re-export shims from Step 1.
  • Update README.md "Architecture" section to describe the new layout.
```

Each step is a separate commit. Steps 1–2 are additive (safe). Steps 3–6 leave the app behaviorally identical. Step 9 is the only deletion step.

## 12. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Re-export shims in Step 1 are accidentally left behind | Step 9 explicitly deletes them; CI lint forbids imports from `src/modules/**` once the migration is done. |
| Behavioral regressions during the migration | After Step 5, the integration test suite (`tests/integration/*`) runs against the new `buildApp` and must stay green. |
| Over-engineering for a ~2k LOC codebase | Acknowledged: optimizing for grading visibility, not minimum diff. No DI container, no event bus, no CQRS — only the layout and patterns that map 1:1 to SOLID/GRASP. |
| New `NoopCache` re-adds code the recent refactor removed | Brought back deliberately to demonstrate Polymorphism / LSP — documented in §6. |
| Tempting to force gRPC handlers through `SubscriptionController` (HTTP-shaped) | Per §8: gRPC handlers are a sibling class that holds the same use cases; deduplication lives at the use-case layer, not the controller. |
| Three transports calling the same use case may break HTTP-specific error formatting | Web routes wrap errors with `sendWebError` / `renderHtmlMessage` before the response leaves the controller; API uses the JSON error middleware; gRPC uses `GrpcExceptionTranslatorRegistry`. |

## 13. Out of Scope

- New product features.
- Performance work (async fanout, queues, batch email).
- Distributed scheduler coordination.
- Switching ORMs, transports, or providers.
