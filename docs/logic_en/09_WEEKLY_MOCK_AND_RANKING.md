# Weekly Mock Exams and Competitive Ranking

## Weekly mocks and internal MMR

A placed participant's representative weekly result updates only that user's internal competitive MMR, RD, and volatility. It never changes public competitive points or tier. Non-participation changes neither internal MMR nor public points.

## Weekly mock exam

- Operators manage papers, schedules, answers, and grading policy.
- One official exam opens each Sunday at 15:00 KST and locks the following Saturday at 12:00 KST. Attempts last at most 100 minutes from the user's start and cannot extend past the weekly cutoff.
- Operators choose `WEEKLY` (Sunday 15:00 release) or `CUSTOM` (a manually specified release). CUSTOM retains its full personal 100-minute timer and exclusion from official MMR settlement and automatic archiving.
- Official aggregation, results, explanations, and archive publication occur after the Saturday noon cutoff. Future A/B/C reservations are consolidated before release; completed exam history is preserved.
- Web and native clients share the same attempt and submission state.
- Evidence, objections, and operator decisions attach to the exam record.
- Applying a user-and-week MMR result is exactly once through a dedicated settlement ledger and unique index.
- If an answer correction changes the representative result, only the difference from the existing weekly settlement is applied to current internal MMR.

## Ranking boundaries

- `ArenaCompetitiveProfile` owns internal competitive MMR and separate public competitive points.
- Internal MMR is used only for matchmaking and public-point change calculations.
- Normal has no public leaderboard.
- Existing tier cutoffs apply to public competitive points.
- Every overall, school, university, retaker, and worker ranking uses public competitive points.

## Privacy

Public ranking responses use the server-generated display identity and permitted school/region fields. They exclude email, birth date, payment data, and storage keys.
