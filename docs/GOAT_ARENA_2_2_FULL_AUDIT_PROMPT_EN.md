# Paste-ready Codex prompt: exhaustive Matths / GOAT Arena 2.2 audit

Copy everything below the horizontal rule into a new Codex task opened at the root of the `Matths-Official` repository.

---

You are conducting a release-blocking, read-only, evidence-based audit of the current Matths web/server/native API codebase, with special emphasis on GOAT Arena 2.2. Treat this as a safety-critical product and data-integrity review. The requested standard is exhaustive coverage and the highest accuracy you can achieve. Do not claim “100% correct,” “fully verified,” or “production ready” unless every relevant assertion is backed by direct source evidence and the required environment-dependent checks were actually performed. Explicitly label every unverified assumption, inaccessible external dependency, missing fixture, and manual QA dependency.

## Mission

Determine whether the repository implements the current product contract completely and consistently across:

- server-side business logic;
- MongoDB schemas, indexes, migrations, and retention rules;
- web routes, native `/api/v1` routes, controllers, serializers, and error responses;
- web EJS, browser JavaScript, CSS, responsive layouts, and accessibility;
- iPhone/iPad integration contracts and mobile user flows;
- authentication, authorization, privacy, upload security, and guest ownership proof;
- concurrency, transactions, compare-and-set operations, idempotency, retries, and settlement ledgers;
- notifications, emails, outbox events, and prohibited legacy messages;
- Free/Pro/admin entitlements, web commerce, Apple commerce, refunds, and retired products;
- operator pages and operational metrics;
- weekly mock exams and competitive ranking;
- documentation, tests, simulations, scripts, and deployment gates;
- removal of legacy payback, Arena shop/economy, automatic defense, old Standing, and inactive code paths.

This task is an audit, not an implementation task. Do not edit source files, do not reformat files, do not create migrations, do not seed data, do not send email, do not call live payment/storage providers, do not apply indexes to a remote database, do not change environment variables, and do not deploy anything. You may run read-only source searches and safe local/isolated test suites. If a test or command can mutate an external environment, do not run it; describe exactly what would be needed instead.

## Repository context and evidence precedence

Start from the repository root. Read these files completely before drawing conclusions:

1. `docs/GOAT_ARENA_2_2_APP_DEVELOPER_HANDOFF.md`
2. `README.md`
3. all files under `docs/logic/`
4. all files under `docs/logic_en/`
5. `audit/GOAT_ARENA_2_2_GAP_REPORT.md`
6. `audit/GOAT_ARENA_ASYNC_SIMULATION_RESULTS.json`
7. `audit/GOAT_ARENA_NORMAL_BASELINE_SIMULATION_RESULTS.json`
8. `.env.example`
9. `package.json`
10. `docs/GOAT_ARENA_2_2_CHANGED_FILES.md`

The handoff and documentation are specifications to verify, not proof that the code is correct. Never accept a claim merely because it appears in a Markdown file, a code comment, a test name, a fixture, or a previous report. Verify every material claim against the active route-to-controller-to-service-to-model execution path. When documentation and code disagree, report the discrepancy and identify the actual runtime behavior. When a test asserts the same implementation detail it is meant to validate, call out that circularity.

Use the following evidence priority:

1. active runtime route and middleware wiring;
2. reachable controller and service code;
3. schema constraints, indexes, transaction boundaries, and persisted state transitions;
4. integration/DB tests with behaviorally independent assertions;
5. static verification scripts;
6. documentation and comments.

Do not treat deleted files, unreachable exports, dormant services, unmounted routes, or text found only in archived/audit artifacts as active product behavior. Conversely, search for active references before declaring any legacy feature removed.

## Required audit method

Before evaluating requirements, build these inventories:

1. All mounted web and `/api/v1` routes relevant to Arena, placement, weekly mock, ranking, plans, commerce, admin, notifications, evidence, guest challenge, profile, and registration.
2. For every route, its middleware chain, authentication boundary, rate limits, upload validators, controller, service calls, DB models, possible settlement trigger, and response shape.
3. All Arena-related Mongoose models and every index, including uniqueness, partial filters, TTL behavior, and query/index alignment.
4. All user-facing Arena EJS views, browser scripts, CSS files, mobile breakpoints, ARIA semantics, and client-side state transitions.
5. All native controllers and their exact request/response/error contracts.
6. Every notification/email/outbox producer that can be reached from an Arena, placement, guest, review, weekly mock, plan, payment, or refund flow.
7. Every ranking producer and every consumer of `ArenaCompetitiveProfile`, `competitiveScore`, internal rating fields, legacy `RankingProfile`, `ArenaStanding`, GP, or old final-ranking models.
8. All environment flags and constants that affect these behaviors, including fallback behavior when unset or malformed.
9. All related tests/scripts, what they actually assert, and what they do not cover.
10. The exact current Git working-tree status, including modified, deleted, renamed, and untracked files, without assuming every change belongs to the same feature.

