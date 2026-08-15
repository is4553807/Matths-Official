# Matths Full Website Audit — Final Report

Audit date: 2026-08-15 (Asia/Seoul)  
Overall status: **READY**

All locally reproducible P0/P1 issues found during the audit were fixed and retested. The six previously blocked provider/user/environment checks were subsequently completed and confirmed by the user; they are recorded below as user-confirmed evidence rather than agent-observed evidence. The new entitlement-aware pricing CTA change also passes real-browser, isolated-DB, direct-guard, expiry, parent, and launch-regression checks.

## A. Coverage

- Repository/deployment surface: 762 tracked files.
- Route registrations: 333 (128 GET, 182 POST, 17 USE, 5 PATCH, 1 DELETE).
- Literal navigation coverage: 316 route patterns covering 1,008 href/form/action/asset references; 0 missing.
- Views: 118 EJS templates, 83 static render calls, 78 distinct rendered views.
- Major feature families: 18 discovered and exercised (public/auth, learning, assessment, quick practice, wrong notes, coach, notifications, archive, store, community, Arena, private mock, parent, admin, payment/refund, email, storage, schedulers); the 6 former provider/user/environment blockers are user-confirmed `PASS`.
- Math: 14 MathJax-backed views and 14 formula categories.
- Viewports: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844.
- High-risk responsive matrix: 5 pages × 6 sizes = 30 combinations, plus student/parent inquiry mobile checks.
- Launch regression: 40/40 checks passed.
- Security dependency scan: `npm audit --offline --omit=dev` reports 0 known vulnerabilities.

Stateful core journeys were run in the real localhost app against `matths_audit_zero_assumption_20260815`. Provider-only and state-only screens used exact local EJS previews. This distinction matters: a preview proves rendering, not database/provider behavior.

Tested states include logged out, fresh registration, logged in, normal learner, zero-progress learner, Unranked Arena, warning/report state, parent, admin, retaker, university, worker, and deterministic expired/restricted boundary cases. Atlas recovered: the latest application restarted, login/contact persistence passed in the browser, the private-mock restriction verifier passed, and final inquiry/quota/index mutations were observed in the isolated database.

## B. Findings and fixes

### P0 — Critical

No P0 was reproduced. Temporary Cloudinary/R2 lifecycle checks passed, but real-money movement was not tested, so this is not evidence that production has no P0 risk.

### P1-01 — Raw/broken mathematical formulas across learning surfaces

- Route/state: `/quick-practice`, `/my-learning`, `/wrong-notes`, assessment/unit learning, store study, Arena analysis; logged-in learner.
- Reproduction: open the page or submit/expire a dynamic problem containing TeX such as `\lim`, `\frac`, or `f'(0)`.
- Expected: visual mathematical notation, including correctly positioned operator bounds.
- Actual: literal `\(...\)` text appeared; a pending asynchronous queue could also prevent later formulas from rendering.
- Root cause: page-specific renderer timing, a remote runtime dependency, and incomplete coverage of dynamically inserted content.
- Relevant files: `public/js/math-renderer.js`, `public/js/quick-practice.js`, `views/quick-practice.ejs`, `views/my-learning.ejs`, `views/wrong-notes.ejs`, `views/goat-arena-main-shop-analysis.ejs`, `server.js`.
- Fix: self-host MathJax, centralize sync-first/delayed-start-safe rendering, and call the shared renderer for dynamic updates.
- Retest: 14 formula categories rendered on desktop and 390px with 0 raw TeX and 0 MathJax error nodes. Quick practice was allowed to expire for 41.5 seconds; the timeout result rendered and next-problem reset passed with no console error.

### P1-02 — Approved coach suggestions were not reliably used for learner feedback

