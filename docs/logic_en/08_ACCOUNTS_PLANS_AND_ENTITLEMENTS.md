# Accounts, Plans, and Entitlements

## Plans

`FREE` and `PRO` are the current student plan codes. Free costs zero and has no expiry. Pro defaults to KRW 5,500 for 30 days and is configured by `MATTHS_PRO_PRICE_KRW` and `MATTHS_PRO_BILLING_PERIOD_DAYS`. Administrators receive non-expiring `SUPER_ADMIN` access.

## Commerce

- Web Pro checkout uses KG Inicis.
- Native Pro purchase uses the configured Apple product, receipt validation, transaction ownership, and server notifications.
- A plan changes only after provider verification and idempotent processing.
- Refund processing reconciles the payment ledger and subscription state and writes an operator audit record.

## Entitlement resolution

`accountPlanService` resolves role, dates, and status into a Free, Pro, or administrator view. The plan view supports historical billing and operator workflows. Weekly mocks, published archive materials, placement assessments, and Exchange are free to use. Weekly results from placed students follow the existing internal MMR rules. New Pro sales are paused on web and app.

## Registration and nickname ownership

Email, Google, Kakao, and Apple authentication are supported. Member and guest nicknames are reserved atomically in one normalized namespace. Guest-record claims require nickname, birth-date digest, browser ownership proof, and explicit user confirmation.