Create a requirement traceability matrix. Each requirement below must receive exactly one primary status:

- `PASS — directly verified`
- `PARTIAL — some path or platform differs`
- `FAIL — active behavior contradicts the contract`
- `NOT IMPLEMENTED`
- `UNVERIFIED — requires external environment or manual observation`
- `NOT APPLICABLE — explain why`

The canonical contract below contains 242 numbered requirements across sections A through R. Give them stable IDs `A1` through `R7`, include all 242 exactly once, and reconcile the final status totals to 242. The separately numbered report-format instructions are not product requirements and must not be counted in that total.

For every item, cite repository-relative file paths and exact 1-based line ranges. Include the call chain and the test evidence when available. If the line numbers change during your inspection, re-read the file before finalizing citations.

## Canonical product contract to audit

### A. Shared Arena match contract

Verify all web and native paths, not only the happy path.

1. Every normal, competitive, friendly, and guest challenge match uses exactly five questions.
2. Each question has a ten-minute solve window.
3. Answers and complete working are mandatory.
4. Desktop supports file upload; touch phone/tablet supports a per-question grid writing board.
5. Capture/upload time is excluded from valid solve time.
6. Moving to the next question locks the current answer and working according to the server state machine.
7. A final submission cannot settle until all required working exists.
8. Voluntary forfeit is rejected after final evidence/working submission.
9. Arena is available 24/7 including Sunday. Search for weekday, Sunday, maintenance-window, cron, and protected availability checks that could contradict this.
10. Results show both competitors’ five actual questions, source accuracy per question, each submitted answer, correctness, total correct, valid solve time, difficulty-adjusted performance, complete working, and a clear server-generated win/loss/draw explanation.
11. Results do not expose a separate official answer key or model solution.
12. Evidence access is authorized by match participation, challenge ownership/proof, or operator permission. Direct object ID or file-index manipulation must not disclose another user’s files.
13. Web and native commands share the same server-authoritative attempt and settlement services. There must be no duplicate client-side scoring or rating authority.

### B. Normal mode

1. Normal is available to an authenticated student without competitive placement.
2. Its hidden MMR starts at 1000, with separate RD and volatility.
3. Normal has no public tier and no normal leaderboard.
4. Difficulty and record selection use normal hidden MMR, not public competitive score.
5. The server chooses an approved completed normal record near the current user’s hidden MMR; it may use an approved baseline record when the live record pool is insufficient.
6. Baseline data is stored per question and five questions are composed at runtime, rather than treating every baseline as a permanently fixed five-question set.
7. Opponents can have different question sets of comparable difficulty.
8. A question instance shown to a user is excluded from that user’s next five combined normal/competitive matches.
9. The historical record itself is immediately reusable for other eligible users. No obsolete 20-match record cooldown remains active.
10. The current challenger alone receives hidden MMR/RD/volatility/streak updates. The owner of the historical record is not retroactively modified.
11. Outcome is based on correctness, source accuracy, and valid solve time through the configured difficulty-adjusted comparison; it is not simple correct-count-first scoring.
12. Existing XP behavior is preserved for a valid normal completion.
13. Valid normal completions count toward the three-match competitive placement unlock.
14. Automated anomaly detection runs, but never delays the user result, removes XP, locks access, penalizes the user, or sends an email.
15. A clean result becomes an `AVAILABLE` opponent record automatically.
16. A flagged result becomes `REVIEW_REQUIRED`; operator approval changes it to `AVAILABLE`, rejection changes it to `INVALID`.
17. Normal review actions do not send email.
18. A completed normal result can create a group challenge.

### C. Competitive mode

