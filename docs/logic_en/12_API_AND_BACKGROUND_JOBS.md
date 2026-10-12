# API and Background Jobs

## HTTP boundaries

Web routes use session authentication and EJS. `/api/v1` provides the native Bearer JSON contract. Both call the same services and do not maintain separate match rules.

## Arena surface

The active surface includes the Arena read model and rulebook, matchmaking and status, friends and friendly invitations, match commands, grid-board persistence, evidence and supplemental evidence, results, challenge creation, guest participation, leaderboard, and participant details.

Write commands use `Idempotency-Key`; native match commands also require `X-Matths-Client-Version`. Services revalidate dynamic IDs and ownership.

## Schedulers

After Mongo connects, the server starts required schedulers for match timers, evidence retention, notification outbox, integrity deadlines, weekly mocks, academy work, archive retention, and temporary-file cleanup. A Mongo-backed lease ensures one worker executes each job across processes.

## Errors and observability

Error middleware separates web and JSON responses and does not expose internal stacks. Readiness checks cover the database and required external configuration. Operational metrics query the current source collections on demand, while audit events record server IDs and state codes rather than user secrets.
