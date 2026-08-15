# Matths Full Website Audit Checklist

Audit date: 2026-08-15 (Asia/Seoul)

Status legend: `NOT TESTED`, `TESTING`, `PASS`, `FAIL`, `BLOCKED`

## Audit invariants

- Browser behavior is never marked `PASS` from code inspection alone.
- Stateful tests use the isolated `matths_audit_zero_assumption_20260815` database. Production data is not mutated.
- Production database writes and real-money transactions are not performed. Live email checks use three explicit audit-template messages; storage checks use temporary objects that are deleted after verification.
- Externally executed checks are marked with their evidence source; user confirmation is not presented as agent-observed output.

## Final phase checklist

| Phase | Status | Evidence / blocker |
| --- | --- | --- |
| Repository structure and architecture inventory | PASS | 762 tracked files inspected by deployment-surface verification; frontend views/assets, Express routes/controllers, services, Mongoose models, middleware, schedulers, payments, mail, storage, and configuration inventoried. |
| HTTP/page/API route inventory | PASS | 333 registrations: 128 GET, 182 POST, 17 USE, 5 PATCH, 1 DELETE. 316 literal route patterns cover 1,008 literal links/forms/assets with zero missing targets. |
| View/component/asset inventory | PASS | 118 EJS templates, 83 static render calls, and 78 distinct rendered views inventoried; all templates compile and brand/assets/style contracts pass. |
| Environment and external dependency safety audit | PASS | Stateful app tests use the isolated database; provider credentials were not printed or copied; Cloudinary/R2 objects were temporary and deleted; no real-money transaction was made. |
| Actual localhost application execution | PASS | The latest application restarted against isolated Atlas, health returned 200, logout/login worked, `/contact` rendered with no console errors or overflow, and the submitted inquiry persisted across browser and direct DB verification. |
| Logged-out browser flows | PASS | Public entry, service introduction, pricing, visual learning, learning flow, curriculum, FAQ, contact, legal, community, login, registration, and reset states were visited and interacted with. |
| Registration/login/logout/session flows | PASS | Fresh registration, validation, repeated submit, logout, relogin, refresh persistence, invalid reset code/token, protected redirects, and the real Google provider entry passed. The bare-domain OAuth host split was fixed and production-mode retested; deployed callback completion is user-confirmed. |
| Normal learner flows | PASS | Dashboard, concept learning, practice, progress persistence, assessments, autosave/reload, failure/retry/pass, wrong-note review, notifications, archive, store, profile, and community flows exercised. |
| Unranked learner flows | PASS | Initial placement, Unranked Arena entry/match/stake/attempt/settlement evidence, rankings, mailbox, and navigation exercised. |
| Ranked/tier learner flows | PASS | Ranked views, policies, packs, tier calculations, match generation, settlement, and shop/analysis were verified by browser and independent stateful/logic tests; the latest app/Atlas connection rerun passed. |
| Active/expired/restricted/warned states | PASS | Active, new, zero-progress, warning/report, access-expiry, checkout-expiry, authorization revocation, live private-mock restriction DB replay, and entitlement-aware purchase/expiry behavior passed. End-to-end provider checkout is user-confirmed. |
| Parent flows | PASS | Login, child selection, dashboard, notification settings, payment/refund views, inquiry submission, ownership checks, inactive-session revocation, and entitlement-aware child pricing tested. SMTP inbox receipt and end-to-end provider payment are user-confirmed. |
| Admin flows | PASS | Admin dashboard plus 20 operational pages and dynamic user/activity/assessment/parent views visited; todo, coach moderation, community report, store/archive, finance, policy, and user controls traced and sampled. Destructive production actions not executed. |
| Mathematical rendering matrix | PASS | All 14 MathJax-backed views use the shared local renderer. Fractions, powers/subscripts, roots, nested fractions, limits, integrals, sums, products, matrices, piecewise functions, absolute values, inequalities, long display math, and inline math rendered with 0 raw-TeX and 0 MathJax error nodes in desktop/mobile galleries. |
| 40-second quick-practice expiry | PASS | Real 41.5-second wait reached the expiry result; the limit/fraction formula remained rendered, the answer was shown, and next-problem reset succeeded with a clean console. |
| Console and network audit | PASS | Visited real-app and exact-preview pages were checked for errors/warnings, failed resources, raw TeX, and overflow; the latest DB-backed `/contact` replay had a clean console, request ID, and no horizontal overflow. |
| Responsive viewport matrix | PASS | Critical formula pages were checked at all six required sizes (30 page/viewport combinations); contact and parent inquiry were additionally checked at 390×844. No document-level horizontal overflow or raw TeX. |
| Authorization/direct-object access audit | PASS | Notification, Arena, assessment, wrong-note, study-hall, refund, community, and parent ownership paths traced; malformed IDs return controlled errors; inactive parent sessions are revoked. No sampled IDOR found. |
| Business-rule boundary audit | PASS | Independent expected-vs-actual checks cover MMR/tier boundaries, ranking ties, scoring, refund day 7, KST 20:00, midnight, daily consumption, Sunday locks, stakes, revenge accounting, and legacy GP conversion. |
| Date/time/KST boundary audit | PASS | KST date ranges, midnight reset, 72/24/6-hour reminders, access expiry, Sunday 14/15 boundaries, and monthly aggregation verified deterministically. |
| Database persistence and ownership audit | PASS | Isolated Atlas runs confirmed assessment autosave/submission, progress, wrong notes, Arena stake/settlement, community, contact cooldown, relogin persistence, final inquiry/todo/index persistence, coach quota atomicity, and private-mock restriction state. |
| Bug fixes and browser retests | PASS | Visual/math/front-end fixes were browser-retested; latest inquiry/quota changes passed concurrent service, actual browser form submission, and direct isolated-Atlas persistence verification. |
| Automated regression | PASS | `launch:verify` passes 40/40 checks, including canonical host and pricing-entitlement behavior; all controller/service/middleware/route/audit/script JS files pass syntax checks; offline production dependency audit reports 0 vulnerabilities. |
| Final coverage and risk report | PASS | This checklist and the final handoff enumerate all known failures, fixes, blockers, and residual production risks. |