1. The feature defaults off through `ARENA_COMPETITIVE_ENABLED=false` or an equivalent safe fallback.
2. The client obeys the server’s availability/eligibility/release state and cannot bypass it.
3. Unlock requires three valid normal matches and a separately finalized placement.
4. Placement accepts one through five valid attempts and permits the user to finalize before five.
5. Server-side errors do not consume an attempt.
6. User abandonment does not automatically restore an attempt.
7. Five exhausted attempts without a valid result require authorized operator reset.
8. No legacy tier is silently converted into new MMR.
9. Candidate defaults are rating 1500, RD 350, volatility 0.06, tau 0.5 and remain configurable.
10. Initial RD is `350 / sqrt(valid placement samples)` unless explicitly configured.
11. Placement volatility for one through five samples defaults to `0.10, 0.09, 0.08, 0.07, 0.06`.
12. Fewer placement samples create materially greater uncertainty than five samples.
13. RD/volatility convergence is continuous. There is no abrupt special multiplier at match six.
14. The opponent is an approved completed competitive record near internal MMR.
15. The match freezes the opponent’s rating/RD/volatility and complete result/evidence snapshot.
16. The two sides may receive different five-question sets.
17. The same five-match question-repeat exclusion applies.
18. Normal and competitive use the same difficulty-adjusted comparison contract.
19. Exactly one internal Glicko-2 update occurs for the current challenger per finalized competitive match.
20. Exactly one separate public competitive point update occurs from actual outcome versus expected outcome derived from internal MMR.
21. The historical opponent owner’s live internal MMR, public score, record, XP, and tier do not change.
22. Reversal damping applies to a loss after a win streak and a win after a loss streak according to configurable rules.
23. Internal MMR is not presented as the public competitive score.
24. Public competitive score, not internal MMR, determines displayed tier and all public ranking order.
25. Current public point defaults are configurable K 32, scale 400, minimum 0.
26. Existing tier cutoffs are preserved: Bronze 0–799, Silver 800–924, Gold 925–1024, Platinum 1025–1119, Emerald 1120–1209, Diamond 1210–1329, Master 1330–1439, Grandmaster 1440–1519, Challenger 1520+.
27. Population-based upper-tier caps, if still active, operate only on the intended public ranking and cannot mix internal MMR with public score.
28. Competitive retains automated integrity detection, pending review, supplemental evidence, operator adjudication, and authorized notification behavior.
29. Final evidence prevents voluntary forfeit.
30. A completed competitive result can create a group challenge.

### D. Scoring and mathematical correctness

Audit `services/arenaCompetitiveScoringService.js` and every caller.

1. A performance requires exactly five actual server-graded observations.
2. `sourceAccuracyRate` is a finite decimal strictly between 0 and 1; missing values and percentages are not silently inferred, imputed, clamped, or normalized.
3. Confirm the implementation of:

```text
correctCount = Σx
expectedCorrect = Σp
variance = Σp(1-p)
z = (correctCount - expectedCorrect) / sqrt(variance)
```

4. Nonpositive variance and invalid timing produce an invalid official comparison rather than a fabricated result.
5. For normal/competitive, z-difference beyond the configured close threshold chooses the higher performance; inside the close range, shorter valid solve time wins; exactly equal time draws.
6. Capture/upload time is excluded before comparison, not subtracted from a value that includes unrelated waiting time.
7. For group challenge ranking, correct count is primary and valid solve time is the tie-breaker; z is informational.
8. Every caller uses the correct comparison function. Search for any surviving correct-count-first normal/competitive path.
9. The public UI does not expose the formula or label it `Z-score`; use user-safe wording such as difficulty-adjusted performance.
10. Recompute representative test fixtures independently and identify any fixture with an incorrect answer, source accuracy, variance, z-value, or winner. Specifically inspect the known history around `NORMAL-U1-Q02` and do not assume its answer is correct merely because a generator accepted it.

### E. Glicko-2, adaptive rating, and public points

1. Independently verify the Glicko-2 implementation against the standard algorithm, including scale conversion, `g(φ)`, expectation, variance, delta, volatility iteration, RD update, rating update, numerical convergence, and boundary inputs.
2. Verify outcome mapping for win/loss/draw and role inversion between challenger and historical opponent.
3. Verify the rating update uses the opponent snapshot, not the opponent’s current profile.
4. Verify one-sided settlement cannot mutate the opponent through shared references, hooks, counters, or ranking services.
5. Verify adaptive reversal damping affects only the intended delta and does not create asymmetric sign errors.
6. Verify streak counters update correctly for win, loss, draw, first result, and reversal.
7. Verify public point expectation uses internal MMR, while `beforeScore` is the public point total.
8. Verify the public score floor, rounding, draw behavior, upset behavior, and extreme rating differences.
9. Verify tier is recalculated from the post-update public score.
10. Verify rating and point ledgers, unique keys, retry behavior, transaction rollback, and partial-failure recovery.
11. Re-run safe simulations and reproduce the stored report. Explain any difference caused by randomness, seed, configuration, or changed code.
12. Verify the simulation models the current reusable-record policy rather than the retired 20-match cooldown.
13. Confirm recorded reference results: equal-skill approximately 50.08%, hard-vs-easy stress 45.67%, one-sided drift approximately -1.0419, illicit best-of-three drift approximately +30.9270. Do not require exact equality unless the simulation is deterministic; report tolerance and seed.
14. Treat 45.67% as an accepted product decision and do not recommend tuning solely to force 50%, but report any implementation error independently.

### F. Friendly mode