- Route/state: `/coach-suggestions` → `/admin/coach-suggestions` → `/quick-practice`; learner and admin.
- Reproduction: learner proposes text, admin approves it, then learner triggers the matching quick-practice situation.
- Expected: approved community text joins the runtime coach pool and can be displayed.
- Actual: moderation UI existed, but the runtime learner feedback path was not reliably refreshed.
- Root cause: the approval store and in-memory coach pool had no complete refresh lifecycle.
- Relevant files: `services/coachSuggestionService.js:194`, `services/coachMessageService.js:188`, `server.js:221`, `controllers/matthsController.js`, `controllers/apiController.js`.
- Fix: load approved messages at startup and refresh the shared pool after moderation.
- Retest: a learner suggestion was submitted, approved by admin, and then surfaced in quick practice.

### P1-03 — Authentication rate limits could be bypassed across instances/identifiers

- Route/state: student/parent/API login, registration, and password reset; logged out.
- Reproduction: distribute requests across server instances or rotate email/username while retaining one source IP.
- Expected: one shared atomic limit across instances plus IP-wide credential-spray protection.
- Actual: process-local maps reset per instance and identifier-only limits allowed spray patterns.
- Root cause: rate state was stored only in application memory.
- Relevant files: `services/authRequestLimitService.js`, `middleware/requestSecurity.js`, `models/matthsModel.js`, `routes/matths-routes.js`, `routes/api-routes.js`, `routes/parent-routes.js`, `server.js:172`.
- Fix: Mongo-backed hashed atomic buckets, TTL indexes, identifier and IP-wide limiters, and explicit startup index creation.
- Retest: 8 simultaneous attempts under a limit of 2 produce exactly 2 passes/6 blocks; reset time, 429 headers, hashing, and route wiring pass.

### P1-04 — Concurrent inquiry/refund submissions could duplicate persistent work

- Route/state: `/contact`, `/parent/inquiries`; authenticated student or parent.
- Reproduction: submit the same valid form concurrently or from repeated clicks/tabs inside the 60-second cooldown window.
- Expected: one inquiry, one refund-work item where applicable, one admin todo, and at most one email attempt.
- Actual: both requests could pass `exists()` before either write committed.
- Root cause: a non-atomic check-then-create cooldown.
- Relevant files: `services/supportInquiryService.js:271`, `models/matthsModel.js`, `views/contact.ejs`, `views/parent-inquiries.ejs`, `controllers/matthsController.js`, `controllers/parentController.js`, `server.js:227`.
- Fix: per-actor transactional submission guards, unique request IDs, hidden form keys, idempotent todo repair, TTL/index setup, and account-deletion cleanup.
- Retest: two simultaneous identical submissions create 1 record and 1 email attempt; a different concurrent request returns 429; an expired guard permits the next request. Student/parent desktop and 390px forms show valid request keys and no overflow.

### P1-05 — Bare-domain Google OAuth could lose its session state

- Route/state: `https://matths.kr/auth/google`; logged out.
- Reproduction: enter through the bare domain and choose Google login.
- Expected: the login start and configured callback use one canonical host so the OAuth state remains in the same session.
- Actual: both `matths.kr` and `www.matths.kr` returned 200, while the callback was fixed to `www`; host-only session cookies could therefore split the OAuth start and callback sessions.
- Root cause: the application and deployment config had no bare-to-www canonical redirect.
- Relevant files: `middleware/canonicalHost.js`, `server.js`, `.cloudtype/app.yaml`, `scripts/verifyCanonicalHostRedirect.js`.
- Fix: add a production-only 308 redirect from `matths.kr` to `www.matths.kr` before static/session middleware, preserving path/query while leaving the platform health host untouched.
- Retest: a real production-mode server returns 308 for the bare-host OAuth URL and 200 for both www and Cloudtype health hosts; `launch:verify` passes 40/40. Operating-domain deployment and the real Google callback were subsequently confirmed by the user.

### P2-01 — Coach suggestion daily quota race

- Route/state: `/coach-suggestions` or API; learner.
- Reproduction: send more than 10 distinct suggestions concurrently.
- Expected: maximum 10 per KST calendar day.
- Actual: all requests could observe the same pre-insert count.
- Root cause: `countDocuments()` followed by independent creates.
- Relevant files: `services/coachSuggestionService.js:87`, `models/matthsModel.js`, `services/accountDeletionService.js`.
- Fix: atomic KST-day quota records with a unique user/day index, TTL cleanup, and reservation rollback on failure/duplicate.
- Retest: 12 simultaneous requests produce exactly 10 successes and 2 status-429 failures; stored quota remains 10.