## Required viewport matrix

| Viewport | Status | Evidence |
| --- | --- | --- |
| 1920×1080 | PASS | Analysis, formula gallery, wrong notes, my learning, quick practice. |
| 1440×900 | PASS | Same five critical pages. |
| 1366×768 | PASS | Same five critical pages. |
| iPad landscape 1024×768 | PASS | Same five critical pages; wrong-note contrast/card visually inspected. |
| iPad portrait 768×1024 | PASS | Same five critical pages; mobile navigation and math cards inspected. |
| iPhone 390×844 | PASS | Same five pages plus dynamic quick-practice prompt/result and student/parent inquiry pages. |

Across the five-page/six-size matrix, every case had `scrollWidth === clientWidth`, no raw TeX, and no MathJax error nodes. This does not assert that every one of the 333 route registrations was exercised at every viewport.

## Coverage counts

| Item | Discovered | Verified | Notes |
| --- | ---: | ---: | --- |
| Route registrations | 333 | 333 inventoried | 316 literal path patterns cover 1,008 literal view references. Destructive and provider-bound POST routes were not all executed. |
| EJS templates | 118 | 118 compiled/style-audited | Includes partials and dynamic render helpers. |
| Distinct statically rendered views | 78 | 78 render-path audited | Stateful core routes were tested in the real isolated app; provider-only/state-only views used safe exact previews where necessary. |
| Major feature families | 18 | 18 | All locally exercised; six former external/provider/device blockers are user-confirmed `PASS`. |
| MathJax-backed views | 14 | 14 | Shared self-hosted runtime and delayed-start behavior verified. |
| Formula categories | 14 | 14 | Desktop and 390px gallery, plus formulas in actual question/result/card pages. |
| Required viewport sizes | 6 | 6 | 30 core page/viewport combinations plus inquiry checks. |
| Launch verification checks | 40 | 40 | All passed after entitlement-aware pricing changes. |
| Shared scheduler leases | 12 | 12 | Coverage verifier passed; two independent processes then shared one isolated-Atlas lease with one execution, one skip, and later recovery. Production cron remains disabled during audit. |

## Fixed findings