1. Only authenticated friends can use the member friendly invitation flow.
2. Effective MMR priority is competitive internal MMR, then normal hidden MMR, then 1000.
3. Difficulty is based on the arithmetic mean of both users’ effective MMR.
4. Friendly never changes either participant’s hidden MMR, competitive MMR, public score, tier, or XP.
5. Friendly never runs automated cheating detection.
6. Invitation create/respond/cancel authorization prevents another user from acting on an invitation.
7. Duplicate, expired, concurrent acceptance, active-match conflict, and retry behavior are correct.

### G. Group challenge and guest flows

1. A member can create a challenge only from their own valid completed normal/competitive result, or an explicitly claimed completed guest result.
2. The source has five actual questions and complete retained working.
3. The challenge shares exactly the creator’s five questions.
4. The link accepts new participants for exactly three days from creation and the server is authoritative for expiry.
5. There is currently no participant limit. Report the operational risk without silently inventing one.
6. The create UI copies the URL automatically, displays the URL below the action, and includes a separate copy button.
7. Any number of guests may use the link without login.
8. The guest enters nickname and birth date.
9. Nickname availability is validated automatically while typing; there is no required manual “check duplication” button.
10. Member and guest nicknames share one normalized atomic namespace.
11. Birth date is stored/compared through a secret-key digest and is not exposed in ordinary API responses/logs.
12. The same challenge + nickname + birth-date identity can create only one attempt.
13. Re-entering the same identity resumes the active attempt or opens the completed leaderboard; it must not create a second attempt.
14. A different nickname+birth-date pair is treated as a different participant.
15. The creator cannot enter as a duplicate guest.
16. Guest attempt ownership requires browser proof and resists token-only evidence access.
17. Guest play uses five questions, ten minutes each, mandatory working, server-authoritative progression, revision-safe boards, and finalization.
18. Guest challenge runs no MMR/public score/tier/XP changes and no automated cheating detection.
19. Leaderboard order is correct count descending, valid solve time ascending, with true ties sharing rank.
20. Participant detail tabs show actual question, submitted answer, correctness, accuracy rate, time, difficulty-adjusted performance, and complete working.
21. The creator result remains hidden until every participant who is currently joined has completed.
22. Once creator result is released, later entrants do not re-hide it.
23. Concurrent participant completion cannot release too early or fail to release.
24. Expired links reject new starts and late submissions consistently, while completed owners can still reach the appropriate result if policy permits.
25. Challenge creation sets the necessary retention hold on source evidence and handles partial hold failure safely.
26. Guest registration claim requires matching normalized nickname, birth-date digest, browser proof, explicit confirmation, and the intended first-participation-date prompt.
27. Another person who merely knows the nickname cannot claim the record.
28. A claimed record cannot be claimed again by another account.
29. The reverse-challenge action requires completed guest data and registration before creation.
30. Rate limits cover public page/start/advance/board/evidence/claim operations and cannot be bypassed through an alias route.
31. Token entropy, hashing, cookie attributes, proof expiry, CSRF/same-site behavior, and enumeration resistance are adequate.
32. Guest data retention expiry and external-file deletion/retry are identified as unverified until exercised in staging.

### H. Questions, baseline data, graph rendering, and evidence

1. Existing question skeletons and historical source accuracy data are reused.
2. Generated question snapshots preserve prompt, choices/input format, correct answer, source accuracy, difficulty, generation version, and graph assets when required.
3. Algebra/calculus I/probability-statistics distribution is 2/2/1 where required.
4. Normal uses U1–U9, competitive uses R1–R9, friendly uses average effective MMR, and challenge inherits the source questions.
5. Graph-question skeletons render correctly on web and through native API payloads.
6. Baseline question documents cannot enter matching until explicitly active and mathematically reviewed.
7. Validate all 63 current baseline question drafts independently, including exact answer, wording, graph/choice consistency, source accuracy assumptions, reference time, and file mapping. Do not activate them.
8. Confirm no match can select a draft/retired/invalid baseline item.
9. Verify recent-question hashing is stable across generated instances and cannot be defeated by serialization differences.
10. Verify evidence upload count, total size, MIME allowlist, file signature, hash, provider key, retention metadata, and cleanup behavior.
11. Verify native/web inline board compare-and-set behavior for duplicate, stale, out-of-order, retry, rotate, reconnect, background/foreground, and finalize requests.
12. Verify finalization promotes exactly five boards and cannot settle with missing or mismatched slots.

### I. Placement recovery and migration assumptions

