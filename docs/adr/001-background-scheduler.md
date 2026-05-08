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
- Optional Redis cache for GitHub responses

We need periodic execution with minimal infrastructure and straightforward operations.

## Considered Options

### 1. Message Broker + Workers (RabbitMQ / Kafka)

- **Pros:** Decoupled processing, durable queues, mature retry patterns, better horizontal scaling.
- **Cons:** Adds extra infrastructure and operational overhead for current system size.

### 2. Database Queue Pattern (PostgreSQL `SKIP LOCKED`)

- **Pros:** No new infrastructure component, supports worker competition.
- **Cons:** Increases DB complexity/load, requires explicit queue lifecycle management.

### 3. In-Process Scheduler (`node-cron`)

- **Pros:** Simple implementation, no additional services, easy local/dev parity.
- **Cons:** Job execution is tied to app process lifecycle; multi-instance deployments may duplicate scans.

## Decision

Use **in-process scheduling with `node-cron`**.

Implementation details in current codebase:

- Scheduler starts at app bootstrap (`initReleaseCheckJob`).
- Cron expression comes from `RELEASE_CHECK_CRON` (default `*/5 * * * *`).
- Scanner processes repositories sequentially, sends notifications, and updates `lastSeenTag` only when all emails for that repository succeed.
- On GitHub rate-limit errors, scanner stops the current cycle and continues on next cron tick.

## Consequences

### Positive

- **Low operational overhead:** no broker/worker runtime to deploy or monitor.
- **Fast delivery:** implementation is direct and readable in one service.
- **Good fit for current load:** periodic polling and notification flow works with current architecture.

### Negative

- **Horizontal scaling risk:** with multiple app instances, each instance can run the same cron job.
- **No durable queue semantics:** failed work is retried only on subsequent scheduler cycles.
- **Limited backpressure controls:** large spikes rely on application-level flow, not broker primitives.

### Notes

- Redis is currently used for optional GitHub response caching (TTL), **not** for distributed scheduler locking.
