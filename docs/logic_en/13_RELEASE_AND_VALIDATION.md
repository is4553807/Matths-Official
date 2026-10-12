# Release and Validation

## Automated checks

The core current-state regression boundary includes:

- `npm run account-plans:verify`
- `npm run active-commerce:verify`
- `npm run arena-v2:verify`
- `npm run arena-v21:verify-scoring`
- `npm run arena-v22:verify-rulebook`
- `npm run arena-normal-baseline:verify`
- `npm run arena-cheating-modes:verify`
- `npm run logic-parity:verify`
- `npm run ui:verify`
- `npm run contrast:verify`

Replica-set database suites verify transactions, indexes, idempotent settlement, and concurrent requests. Rating simulations separately cover normal baseline records and one-sided competitive updates. The current 45.67% different-set fairness result is accepted as adequate; no further constant tuning is performed to target that figure.

## Staging

Before production, apply Arena indexes to a separate staging database and inspect query plans. Verify upload, read, and deletion with real Cloudinary/R2 configuration. Verify KG Inicis and Apple ownership and replay boundaries in their test environments.

## Manual QA

- Desktop Chrome and Safari: play, result, and challenge sharing
- iPad and iPhone: grid board, rotation, reconnect, and finalization
- Small screens: rules, friends, profile, leaderboard detail
- Competitive: held review, supplemental evidence, finalization, exactly-once internal-MMR update, and exactly-once public-point update
- Normal: immediate result/XP after a signal, opponent-record quarantine, and operator approval back into the pool
- Weekly mock: participant internal MMR changes while public points and every non-participant value remain unchanged

## Deployment gate

Production deployment requires automated checks, staging indexes, real-storage verification, concurrent settlement testing, browser/mobile QA, and rating-fairness review. Competitive activation repeats the same gate before enabling its runtime flag.