1. Existing general matches can count toward the three-match unlock only when they meet the current valid-completion rule.
2. Existing historical tiers/rankings/matches are not overwritten by a silent conversion.
3. Financial records are not deleted by Arena migration or account-plan cleanup.
4. Placement attempt recovery has an auditable `SERVER_ERROR` versus `OPERATOR_RESET` distinction and authorized actor/reason/request ID.
5. Concurrent recovery/reset requests are idempotent and cannot add unlimited attempts.
6. No code automatically grants extra attempts or an unearned tier after exhaustion.
7. The product currently assumes zero existing users, zero outstanding legacy financial obligations, and zero in-flight legacy matches. Verify the code does not convert that assumption into destructive deletion. Report this assumption as a deployment precondition that must be confirmed against the real target database.

### J. Weekly mock and ranking

1. Only a participant with finalized Arena placement is eligible for weekly mock internal-MMR settlement.
2. A participant’s representative weekly result updates only their competitive internal rating, RD, volatility, and related weekly metadata.
3. It does not directly modify public competitive score or displayed tier.
4. Nonparticipants receive no MMR, score, or tier change and no penalty.
5. User+week settlement uniqueness prevents duplicate application.
6. Answer correction/recalculation applies only the delta between prior and revised weekly settlement.
7. Correction does not reset or overwrite public score, old legacy ranking, or unrelated users.
8. All overall, high-school, university, retaker, and worker public ranking queries are sourced from finalized `ArenaCompetitiveProfile.competitiveScore`.
9. No active page/API uses old Arena Standing, weekly public GP, promotion pools, `LiveFinalRankingProfile`, or legacy `RankingProfile` as the canonical public Arena ranking.
10. Sorting, ties, pagination, privacy fields, school grouping, unplaced exclusion, and null score behavior are correct.

### K. Account plans, commerce, refunds, and legacy removals

1. Student plans are only `FREE` and `PRO`; admin resolves to `SUPER_ADMIN` unlimited access.
2. Free is zero-price and non-expiring.
3. Pro defaults to KRW 5,500 for 30 days and is configurable.
4. Expired Pro resolves to Free without corrupting payment history.
5. Existing users are safely interpreted/migrated to Free while admin role remains admin.
6. Web Pro purchase uses KG Inicis and applies access only after provider verification and idempotent approval.
7. Native Pro purchase requires a non-retired configured `APPLE_PRO_PRODUCT_ID`, transaction ownership, app-account token/original transaction checks, expiry, signed server notifications, and idempotent activation.
8. Refund/revocation updates plan state and audit history without deleting financial records.
9. Product/price/currency mismatches are rejected.
10. Retired Apple products cannot grant current Pro access.
11. No active user/admin route, view, service, scheduler, notification, or API exposes payback, payback bank accounts, Arena shop, old paid Arena entry, automatic defense, old learning-day compensation, or retired passes.
12. Deleted legacy code is not still required by an active import, dynamic require, route, job, view include, client script, or package command.
13. The remaining `ArenaPackagePayment` or other retained financial schemas are used only for legitimate current commerce/audit needs; identify misleading legacy names separately from active behavior.

### L. Notifications, email, and outbox

1. Enumerate every reachable Arena-related notification/email producer and its trigger.
2. Confirm no automatic-defense assignment email or “a match has been assigned for defense” message can be sent.
3. Confirm normal anomaly detection/review sends no email.
4. Confirm friendly/challenge flows do not send unintended competitive or defense messages.
5. Confirm competitive integrity messages occur only under the intended existing review flow.
6. Confirm result notifications cannot be duplicated by retries or settlement re-entry.
7. Verify outbox unique keys, delivery state, retry/backoff, multi-process lease behavior, failure observability, and PII minimization.
8. Search templates, subjects, notification type enums, background jobs, deleted-script references, and tests for stale payback/defense/economy messaging.

### M. Operator pages and API

1. Web and iPad operator views use the same current source data and authorization rules.
2. They show the latest 30-day one-sided competitive settlements: count, average/net/absolute rating change, before/after averages, result breakdown, and public score deltas.
3. Drift warning status uses the configured threshold and handles no-data/low-sample periods honestly.
4. They expose normal `REVIEW_REQUIRED` records with questions, signals, status, and authorized approve/reject actions.
5. Approval/rejection is transaction-safe, idempotent, audited, and cannot change user result/XP.
6. They show placement/internal MMR/public score/settlement distinctions clearly.
7. They do not show active payback, Arena shop, automatic defense, old Standing, old final ranking, or retired plan controls.
8. Admin actions require admin authorization on every web/native endpoint, not only hidden navigation.
9. Audit logs contain actor, target, reason, timestamp, and result without secrets.

### N. Web UI, CSS, responsive design, and accessibility

Inspect the rendered structure and, where possible, run a local browser against isolated data. Do not judge only by static screenshots.