| Severity | Route / area | Actual failure | Fix and retest evidence |
| --- | --- | --- | --- |
| P1 | `/quick-practice`, `/my-learning`, `/wrong-notes`, assessment/unit/store/Arena math views | TeX appeared as raw `\(...\)` text; later dynamic formulas could remain pending. | Replaced page-specific behavior with self-hosted MathJax and `math-renderer.js`; all 14 math views and the full formula gallery passed browser rendering. |
| P1 | Coach-message suggestion and quick practice | Admin approval existed, but approved user text did not reliably enter the message pool shown to learners. | Community-approved messages are refreshed into the runtime pool; a user suggestion was approved and then surfaced in quick practice. |
| P1 | Authentication endpoints | Rate limiting was process-local, allowing limits to be bypassed across multiple server instances or by rotating identifiers. | Added shared Mongo atomic buckets, per-IP spray limits, TTL cleanup, and startup index creation; concurrent cap/reset/429 tests pass. |
| P1 | Student/parent support inquiry and refund request path | Concurrent submissions could pass the cooldown check together and create duplicate inquiries/refund work. | Added per-actor transactional submission guards and request-id uniqueness; two simultaneous retries now create one record and one email attempt, while a different request returns 429. |
| P1 | Bare-domain Google OAuth | `matths.kr` and `www.matths.kr` both served 200 while the callback used www, allowing the OAuth state session to split across host-only cookies. | Added a production-only bare-to-www 308 before session middleware and explicit Cloudtype canonical hosts; production-mode HTTP checks preserve path/query and keep www/platform health requests at 200. Deployment and real callback are user-confirmed. |
| P2 | Coach suggestion daily quota | Concurrent requests could exceed the 10-per-day cap. | Added atomic KST-day quota documents with rollback on failed/duplicate creation; 12 simultaneous requests produce exactly 10 successes and 2 HTTP-429-equivalent failures. |
| P2 | `/wrong-notes` | Hero summary text was nearly invisible because white text was rendered on a white summary card. | Corrected summary-card colors; desktop, 1024px, 768px, and 390px views visually checked. |
| P2 | `/my-learning`, store study, Arena analysis | Math and wide content clipped or overflowed beside the sidebar. | Added shared rendering hooks and responsive/min-width fixes; no horizontal overflow at the six target sizes. |
| P2 | `/pricing`, `/parent/pricing` | Active packages still showed duplicate purchase links; rejection happened only after entering checkout. | Pricing now consumes entitlement/purchase-eligibility state, shows product-specific continue/status actions, restores purchase actions after expiry, and rejects direct cross-package duplicates; real-browser and isolated-DB retests pass. |
| P2 | Parent dashboard | Zero solved questions displayed as 100% accuracy. | Zero-attempt state now displays 0%; browser retest passed. |
| P2 | Arena mailbox/navigation | Header unread count stayed stale after reading; navigation state was not exposed correctly to assistive technology. | Count synchronization and navigation ARIA state corrected and browser-retested. |
| P2 | Community report | Invalid report submission fell through to a generic 400 instead of the intended controlled message/state. | Error mapping corrected; browser retest preserved the original post and user warning state. |
| P2 | Dynamic object IDs | Malformed coach moderation, admin todo, and revenge IDs could reach Mongoose casting and produce server errors. | Added pre-query ObjectId validation and controlled 404 responses; no database query occurs for malformed IDs. |
| P2 | Parent authorization | An already-authenticated parent session was not revalidated on every protected request after deactivation/deletion. | Middleware now clears inactive/deleted/invalid sessions; active/inactive/deleted/invalid cases pass. |
| P2 | Concept learning progress | Mutation persisted but the visible completion state stayed stale until refresh. | API response and browser events now update the page immediately; persistence and UI were retested. |
| P2 | `/nickname-change` | GET path dereferenced an absent request body and returned 500. | Optional access and controlled invalid-request handling added. |
| P2 | Quick-practice layout | Sentence and formula fragments were split into separate grid rows; result math was also raw in some states. | Unified prompt wrapper and shared renderer; question, wrong result, timeout result, next problem, and mobile layout passed. |
| P3 | MathJax configuration | Unsupported `enableAssistiveMml` option emitted console warnings. | Removed unsupported option from all 14 views; clean-console retest passed. |
| P3 | Generated Korean/math copy | Invalid particles and phrases such as `정리을`, `정리으로`, `다룬다.의 범위`, and `N제으로` appeared. | Added Hangul-final-consonant particle selection and corrected stable copy; generated-content regressions pass. |
| P3 | Platform expansion verifier | The verifier asserted deleted ranking identity behavior and nonexistent routes, hiding real regressions behind stale tests. | Updated assertions to nickname-only public ranking/current routes; the verifier is now part of `launch:verify`. |

## Previously blocked / externally executed items

1. **PASS — user-confirmed:** live support/reset/payback email receipt.
2. **PASS — user-confirmed:** end-to-end Toss TEST payment, cancellation, receipt, and webhook. No real-money LIVE transaction was required.
3. **PASS — user-confirmed:** Google OAuth callback with a real identity and deployed canonical-host behavior.
4. **PASS — user-confirmed external execution:** T1–T9 270-source catalog verification; the source artifact is not archived in this repository.
5. **PASS — user-confirmed:** physical Safari/iOS and Android devices.
6. **PASS — user-confirmed environment execution:** controlled deployed-topology load and failover behavior.

## Remaining status

Overall status: `READY`. No unresolved locally reproducible P0/P1 defect remains; all six former provider/user/environment blockers are recorded as user-confirmed `PASS`, and the final entitlement-aware pricing change passes browser, isolated-DB, expiry, direct-guard, parent, and 40-check launch regression tests.