### P2-02 — Wrong-note summary was unreadable

- Route/state: `/wrong-notes`; learner with wrong answers.
- Reproduction: open the hero summary at desktop/1024px.
- Expected: visible count and labels with accessible contrast.
- Actual: white/light text appeared on a white summary card.
- Root cause: inherited hero color conflicted with the summary-card background.
- Relevant files: `public/css/wrong-notes.css`, `views/wrong-notes.ejs`.
- Fix: explicit dark summary text/label colors and responsive card styles.
- Retest: desktop, 1024px, 768px, and 390px screenshots are readable with no clipping.

### P2-03 — Formula/content clipping beside the sidebar

- Route/state: `/my-learning`, store study content, Arena analysis; learner.
- Reproduction: open long formulas/content at desktop and narrow widths.
- Expected: cards shrink/wrap within the main content area.
- Actual: content extended beyond the available width or clipped.
- Root cause: missing `min-width: 0`, rigid sizing, and no safe overflow rule around wide math/content.
- Relevant files: `public/css/my-learning.css`, `public/css/store.css`, affected EJS views.
- Fix: responsive grid/min-width/overflow corrections plus shared math rendering.
- Retest: no document-level horizontal overflow at all six target sizes.

### P2-04 — Parent dashboard showed 100% for zero attempts

- Route/state: `/parent`; parent viewing a child with zero solved questions.
- Reproduction: open the dashboard for an unused child account.
- Expected: 0% or an empty-state label.
- Actual: 100%.
- Root cause: the empty denominator fell through to a default success value.
- Relevant files: `views/parent-dashboard.ejs`, parent dashboard service/controller data.
- Fix: zero attempts now resolve to 0%.
- Retest: the zero-progress parent dashboard shows 0%.

### P2-05 — Arena mailbox/header state became stale

- Route/state: `/goat-arena/mailbox` and detail; Arena user.
- Reproduction: open an unread item or mark all read, then inspect the header/navigation badge.
- Expected: unread count and accessible label update immediately.
- Actual: the page and header could disagree; active navigation state lacked correct ARIA semantics.
- Root cause: stale notification state and presentation-only active state.
- Relevant files: `views/partials/goat-arena-navigation.ejs:91`, Arena notification/controller code.
- Fix: synchronize unread state and add correct navigation accessibility state.
- Retest: mailbox read flow and navigation badge/ARIA were browser-retested.

### P2-06 — Invalid community report produced a generic 400 flow

- Route/state: `/community/:postId`; authenticated community user.
- Reproduction: submit an invalid report reason/payload.
- Expected: controlled user-facing validation while preserving the post/user state.
- Actual: generic 400 handling.
- Root cause: controller error mapping did not preserve the community view flow.
- Relevant files: `controllers/matthsController.js`, `services/communityService.js`, `views/community-post.ejs`.
- Fix: controlled validation/error rendering.
- Retest: invalid report shows the intended message; original post/public state and warning counts remain unchanged.

### P2-07 — Malformed dynamic IDs could reach Mongoose casting

- Route/state: coach moderation, admin todos, Arena revenge actions.
- Reproduction: visit or submit a route with a non-ObjectId dynamic parameter.
- Expected: controlled 404 without a database query.
- Actual: casting/server errors were possible.
- Root cause: missing pre-query identifier validation.
- Relevant files: `services/coachSuggestionService.js:452`, `services/adminTodoService.js:409`, `controllers/goatArenaController.js:2162`.
- Fix: `mongoose.isValidObjectId` checks before queries.
- Retest: malformed coach/todo/revenge IDs return controlled 404 and execute zero database queries.

### P2-08 — Parent authorization was not revoked during an active session

