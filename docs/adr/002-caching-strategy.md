# ADR-002: GitHub API Caching Strategy

**Status:** Accepted  
**Date:** 2026-05-08  
**Author:** Oleksandr Ivanishin

## Context

The service repeatedly calls GitHub APIs for:

- repository existence checks during subscribe flow;
- latest release checks in the scheduled scanner.

Without caching, repeated reads increase latency and consume GitHub rate limit faster.
At the same time, the service must keep working if Redis is unavailable.

## Considered Options

### 1. No cache

- **Pros:** simplest implementation, no extra component.
- **Cons:** higher GitHub request volume, slower repeated lookups, less protection against rate limits.

### 2. In-memory per-process cache

- **Pros:** no external dependency, fast local lookups.
- **Cons:** cache is lost on restart, not shared across instances, no operational control from outside process.

### 3. Mandatory Redis cache

- **Pros:** shared cache across instances, predictable behavior in distributed deployments.
- **Cons:** hard runtime dependency; service reliability becomes coupled to Redis availability.

### 4. Optional Redis cache with graceful fallback

- **Pros:** shared cache when Redis is healthy; service still operates without Redis.
- **Cons:** behavior differs by environment and during Redis outages (cache hit ratio drops).

## Decision

Choose **optional Redis cache with graceful fallback**.

- Use Redis-backed cache when `REDIS_URL` is configured and connection succeeds.
- Fall back to a no-op cache implementation when Redis is unavailable.
- Cache GitHub responses using TTL (`GITHUB_CACHE_TTL_SECONDS`).

## Consequences

### Positive

- Reduced repeated GitHub calls when cache is active.
- Better resilience: Redis outages do not stop core subscription/scan flows.
- One code path supports both Redis-enabled and Redis-less environments.

### Negative

- During Redis outages, performance/rate-limit benefits are reduced.
- Cached responses can be stale until TTL expiry.
- Cache failures are logged but do not fail requests, so cache guarantees are best-effort.

## Implementation Notes

- `cacheService` abstracts cache access and delegates to Redis or `nullCache`.
- Redis client uses a reconnect cooldown after connection failure.
- Cache keys are namespaced for GitHub repo info and latest release endpoints.