1. Navbar labels are exactly Home/Normal/Competitive/Friends/Rules in the Korean UI (`홈`, `일반전`, `경쟁전`, `친구`, `경기 규정`).
2. Normal and competitive pages do not say `past record`, `asynchronous`, or `defense`; they describe matching with a similarly skilled user.
3. Normal and competitive layouts retain the established dark navy/purple/cyan GOAT Arena design and are not an unrelated redesign.
4. Rules index is an overview; normal and competitive have separate pages.
5. Each detailed rules page includes the relevant tier/difficulty table and accessible expand/collapse sections.
6. Public copy removes payback, old economy, defense, internal formulas, `Z-score`, and competitive-release-status announcements.
7. Match start, progress, timer, answer, board, upload, forfeit, error, reconnect, pending review, and result states all have coherent UI.
8. Result cards show the user’s own submitted answer beside each question as well as correctness.
9. Challenge share CTA is styled consistently, works on click, automatically copies, displays the URL, and offers a separate copy button with success/error feedback.
10. Challenge leaderboard participant tabs are keyboard accessible and expose correct ARIA tab semantics.
11. Guest nickname availability feedback is announced accessibly and does not rely only on color.
12. Win/loss/draw, validation, timer, and integrity states do not rely only on color.
13. Focus-visible styles, labels, headings, form errors, live regions, button disabled states, and dialog semantics are correct.
14. All touch targets meet reasonable mobile sizing; no critical action is hover-only.
15. Check breakpoints at 320, 375, 390, 430, 768, 820/834, 1024, 1280, 1440, and desktop widths.
16. Check portrait/landscape, long Korean text, Dynamic Type-like text enlargement, 200% browser zoom, keyboard navigation, and reduced motion.
17. No horizontal overflow, clipped CTA, overlapping nav, invisible contrast, empty oversized cards, or hidden result detail occurs.
18. Grid writing canvas remains usable after resize/rotation and preserves input.
19. Run `npm run ui:verify` and `npm run contrast:verify`, inspect what they cover, and perform independent spot checks. A passing selector-count script is not proof of rendered accessibility.
20. Identify unused CSS, stale payback/defense selectors, duplicate rules, excessive specificity, conflicting media rules, and dead asset references. Report them without editing.

### O. Native app contract and cross-platform parity

1. Inventory the exact request body, headers, response schema, and errors for every `/api/v1/goat-arena` route.
2. Verify Bearer auth is enforced by the actual router mount/middleware, not assumed from comments.
3. Verify state-changing native commands require `Idempotency-Key` and match commands require `X-Matths-Client-Version` where documented.
4. Verify aliases cannot bypass headers, authorization, rate limits, or validation.
5. Confirm native and web use the same attempts, match documents, evidence, scoring, settlement, and result serializers.
6. Verify server time is authoritative; document clock-skew handling and countdown reconstruction.
7. Verify offline/retry behavior for answer save, board upload, advance, finalization, and submit.
8. Verify stale board revision errors can be recovered without losing newer strokes.
9. Verify response fields never require the app to calculate winner, MMR, public points, tier, challenge rank, or release visibility.
10. Verify deep link/Universal Link behavior for `/arena-invite/:token`, including logged-out guests and registered users.
11. Verify app screenshots/screen recording/background transitions do not accidentally disclose hidden creator results or other participants’ working.
12. Produce a concrete app integration checklist listing screens, endpoint calls, loading states, empty states, errors, retry behavior, and analytics/privacy restrictions.

### P. Database, indexes, concurrency, and transactions

1. List all Arena-related indexes from schemas and the staging preparation script.
2. For each hot query, state whether a matching index exists and whether field order/selectivity is appropriate.
3. Verify uniqueness and partial-index semantics for active matchmaking, source attempt records, settlements, weekly settlements, nickname namespace, guest identity/attempt, boards, placement adjustments, and invitations.
4. Verify reservation TTL cleanup and expired reservation recovery do not strand records.
5. Verify match creation, record reservation, evidence settlement, MMR update, public point update, XP update, record publication, and notification enqueue have correct transaction boundaries.
6. Simulate or inspect concurrent double submit, double finalize, duplicate retry, two challengers reserving one record, operator review racing settlement, guest double start, guest double finalize, nickname race, and weekly correction race.
7. Verify a failed transaction leaves no partial MMR/score/XP/record/outbox state.
8. Verify external file operations are compensated or retried when the DB transaction fails, and vice versa.
9. Do not apply indexes outside an explicitly isolated/local test database.
10. Report staging index application and query-plan verification as a blocker unless actually performed against staging with documented evidence.

### Q. Security and privacy