- Route/state: protected `/parent/*`; previously authenticated parent later deactivated/deleted.
- Reproduction: deactivate the parent record, then reuse the existing session.
- Expected: session cleared and login required.
- Actual: session presence alone could continue to authorize requests.
- Root cause: protected middleware did not revalidate the active database record.
- Relevant files: `middleware/parentAuthMiddleware.js:18`.
- Fix: revalidate active parent ownership on protected requests and clear invalid sessions.
- Retest: active passes; inactive/deleted/malformed sessions are cleared and redirected to login.

### P2-09 — Learning progress UI stayed stale after persistence

- Route/state: concept/unit learning; learner.
- Reproduction: complete a topic or practice item and remain on the page.
- Expected: progress bar/status updates immediately and persists after refresh.
- Actual: database changed but visible progress stayed stale until refresh.
- Root cause: mutation responses/events omitted the updated progress projection.
- Relevant files: `services/learningProgressService.js:172`, controller/API handlers, concept/unit client scripts.
- Fix: return the updated progress payload and dispatch/update the browser state.
- Retest: immediate UI update and refreshed persistence both pass.

### P2-10 — Nickname GET path returned 500 for missing body data

- Route/state: `/nickname-change`; authenticated user without a valid request.
- Reproduction: direct GET with an invalid/missing request ID.
- Expected: controlled not-found/invalid-request state.
- Actual: `req.body` dereference on a GET could throw.
- Root cause: required-body assumptions in a read route.
- Relevant files: `controllers/matthsController.js:5844`, nickname service/view.
- Fix: optional access and explicit invalid-request handling.
- Retest: malformed/missing request reaches the controlled response, not 500.

### P2-11 — Quick-practice prompt/result layout fragmented content

- Route/state: `/quick-practice`; learner.
- Reproduction: start a problem containing sentence text and a formula, then submit/expire it.
- Expected: one cohesive prompt and readable result card.
- Actual: fragments occupied separate grid rows and raw math could appear in result text.
- Root cause: multiple independently laid-out prompt nodes and incomplete dynamic render calls.
- Relevant files: `views/quick-practice.ejs:157`, `public/js/quick-practice.js:46`, `public/css/quick-practice.css`.
- Fix: one prompt wrapper plus shared dynamic math updates.
- Retest: start, wrong submit, 40-second expiry, next problem, and 390px layout all pass.

### P2-12 — Active packages still exposed duplicate purchase buttons

- Route/state: `/pricing`, `/parent/pricing`; learner or parent viewing an active mock-only or learning package.
- Reproduction: complete a package payment, return to pricing, choose the same product, and proceed to checkout.
- Expected: the active product shows a product-specific continue/status action; purchase actions return only after expiry.
- Actual: pricing still showed self/parent purchase actions and only rejected the duplicate after the user entered checkout. A learning package also includes the weekly mock, but the mock-only direct guard did not account for that entitlement.
- Root cause: pricing rendered only catalog/policy data and did not receive the user’s current entitlement or purchase-eligibility state.
- Relevant files: `services/checkoutService.js`, `services/mockExamPaymentService.js`, `services/paidFeatureAccessService.js`, `controllers/matthsController.js`, `controllers/parentController.js`, `views/pricing.ejs`, `views/parent-pricing.ejs`, pricing CSS.
- Fix: central entitlement-aware product state; active mock CTA becomes `주간 모의고사 계속하기`, active learning CTA becomes `GOAT Arena 계속하기`, learning-package access suppresses both paid CTAs, parent purchase links are replaced by child-status links, and direct mock purchase is rejected when learning access already includes it.
- Retest: five student states plus parent rendering pass; isolated Atlas verifies free/mock/learning/direct-guard/post-expiry states; real browser verifies zero duplicate links, working continue destinations, no broken images, and zero horizontal overflow for mock-only, learning, and parent states.

### P3-01 — MathJax console warning

- Route/state: any math page.
- Reproduction: load a MathJax view and inspect the console.
- Expected: no deprecated/unsupported option warning.
- Actual: `enableAssistiveMml` warning.
- Root cause: a removed MathJax 4 option remained in page configuration.
- Relevant files: 14 math EJS views; guarded by `scripts/verifyMathRenderingRuntime.js:103`.
- Fix: remove the unsupported option everywhere.
- Retest: fresh direct analysis/math pages have clean consoles.

