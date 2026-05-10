# ADR-003: API Authentication and Public Link Strategy

**Status:** Accepted  
**Date:** 2026-05-08  
**Author:** Oleksandr Ivanishin

## Context

The system exposes machine-facing interfaces (REST API and gRPC) and user-facing email/browser flows (confirm/unsubscribe links and subscription page).

We need:

- strong protection for automation endpoints;
- frictionless confirm/unsubscribe actions from email links;
- minimal operational complexity for current project scope.

## Considered Options

### 1. Fully public endpoints

- **Pros:** easiest to consume.
- **Cons:** unacceptable abuse risk (spam subscriptions, data exposure, endpoint scraping).

### 2. Full user accounts with sessions/JWT

- **Pros:** strong user identity model and fine-grained authorization.
- **Cons:** significant extra scope (auth lifecycle, password reset, account management) not required for current product.

### 3. API key for every endpoint (including email-link actions)

- **Pros:** one uniform protection mechanism.
- **Cons:** poor UX for end users; technically possible via links, but fundamentally insecure for user-facing confirm/unsubscribe flows because secrets would be exposed to recipients.

### 4. Split boundary: API key for programmatic APIs + token links for user actions

- **Pros:** secure machine APIs and practical email/browser UX.
- **Cons:** multiple auth mechanisms must be documented and kept consistent.

## Decision

Choose **split auth boundary**:

- Protect REST `/api/*` with `x-api-key`.
- Protect all gRPC methods with `x-api-key` metadata.
- Use token-based public links for `/web/confirm/:token` and `/web/unsubscribe/:token`.
- Keep `/web/subscribe` public but rate-limited.

## Consequences

### Positive

- Good security posture for machine-to-machine usage.
- Smooth user experience for confirmation/unsubscribe from email.
- Keeps implementation lightweight (no user account subsystem).

### Negative

- Different transports have different auth paths, increasing documentation/testing surface.
- Token leakage risk must be treated carefully in logs and URLs.

## Implementation Notes

- REST API key enforcement: `requireApiKey` middleware.
- gRPC API key enforcement: metadata check in gRPC handlers.
- Public subscribe route has IP rate limiting (`5` requests / `15` minutes).
- Confirm/unsubscribe rely on per-subscription tokens stored in database.
