# ADR-001: In-Process Background Scheduler

**Status:** Accepted  
**Date:** 2026-05-08  
**Author:** Oleksandr Ivanishin

## Context

The service must periodically check subscribed GitHub repositories for new releases and notify confirmed subscribers by email.

Current production architecture is a single Node.js monolith with:

- HTTP API (Express)
- gRPC API
- PostgreSQL (Prisma)

We need periodic execution with minimal infrastructure and straightforward operations.

## Considered Options

### 1. Message Broker + Workers

- **Pros:** Decoupled processing, durable queues, mature retry patterns, better horizontal scaling.
- **Cons:** Adds extra infrastructure and operational overhead for current system size.

### 2. Database Queue Pattern 

- **Pros:** No new infrastructure component, supports worker competition.
- **Cons:** Increases DB complexity/load, requires explicit queue lifecycle management.

### 3. In-Process Scheduler 

- **Pros:** Simple implementation, no additional services, easy local/dev parity.
- **Cons:** Job execution is tied to app process lifecycle; multi-instance deployments may duplicate scans.

## Decision

Use **in-process scheduling**.

- The scheduler initializes at application startup.
- The execution interval is configurable via environment variables.
- The scanner processes repositories sequentially (for simplicity and to control email provider load).
- It updates the repository's processed state only when all notifications for that repository succeed.
- On GitHub rate-limit errors, the scanner aborts the current cycle and resumes on the next scheduled tick.
- Delivery semantics are effectively **at-least-once**: partial send failures (or crashes before state updates) can cause duplicate notifications during the next cycle.

## Consequences

### Positive

- **Low operational overhead:** no broker/worker runtime to deploy or monitor.
- **Fast delivery:** implementation is direct and readable in one service.
- **Good fit for current load:** periodic polling and notification flow works with current architecture.

### Negative

- **Horizontal scaling risk:** with multiple app instances, each instance can run the same scheduled job.
- **No durable queue semantics:** failed work is retried only on subsequent scheduler cycles.
- **Duplicate notification risk on partial failures:** because the repository state is updated only after full success, retries can re-notify already-emailed subscribers.
- **Limited backpressure controls:** large spikes rely on application-level flow, not broker primitives.