### P3-02 — Incorrect Korean particles and learning-copy grammar

- Route/state: generated common-math questions and store copy.
- Reproduction: generate multiple variants containing final-consonant nouns or open the affected store text.
- Expected: grammatical Korean.
- Actual: text such as `정리을`, `정리으로`, `다룬다.의 범위`, and `N제으로`.
- Root cause: fixed particles and unstable sentence concatenation.
- Relevant files: `services/problemGenerators/commonMath/generators.js`, store views, content verifier.
- Fix: Hangul final-consonant-aware particles and stable sentence templates.
- Retest: generated problem/content regressions pass.

### P3-03 — Stale verifier asserted removed behavior

- Route/state: verification tooling.
- Reproduction: run the old platform-expansion verifier.
- Expected: assert current nickname-only ranking and current routes.
- Actual: asserted deleted real-name behavior and nonexistent identity routes.
- Root cause: tests were not updated with the product policy.
- Relevant files: `scripts/validatePlatformExpansion.js`, `scripts/verifyLaunchReadiness.js`.
- Fix: update current route/identity assertions and include the verifier in launch regression.
- Retest: platform expansion and 38-check launch verification pass.

## C. Regression evidence

- `npm run launch:verify`: 40/40 pass.
- `npm run pricing-entitlements:verify-db`: isolated Atlas confirms free, mock-only, learning-package, direct duplicate guards, and post-expiry CTA behavior.
- `npm run ui:verify`: 118 templates compile and required audited styles exist.
- `npm run navigation:verify`: 316 routes cover 1,008 literal references.
- `node audit/verifyIndependentBusinessBoundaries.js`: MMR, tiers, ties, scoring, refunds, KST/time, stake/revenge/GP boundaries pass.
- `npm run scheduler-coverage:verify`: 12 shared leases pass.
- `npm run scheduler-multiprocess:verify-db`: two independent processes shared the live isolated Atlas lease; exactly one executed, one skipped, and a later process recovered.
- `npm run support-inquiry:verify-db`: inquiry, request key, failed-email state, admin todo, unique index, and TTL cleanup persisted in isolated Atlas.
- Live Cloudinary private upload/signed-download/delete and R2 upload/hash/delete both pass.
- Live SMTP authentication passes and the provider accepted real support-notification, password-reset, and payback-completion audit messages; recipient inbox delivery was subsequently confirmed by the user.
- Production DNS, bare/www TLS certificates, HTTP-to-HTTPS behavior, HTTPS 200, and security headers pass. Canonical-host deployment and the real Google identity callback were subsequently confirmed by the user.
- Arena match attempt, settlement, study hall, integrity, daily access, analysis, reminders, private mock, and storage-policy verifiers pass.
- All JavaScript in controllers/services/middleware/routes/audit/scripts passes `node --check`.
- `git diff --check` passes.

## D. Previously blocked tests — now PASS

1. **PASS — user-confirmed:** inbox receipt of the three live SMTP audit messages.
2. **PASS — user-confirmed:** end-to-end Toss TEST payment, cancellation, webhook, and receipt. A real-money LIVE transaction was not required or performed.
3. **PASS — user-confirmed:** Google OAuth callback with a real Google identity and the deployed canonical-host flow.
4. **PASS — user-confirmed external execution:** T1–T9 270-source catalog verification. The external source artifact itself is not stored in this repository.
5. **PASS — user-confirmed:** physical Safari/iOS and Android browser checks.
6. **PASS — user-confirmed environment execution:** controlled deployed-topology load and failover checks.

## E. Remaining risks

- Provider contracts can still fail because of credentials, account configuration, webhook allowlists, CORS, quotas, or provider-side API changes.
- Exact Chromium viewports do not expose WebKit-only or physical-device input/font behavior.
- The two-process Atlas lease test proves shared exclusion and recovery, but not production platform clock skew or multi-region failover.

The complete status matrix is in `audit/FULL_WEBSITE_AUDIT_CHECKLIST.md`.
