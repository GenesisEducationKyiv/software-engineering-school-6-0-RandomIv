# ADR-002: GitHub API Caching Strategy

**Status:** Accepted  
**Date:** 2026-05-08  
**Author:** Oleksandr Ivanishin

## Context

The service repeatedly calls GitHub APIs for repository and release information lookups.

Without caching, repeated reads increase latency and consume GitHub rate limit faster.
The system must remain operational even when the caching layer is unavailable.

## Considered Options

### 1. No cache

- **Pros:** simplest implementation, no extra component.
- **Cons:** higher GitHub request volume, slower repeated lookups, less protection against rate limits.

### 2. In-memory per-process cache

- **Pros:** no external dependency, fast local lookups, reduces repeated GitHub calls within a single process.
- **Cons:** cache is lost on restart, not shared across instances (limited global rate-limit savings), no operational control from outside process.

### 3. Mandatory Redis cache

- **Pros:** shared cache across instances, predictable behavior in distributed deployments, strongest reduction of duplicate GitHub calls and rate-limit pressure when healthy.
- **Cons:** hard runtime dependency; service reliability becomes coupled to Redis availability, with no degraded mode during Redis outages.

### 4. Optional Redis cache with graceful fallback

- **Pros:** shared cache when Redis is healthy (reduces GitHub calls/rate-limit usage across instances); service still operates without Redis.
- **Cons:** behavior differs by environment and during Redis outages (cache hit ratio drops and GitHub rate-limit pressure increases).

## Decision

Choose **optional Redis cache with graceful fallback**.

- Use a Redis-backed cache when the connection URL is configured via environment variables and the connection succeeds.
- Fall back to a no-op cache implementation when Redis is unavailable.
- Cache GitHub responses using a configurable TTL.

## Consequences

### Positive

- Reduced repeated GitHub calls when cache is active.
- Better resilience: cache layer outages do not stop core flows.
- Unified code path supports both cached and non-cached environments.

### Negative

- During cache outages, performance and rate-limit benefits are reduced.
- Cached responses can be stale until TTL expiry.
- Cache failures are logged but do not fail requests, so cache guarantees are best-effort.
