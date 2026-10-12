# Matths Official

Matths is a Korean high-school mathematics platform for learning, assessment, weekly mock exams, GOAT Arena, community, educational resources, and parent, academy, and operator workflows. This repository contains the Express web application and the JSON backend used by the native iOS/iPad client.

This README describes the current working tree as of 2026-10-12 KST.

## Runtime

- Node.js 24 or newer
- Express and EJS
- MongoDB through Mongoose
- Mongo-backed sessions and scheduler leases
- Cloudinary and Cloudflare R2 file storage
- KG Inicis web commerce
- Apple native commerce and server notifications
- SMTP email delivery

The user interface is Korean. English engineering documentation is available in `docs/logic_en`.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create `config.env` from `.env.example` and provide a local MongoDB database and required secrets.

3. Start the server.

   ```bash
   npm start
   ```

4. Open `http://127.0.0.1:8000` unless `PORT` or `HOST` overrides it.

The application validates production-only requirements at startup. Local startup does not make external login, payments, email, or cloud storage usable without their provider configuration.

## Repository layout

| Path | Purpose |
| --- | --- |
| `server.js` | Express setup, middleware, route mounting, database startup, schedulers |
| `routes/` | Web, native API, parent, academy, and GOAT Arena HTTP boundaries |
| `controllers/` | Request validation and response rendering/serialization |
| `services/` | Product rules, transactions, authorization, external integrations |
| `models/` | Mongoose schemas and indexes |
| `middleware/` | Authentication, security, uploads, storage boundaries |
| `views/` | EJS web views and shared partials |
| `public/` | Browser JavaScript, CSS, fonts, images, and trust documents |
| `scripts/` | Verification, simulation, index preparation, and controlled operations |
| `audit/` | Database and HTTP contract suites |
| `docs/logic/` | Current Korean system documentation |
| `docs/logic_en/` | Matching English system documentation |

## Accounts and plans

Student accounts use one of two plans:

| Plan | Price | Duration |
| --- | ---: | ---: |
| Free | KRW 0 | No expiry |
| Pro | KRW 5,500 by default | 30 days by default |

`MATTHS_PRO_PRICE_KRW` and `MATTHS_PRO_BILLING_PERIOD_DAYS` configure the Pro defaults. Administrators resolve to non-expiring `SUPER_ADMIN` access.

Web Pro checkout uses KG Inicis. Native Pro purchase uses the configured `APPLE_PRO_PRODUCT_ID`, transaction ownership checks, signed server notifications, and idempotent plan activation. Plan access is resolved by `services/accountPlanService.js`.

Web authentication uses the shared session store. Native API authentication uses Bearer tokens. Email, Google, Kakao, and Apple sign-in are supported by their dedicated services.

## Learning, assessment, and weekly mock exams

Practice, progress, assessments, placement exams, and weekly mocks are server-authoritative. Web and native clients share the same attempts and submissions.

`ArenaCompetitiveProfile` separates internal matchmaking MMR from public competitive points. A weekly mock representative result changes only the participating user's internal competitive MMR; it never changes public competitive points. Non-participation changes neither value.

## GOAT Arena

### Shared match contract

- Five questions per match
- Ten minutes per question
- Answer and complete working required
- Desktop file upload or mobile/tablet grid board
- Capture and upload time excluded from solve time
- No voluntary forfeit after final submission
- Result page includes both actual question sets, submitted answers, correctness, totals, valid solve time, internal performance, and complete working

Normal and competitive may compare different question sets. The server uses correctness, exact source accuracy rates, and valid solve time. Time breaks only a configured close performance range.

### Normal

Normal starts hidden MMR at 1000. Hidden MMR selects U1–U9 problem difficulty and a valid completed opponent record close to the player's skill. Any question shown to a player is excluded from that player's next ten started normal or competitive matches. A verified baseline record can cover an initial range without a real record.

Only the current player's hidden rating, RD, volatility, and streak state change. Normal has no public leaderboard. A valid completion follows existing XP behavior and counts toward the three-match competitive placement unlock. Normal runs evidence anomaly detection without delaying or penalizing the player. A clean result becomes reusable automatically; a flagged record waits in the operator queue and returns to the pool only after approval. This review sends no email.

### Competitive

Competitive requires three valid normal matches and a finalized placement result based on one to five valid attempts. Server errors do not consume placement attempts. Exhaustion without a valid result requires an authorized reset.

Candidate Glicko-2 defaults are:

| Parameter | Default |
| --- | ---: |
| Rating | 1500 |
| RD | 350 |
| Volatility | 0.06 |
| Tau | 0.5 |

Initial placement RD is `350 / sqrt(valid samples)`. Placement volatility for one through five samples is `0.10, 0.09, 0.08, 0.07, 0.06`. Placement initializes public competitive points, and existing tier cutoffs map those points to the displayed tier. These values remain configurable hypotheses.