1. Test object-level authorization for match IDs, attempt IDs, request IDs, invitation IDs, record IDs, challenge tokens, participant IDs, side/file indexes, and admin IDs.
2. Test mass assignment, prototype pollution, NoSQL injection, invalid ObjectIds, path traversal, MIME spoofing, SVG/script upload, oversized upload, too many files, decompression bombs, and duplicate multipart fields where relevant.
3. Verify CSRF/same-origin protection for session routes and appropriate token/cookie controls for public guest routes.
4. Verify CSP, HSTS in production, frame denial, MIME-sniffing denial, referrer policy, and sensitive URL behavior.
5. Verify no answer keys, private birth dates, internal MMR where prohibited, payment IDs, storage keys, auth tokens, guest proof, or risk signals leak through JSON, EJS locals, HTML data attributes, logs, errors, analytics, or cache.
6. Verify signed file URLs are short-lived and permission is checked before issuance.
7. Verify public challenge tokens have sufficient entropy and are stored safely.
8. Verify rate-limit keys and proxy/IP trust settings cannot be trivially bypassed.
9. Verify account deletion, guest retention, evidence retention hold, and legal financial retention do not conflict.
10. Identify all privacy-policy/terms/FAQ copy affected by the current behavior and confirm it is accurate.

### R. Documentation, tests, and cleanup

1. Compare all Korean and English logic documents section by section for semantic parity.
2. Compare docs against active code and user-facing copy.
3. Run the safe test commands below and record exact command, exit code, duration, and meaningful warnings:

```bash
npm run account-plans:verify
npm run active-commerce:verify
npm run arena-v2:verify
npm run arena-v21:verify-scoring
npm run arena-v22:verify-rulebook
npm run arena-normal-baseline:verify
npm run arena-cheating-modes:verify
npm run ranking:verify
npm run logic-parity:verify
npm run launch-views:verify
npm run ui:verify
npm run contrast:verify
npm run private-mock:verify
npm run ipad-weekly-mock-evidence:verify
npm run admin:verify
node audit/verifyPrivateMockIntegrityRecovery.js
node audit/verifyPrivateMockSubmissionContract.js
npm run weekly-mock-mmr:verify-db
npm run admin-arena-current:verify-db
npm run arena-async-historical-semantics:verify-db
npm run ipad-arena-async-evidence:verify-db
npm run arena-v21:verify-db
npm run arena-v2:verify-db
npm run arena-v2:simulate
npm run arena-normal-baseline:simulate
```

4. Inspect each test for independence and meaningful negative/concurrency coverage.
5. Search for `.skip`, `.only`, TODO, FIXME, temporary bypass, mock-only behavior, swallowed errors, fallback success, disabled validation, hardcoded admin IDs, default secrets, test environment exceptions, and clock/random nondeterminism.
6. Search for unreachable exports, dead imports, deleted-file references, stale package scripts, unused assets, stale CSS, legacy strings, and active compatibility shims.
7. Do not recommend deleting a compatibility path until you prove no active web/native/client consumer needs it.

## Required external/manual verification matrix

Clearly mark these as `UNVERIFIED` unless you actually have authorized access and complete them:

- staging Mongo index application and `explain()` evidence;
- real staging multi-session transactions and concurrent settlements;
- real Cloudinary/R2 upload, signed read, retention hold, delete, and retry;
- Chrome and Safari desktop end-to-end gameplay;
- iPhone and iPad real-device board input, rotation, background/foreground, reconnect, and finalization;
- VoiceOver, Dynamic Type, Reduce Motion, and touch-target QA;
- KG Inicis test approval/cancel/refund/replay;
- Apple Sandbox purchase/restore/renewal/refund/revocation/server notification;
- full mathematical review of all production baseline questions and answers;
- real-user rating distribution, drift, record-pool sufficiency, and operator backlog behavior;
- guest load, leaderboard pagination, storage growth, expiry, and deletion.

Do not substitute mocked unit tests for these checks.

## Required final report format

Produce one self-contained Markdown report with the following sections in this order:

1. **Executive verdict**
   - Overall release status: `BLOCKED`, `CONDITIONALLY READY FOR STAGING`, or `READY FOR PRODUCTION`.
   - Competitive activation status separately.
   - Five most important findings.
   - Explicit statement of what was not verified.

2. **Scope and evidence**
   - Commit/branch/worktree state.
   - Files and systems inspected.
   - Commands run, exit codes, durations, environment, and warnings.
   - Commands deliberately not run and why.

3. **Architecture and active call-chain map**
   - Web, native, guest, operator, weekly mock, ranking, plan, commerce, storage, notification, and scheduler paths.
   - Identify any duplicate authority.

4. **Requirement traceability matrix**
   - Unique requirement ID corresponding to every numbered item A–R above.
   - Status, evidence, test evidence, platform coverage, and notes.
   - No omitted IDs. State the total count and verify the count programmatically or manually.

