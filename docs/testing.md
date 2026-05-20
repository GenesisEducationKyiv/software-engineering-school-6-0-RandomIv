# Testing

Install dependencies once:
```
npm ci
```

Run unit tests:
```
npm run test:unit
```

Run integration tests (spins up isolated Postgres + Redis via Docker):
```
npm run test:integration:env
```

Run E2E tests (spins up isolated app + Postgres + Redis via Docker):
```
npm run test:e2e:env
```

Run lint + typecheck:
```
npm run lint
npm run build
```