Competitive selects a valid completed record near the challenger's internal MMR and freezes the record's rating state and match evidence. Finalization updates only the current challenger's internal Glicko-2 MMR once, then calculates a separate public point change from the outcome and MMR expectation. RD and volatility converge continuously; there is no abrupt fifth/sixth-match multiplier boundary. Competitive runs automated integrity checks and operator review.

All public overall, school, university, retaker, and worker rankings are competitive rankings sorted directly from `competitiveScore`.

`ARENA_COMPETITIVE_ENABLED` controls competitive matchmaking and defaults to false.

### Friendly

Friendly matches are available between friends. Difficulty uses the mean effective MMR of both members: competitive internal MMR first, normal hidden MMR second, and 1000 when neither exists. Friendly results do not change MMR, public points, tier, or XP and do not run automated cheating detection.

### Group challenge

A member creates a challenge from a completed normal or competitive result. The link accepts any number of guests for three days. Guests enter nickname and birth date without login and solve the creator's exact five questions.

The same nickname and birth-date identity can attempt a link once. Returning after completion opens the leaderboard. Ranking uses correct count and then valid solve time. Participant details expose actual questions, submitted answers, correctness, difficulty-adjusted result data, and working. The creator's score becomes visible when every participant who has already joined has finished; once released, it stays visible while the link continues accepting later participants.

Guest records can be claimed during registration only with matching nickname, birth-date digest, browser ownership proof, and explicit confirmation. A completed guest can begin a reverse-challenge registration flow from the leaderboard.

## Current Arena service map

| Concern | Service |
| --- | --- |
| Configuration | `services/goatArenaV2Config.js` |
| Read model and rulebook | `services/goatArenaV2ReadService.js`, `services/goatArenaV22RulebookService.js` |
| Profiles and placement | `services/arenaV2ProfileService.js`, `services/arenaPlacementPolicyService.js` |
| Active-match ownership | `services/arenaActiveMatchService.js` |
| Difficulty | `services/arenaV2DifficultyService.js` |
| Normal records | `services/arenaAsyncNormalService.js`, `services/arenaHistoricalRecordSelectionService.js` |
| Competitive records | `services/arenaAsyncCompetitiveService.js` |
| Scoring | `services/arenaCompetitiveScoringService.js` |
| Internal MMR and public points | `services/glicko2Service.js`, `services/arenaAdaptiveRatingService.js`, `services/arenaCompetitivePointService.js` |
| Settlement | `services/arenaV2SettlementService.js`, `services/arenaEvidenceSettlementService.js` |
| Friends | `services/arenaFriendService.js` |
| Guest challenges | `services/arenaGuestChallengeService.js` |
| Web grid boards | `services/arenaWebInlineSolutionService.js` |
| Integrity review | `services/arenaV2IntegrityReviewAdapter.js` |
| Operator metrics and normal-record review | `services/adminArenaV2Service.js`, `services/adminCurrentMetricsService.js` |
| Weekly mock internal-MMR settlement | `services/mmrService.js` |

## Active Arena routes

### Web

| Method and path | Purpose |
| --- | --- |
| `GET /goat-arena` | Arena home |
| `GET /goat-arena/sub` | Normal page |
| `GET /goat-arena/main` | Competitive page |
| `POST /goat-arena/matchmaking/:mode/join` | Start matchmaking |
| `GET /goat-arena/matches/:matchId` | Play and result page |
| `POST /goat-arena/matches/:matchId/guest-invitations` | Create group challenge |
| `GET /goat-arena/friends` | Friend and friendly-match page |
| `GET /goat-arena/rules` | Rule index |
| `GET /goat-arena/rules/sub` | Normal rules |
| `GET /goat-arena/rules/main` | Competitive rules |
| `GET /arena-invite/:token` | Public guest challenge |

### Native API

`/api/v1/goat-arena` exposes the current read model, rulebook, matchmaking, friends, matches, answers, timers, grid boards, evidence, supplemental evidence, and results. Native write commands require Bearer authentication, `Idempotency-Key`, and for match commands `X-Matths-Client-Version`.

Web and native controllers call the same services; neither contains a separate scoring or rating implementation.

## Storage and security

MongoDB is authoritative for product state. `fileStorageService` routes uploads to their configured purpose-specific provider and stores authorization, hash, MIME, size, and retention metadata in MongoDB.

The application applies:

- same-origin protection and request rate limits
- session and Bearer authentication boundaries
- upload count, size, MIME, and content-signature validation
- CSP, HSTS in production, frame denial, and MIME-sniffing denial
- transaction and idempotency boundaries for settlement and commerce
- Mongo-backed scheduler leases for multi-process jobs

Guest birth dates are compared through a secret-key digest. Passwords are stored only as hashes. Ordinary responses exclude payment identifiers, storage keys, and private identity data.

## Configuration

Use `.env.example` as the inventory. Important current Arena overrides include:

- `ARENA_COMPETITIVE_ENABLED`
- `ARENA_GLICKO_DEFAULT_RATING`
- `ARENA_GLICKO_INITIAL_RD`
- `ARENA_GLICKO_DEFAULT_VOLATILITY`
- `ARENA_GLICKO_TAU`
- `ARENA_GLICKO_PLACEMENT_RD_BY_COUNT`
- `ARENA_GLICKO_PLACEMENT_VOLATILITY_BY_COUNT`
- `ARENA_NORMAL_HIDDEN_MMR_DEFAULT`
- `ARENA_QUESTION_REPEAT_WINDOW_MATCHES`
- `ARENA_ASYNC_CLOSE_SCORE_THRESHOLD`
- `ARENA_COMPETITIVE_SCORE_K_FACTOR`
- `ARENA_COMPETITIVE_SCORE_RATING_SCALE`
- `ARENA_COMPETITIVE_SCORE_MINIMUM`
- `ARENA_ONE_SIDED_MMR_DRIFT_WARNING_AVERAGE`
- `ARENA_RATING_REVERSAL_MINIMUM_STREAK`
- `ARENA_RATING_REVERSAL_DELTA_STEP`
- `ARENA_RATING_REVERSAL_MINIMUM_MULTIPLIER`
- `ARENA_GUEST_LINK_TTL_SECONDS` fixed to the current three-day product policy

Production startup validates required host, cookie, OAuth, commerce, storage, email, and secret configuration.

## Verification

Useful current checks:

```bash
npm run account-plans:verify
npm run active-commerce:verify
npm run arena-v2:verify
npm run arena-v21:verify-scoring
npm run arena-v22:verify-rulebook
npm run arena-normal-baseline:verify
npm run arena-cheating-modes:verify
npm run logic-parity:verify
npm run ui:verify
npm run contrast:verify
```

Database suites:

```bash
npm run account-plans:verify-db
npm run arena-v2:verify-db
npm run arena-v21:verify-db
npm run admin-arena-current:verify-db
npm run weekly-mock-mmr:verify-db
```

Rating and baseline simulations:

```bash
npm run arena-v2:simulate
npm run arena-normal-baseline:simulate
```

Index preparation is intentionally separate:

```bash
npm run arena-v2:indexes
```

## Production gate

Before production deployment, complete automated verification, staging index application and query inspection, concurrent settlement tests, real Cloudinary/R2 upload checks, desktop and mobile gameplay QA, commerce-provider QA, and rating-fairness review. Competitive activation uses the same gate before enabling its runtime flag.

## Logic documentation

| No. | English | 한국어 |
| ---: | --- | --- |
| 01 | [Current system](docs/logic_en/01_MATTHS_CURRENT_SYSTEM.md) | [현행 시스템](docs/logic/01_MATTHS_CURRENT_SYSTEM.md) |
| 02 | [Common Arena rules](docs/logic_en/02_GOAT_ARENA_COMMON_MATCH_RULES.md) | [Arena 공통 규칙](docs/logic/02_GOAT_ARENA_COMMON_MATCH_RULES.md) |
| 03 | [Normal match](docs/logic_en/03_NORMAL_MATCH.md) | [일반전](docs/logic/03_NORMAL_MATCH.md) |
| 04 | [Competitive match](docs/logic_en/04_COMPETITIVE_MATCH.md) | [경쟁전](docs/logic/04_COMPETITIVE_MATCH.md) |
| 05 | [Friendly and group challenge](docs/logic_en/05_FRIENDLY_AND_GUEST_CHALLENGE.md) | [친선전과 도전장](docs/logic/05_FRIENDLY_AND_GUEST_CHALLENGE.md) |
| 06 | [Rating and scoring](docs/logic_en/06_RATING_AND_SCORING.md) | [레이팅과 평가](docs/logic/06_RATING_AND_SCORING.md) |
| 07 | [Questions and evidence](docs/logic_en/07_QUESTION_AND_EVIDENCE.md) | [문항과 풀이 증거](docs/logic/07_QUESTION_AND_EVIDENCE.md) |
| 08 | [Accounts and plans](docs/logic_en/08_ACCOUNTS_PLANS_AND_ENTITLEMENTS.md) | [계정과 플랜](docs/logic/08_ACCOUNTS_PLANS_AND_ENTITLEMENTS.md) |
| 09 | [Weekly mock and competitive ranking](docs/logic_en/09_WEEKLY_MOCK_AND_RANKING.md) | [주간 모의고사와 경쟁전 랭킹](docs/logic/09_WEEKLY_MOCK_AND_RANKING.md) |
| 10 | [Operator capabilities](docs/logic_en/10_ADMIN_OPERATIONS.md) | [운영자 기능](docs/logic/10_ADMIN_OPERATIONS.md) |
| 11 | [Storage and security](docs/logic_en/11_DATA_STORAGE_AND_SECURITY.md) | [저장과 보안](docs/logic/11_DATA_STORAGE_AND_SECURITY.md) |
| 12 | [API and jobs](docs/logic_en/12_API_AND_BACKGROUND_JOBS.md) | [API와 작업](docs/logic/12_API_AND_BACKGROUND_JOBS.md) |
| 13 | [Release and validation](docs/logic_en/13_RELEASE_AND_VALIDATION.md) | [출시와 검증](docs/logic/13_RELEASE_AND_VALIDATION.md) |