5. **Findings by severity**
   - `P0`: data loss, unauthorized disclosure, financial corruption, or systemic production outage.
   - `P1`: incorrect settlement/MMR/score, auth bypass, cross-user evidence leak, broken primary flow, or deploy blocker.
   - `P2`: important inconsistency, race with limited scope, misleading UI, accessibility failure, or incomplete operator control.
   - `P3`: maintainability, dead code, documentation drift, low-risk UI defect.

   For each finding include:
   - concise title;
   - severity;
   - affected user flow/platform;
   - exact preconditions;
   - deterministic reproduction steps;
   - expected behavior;
   - actual behavior;
   - root cause;
   - exact file and line evidence;
   - related test gap;
   - data/security impact;
   - smallest safe remediation direction;
   - regression tests required.

   Do not list speculative issues as confirmed defects. Put hypotheses in a separate section with the evidence needed to confirm them.

6. **User-flow walkthroughs**
   - New user → normal → three valid matches → placement 1–5 → finalize → competitive.
   - Normal clean record and normal flagged record.
   - Competitive clean settlement and integrity review.
   - Friendly invite end to end.
   - Member challenge creation → multiple guest joins → creator release → late joiner.
   - Guest return with same identity.
   - Guest registration claim → reverse challenge.
   - Weekly mock participant, nonparticipant, and answer correction.
   - Free → Pro web and native; expiration/refund.
   - Operator normal-record approval/rejection and drift monitoring.

   For each step list screen/API, request, response/state transition, persistence, retry behavior, authorization, notification, and visible UI.

7. **Mathematical and rating validation**
   - Independent sample calculations.
   - Glicko-2 verification.
   - Public point verification.
   - Fairness/drift simulation analysis.
   - Any assumptions and numerical tolerances.

8. **Database and concurrency review**
   - Model/index table.
   - Transaction/ledger table.
   - Race-condition matrix and results.
   - Staging-only work still required.

9. **API and native integration contract**
   - Endpoint table with auth, headers, body, success schema, error codes, idempotency, and retry guidance.
   - Cross-platform parity differences.
   - A concrete mobile implementation checklist.

10. **UI/CSS/accessibility review**
    - Page-by-page and breakpoint-by-breakpoint results.
    - Keyboard, screen reader semantics, contrast, reduced motion, Dynamic Type/zoom, and touch behavior.
    - Screenshots only when they materially prove a finding.

11. **Security/privacy review**
    - Authorization matrix.
    - Upload/storage matrix.
    - Guest identity/claim analysis.
    - Secret/PII/log/cache analysis.

12. **Notification/email audit**
    - Every active trigger and template.
    - Explicit proof that automatic-defense and normal-review emails are absent.
    - Any stale or ambiguous trigger.

13. **Legacy-removal and dead-code report**
    - Payback, shop/economy, defense, Standing/ranking, retired products, scripts, views, CSS/assets, imports.
    - Distinguish safely retained historical schemas from active legacy behavior.

14. **Test quality and coverage gaps**
    - What each suite proves.
    - Circular tests, untested negative paths, flaky dependencies, and missing real-environment validation.

15. **Production blockers and risk register**
    - Owner/action/evidence-to-close for every blocker.
    - Separate code blockers, data blockers, infrastructure blockers, operational decisions, and manual QA.
    - Explicitly include baseline-answer validation, participant/storage limits, pagination, guest retention, and Apple setup when applicable.

16. **Final go/no-go checklist**
    - A checkable list with no vague “verify later” entries.
    - Keep production deployment and competitive activation as separate gates.

17. **Appendices**
    - Full route inventory.
    - Full model/index inventory.
    - Full environment variable inventory.
    - Full changed-file inventory reconciliation.
    - Commands and raw result summaries.

## Reporting discipline

- Lead with evidence, not reassurance.
- Never hide a failed command, warning, skipped check, or unverified external dependency.
- Do not downgrade a security/data-integrity issue because a feature flag is currently off; report exploitability with the flag off and on.
- Do not call a feature removed merely because its UI link is gone. Prove active routes, services, schedulers, imports, templates, and notifications are unreachable or absent.
- Do not call a flow correct because one happy-path test passes. Check negative paths, authorization, concurrency, retry, cancellation, expiry, and recovery.
- Treat comments and Markdown as untrusted claims until runtime code confirms them.
- Keep internal implementation terminology out of proposed user-facing copy.
- If you discover contradictory product decisions, do not guess. Quote both sources, show the active implementation, and mark the decision needed.
- If exact verification is impossible, say `UNVERIFIED` and provide the precise command, fixture, account, device, provider credential, or staging condition needed to close it.
- Finish with a numerical coverage summary: requirements passed/partial/failed/not implemented/unverified/not applicable, routes inspected/total, models inspected/total, tests passed/failed/skipped, and manual/external checks outstanding.

Do not modify the repository. Return the audit report only.
