# Matths Current System

Current as of 2026-10-11 KST.

## Product

Matths provides high-school mathematics learning, assessments, placement exams, weekly mock exams, GOAT Arena, community, resources, parent and academy portals, and operator tools. The web application uses Express and EJS. The iOS/iPad client uses the same MongoDB data and `/api/v1` JSON API.

## Accounts and plans

- Student accounts use either Free or Pro.
- Pro defaults to KRW 5,500 for 30 days and is environment-configurable.
- Administrators have non-expiring administrator access.
- Web authentication uses sessions; native authentication uses Bearer tokens.
- Members and challenge guests share one normalized nickname namespace.

## Learning and assessment

Concept learning, practice, review, general assessments, and placement grading are server-authoritative. A weekly mock result changes only the placed participant's internal competitive MMR, RD, and volatility. It never changes public competitive points. Non-participation changes neither value.

## GOAT Arena

- Normal uses hidden MMR to select difficulty and an opponent record.
- Competitive uses three completed normal matches, one to five placement samples, an internal Glicko-2 MMR, and separate public competitive points.
- Friendly difficulty is based on the mean effective rating of both members.
- A group challenge shares a completed Arena problem set with multiple guests for three days.
- Every mode uses five questions, ten minutes per question, submitted answers, and complete working evidence.
- Every overall, school, university, retaker, and worker ranking is a competitive ranking ordered by public competitive points.

## Data and operations

MongoDB is authoritative for accounts, matches, assessments, commerce, and operational state. Large files live in configured storage and MongoDB stores their authorization and integrity metadata. Settlements and payment changes use transactions and idempotency boundaries.
