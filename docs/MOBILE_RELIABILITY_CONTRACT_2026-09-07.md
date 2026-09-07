# Mobile reliability additions — integration and deployment contract

Baseline: web `main` at `eacae5f8949b12e6afe6965326c762d9b061bfb2`.
This change does not edit the separately pinned iOS content-generation reference.
It preserves existing web pages, route names, grading rules, time limits, quotas,
and keyless community writes. It has not been deployed to the production server.

Status as of 2026-09-07: these are local, uncommitted integration changes on the
existing branch. The package now selects **10 isolated DB/HTTP suites**, including
native academy assignment OMR and weekly-mock insights/template delivery. Neither
Cloudtype access nor operator credentials were provided to this task. Production
new-index application, all-instance rollout, external storage/email, and live
smoke checks remain **unconfirmed**. Do not read this runbook as deployment approval.

## Client integration order

1. Authenticate through the existing Bearer mechanism.
2. Request `GET /api/v1/mobile-capabilities`. Cache support by server origin and
   authenticated account/session, not globally forever. A 404 means an older
   deployment; keep local UX state and existing community behavior. A 401 means
   authentication failed, not an unsupported server. Network/5xx errors are not
   proof that the feature is unsupported.
3. Only new community operations whose server has confirmed support receive a
   `requestId`. Once any attempt used a key, persist that key and the exact
   operation body/attachments for retries. **Never retry that operation without
   the key**, even if capabilities later becomes false or an old instance returns
   400/404. Never issue a new key merely because a response was lost.
4. Restore first-learning UI state with GET before using PATCH. On a 409 revision
   conflict, inspect the returned `current`; do not silently overwrite another
   device's progress or completion with the stale local object.

Capabilities response (all endpoints are private, no-store and behind auth):

```json
{
  "schemaVersion": "MOBILE_CAPABILITIES_V1",
  "firstLearningState": true,
  "firstLearningStateVersion": 1,
  "communityIdempotency": true,
  "communityIdempotencyVersion": 1
}
```

`communityIdempotency` becomes true only after both real unique indexes have been
confirmed by MongoDB. It is false when index preparation fails. A keyed write
still independently waits for its index and fails closed with HTTP 503 and
`COMMUNITY_IDEMPOTENCY_UNAVAILABLE` if it cannot be guaranteed.

This capability GET currently calls idempotent `createIndex`, not just listIndexes.
The runtime DB identity therefore needs the applicable createIndex permission,
even when an operator prepared the indexes first. Do not use this GET as a
strictly read-only database preflight. The CLI inspection below is the read-only
preflight. No capability flag for OMR, insights or template downloads was added;
their route presence/schema and authenticated role must be checked separately.

## First-learning state

`GET /api/v1/me/first-learning` returns:

```json
{
  "schemaVersion": "FIRST_LEARNING_V1",
  "supported": true,
  "revision": 0,
  "state": null,
  "updatedAt": null
}
```

`PATCH /api/v1/me/first-learning` accepts only:

```json
{
  "schemaVersion": 1,
  "expectedRevision": 0,
  "state": {
    "flowVersion": 2,
    "stage": "goal",
    "goal": "school",
    "diagnosticAnswers": [],
    "conceptId": null,
    "seed": null,
    "expectedProblemIds": [],
    "problemContentFingerprint": null,
    "checkedAnswers": [],
    "topicRead": false,
    "startedAt": "2026-09-07T01:00:00Z",
    "learningStartedAt": null,
    "baselineProgress": null
  }
}
```

Success returns the GET envelope with incremented revision and server `updatedAt`.
Revision compare-and-swap is an atomic update to the authenticated User document;
missing legacy revisions mean zero. User IDs, device slots, tokens, official
confirmed progress, pass/unlock flags and dead-letter counters are not accepted.

| Field | Accepted contract |
| --- | --- |
| stage | goal, diagnosis, lesson, checks, awaitingSync, result, completed, skipped |
| goal | school, review, examination, measure |
| diagnosticAnswers | Up to two integers: first in 6/7/8, second in 2/3/4 |
| conceptId | null or 1–128 ASCII letters/digits/underscore/hyphen |
| seed | null or canonical unsigned decimal **string**, up to 18446744073709551615; never a JSON number |
| expectedProblemIds | Up to three unique IDs with the same ID syntax |
| problemContentFingerprint | null or lowercase 64-digit SHA256 |
| checkedAnswers | Up to three `{problemId, correct: Bool}` objects, unique and subset of expected IDs |
| topicRead | Strict Boolean |
| startedAt / learningStartedAt | null or UTC ISO8601 with seconds and optional 1–3 fractional digits |
| baselineProgress | null or integer 0–100 |

Checks and later stages require concept, seed, three expected IDs and topicRead.
AwaitingSync/result/completed additionally require all three checked answers.
The values are **untrusted UX resume state**, not verified learning achievements.
An app restoring result/completed must re-check official progress before claiming
server confirmation. This service does not mutate official progress, score, pass,
unlock, or the existing dashboard tutorial status.

Unknown fields, bad types, duplicate IDs, out-of-range seeds, malformed dates or
inconsistent stages produce 400 `FIRST_LEARNING_STATE_INVALID`. Stale revisions
produce 409 `FIRST_LEARNING_REVISION_CONFLICT` with `current` containing the latest
full GET envelope. Missing/inactive owners produce 404; unauthenticated requests
are rejected by the existing auth gate before reaching this service.

Existing dashboard `COMPLETE`, `SKIP`, and `RESTART` keep their old status response.
In the same atomic update they clear first-learning resume data and increment its
revision. Thus an outstanding pre-action PATCH cannot resurrect old state. No
cross-device clock is used for conflict resolution. A retry after a lost PATCH
response can get 409 and recover the acknowledged state from `current`.

## Community create idempotency

Existing endpoints accept one new optional field:

- `POST /api/v1/community/posts` JSON or existing multipart `communityFiles`:
  `board`, `title`, `content`, `isAnonymous`, optional `requestId`.
- `POST /api/v1/community/posts/:postId/comments`:
  `content`, `isAnonymous`, optional `requestId`.

`requestId` must be 16–128 ASCII letters/digits/underscore/hyphen. UUID strings are
valid. Missing/null retains legacy behavior. Supplied malformed keys are rejected
with 400 `COMMUNITY_REQUEST_INVALID`, never silently removed. The server computes
its own fingerprint over normalized visible content, target board/post, anonymous
mode and each attachment's ordered original name, MIME, length and actual SHA256
bytes. No client fingerprint is trusted. Uploaded bytes are hashed while staged,
before Cloudinary consumes the temporary file.

- Identical account/key/payload returns the original resource with the existing
  201 receipt; only one visible document is created, even across Node processes.
- Different payload on the same account/key returns 409
  `COMMUNITY_REQUEST_ID_CONFLICT`; it cannot replace the original.
- Replaying a deleted/hidden resource returns 410
  `COMMUNITY_REQUEST_NO_LONGER_VISIBLE`; it never recreates it.
- Keys are independent between accounts and between post/comment collections.
- Duplicate upload temporary files and late duplicate remote assets are discarded;
  the winning record's assets are retained. Failed parallel uploads settle before
  cleanup, avoiding a slow successful upload escaping an earlier failure path.
- Index/capability checks do not bypass existing active-account, board access,
  blocking, upload restriction, anonymous identity or daily quota rules.

Remote deletion failures still follow the existing best-effort cleanup behavior.
This change is not a durable object-store garbage-collection queue; an object-store
outage during deletion can require operator cleanup. No production storage call
was made during verification; tests fake only the object-store boundary.

## Official assessment safety

No route/body rename is required. Draft/save/submit/expire now use atomic
owner + in-progress status + `mutationRevision` + `updatedAt` filters. Missing old
revision values equal zero. DB write-time `$$NOW` also checks the original server
deadline. This blocks detached documents from saving over newer/terminal state.

For cross-device editing, draft/submit/expire accept optional `expectedRevision`.
When supplied it must be a JSON integer in 0–9007199254740990. Null, strings,
Booleans, fractions and out-of-range values return 400
`ASSESSMENT_REVISION_INVALID` for an active owned attempt. Omitting the field
preserves the existing web/legacy-client behavior.

Every native assessment DTO (list, GET, start, submit, expire) and every draft
receipt now includes the actual `mutationRevision`. The bounded list projection
explicitly includes the database field; it must not hydrate a missing projection
as a misleading zero. Missing **historical DB** fields legitimately mean zero on
this new server. A missing **wire DTO** field means an old server whose revision
support is unknown; the app must not manufacture zero or claim protection.

An app binds its dirty journal to the revision originally read. A newer GET does
not implicitly rebase unsent answers. The server compares that revision before
mutation, pins it in the atomic write filter and checks it again after any CAS
loss; it never silently retries a stale native edit against a newer revision.
Draft conflicts use `ASSESSMENT_DRAFT_CONFLICT`, submit/expire conflicts use
`ASSESSMENT_WRITE_CONFLICT`. Fetch the current GET and explicitly resolve local
answers before adopting its revision. A matching successful draft increments the
revision and returns it in the receipt for further in-flight editing.

Terminal precedence is unchanged: submitted/disqualified requests return their
existing immutable result even with a stale expected revision; abandoned requests
are rejected first. Explicit revision guards are only guaranteed when all server
instances handling that operation use this implementation. Mixed old/new rollouts
must be drained rather than treated as fully protected.

| Situation | Result |
| --- | --- |
| abandoned draft/submit/expire/start-key replay | 409 ASSESSMENT_ABANDONED, no answer/score mutation |
| submitted/disqualified replay | Existing terminal result, no regrading |
| stale draft against newer active draft | 409 ASSESSMENT_DRAFT_CONFLICT; fetch latest and review dirty local answers |
| same clientStartId with changed scope | 409 ASSESSMENT_START_ID_CONFLICT |
| repeated active write contention beyond bounded retries | 409 ASSESSMENT_WRITE_CONFLICT |

GET still exposes an abandoned status so the app can show cancellation and retain
local answer evidence without reopening the attempt. Existing web empty-attempt
replacement, answered-attempt resume and mobile empty-attempt resume are preserved.
No active-scope unique index or new concurrency policy for different start keys was
introduced. Only the winning submit transition creates wrong-answer records.
Terminal state and wrong-answer side effects remain separate writes; a process
crash immediately between them may omit a wrong-answer record. The new concurrency
guards prevent duplicate side effects but are not a transactional outbox.

## Password reset

Existing reset services now reject UTF-8 passwords longer than 72 bytes before
bcrypt hashing, with 400 `PASSWORD_TOO_LONG`. The existing minimum length,
ASCII-letter-and-digit rule, confirmation, verification code and token-version
rotation are unchanged. Existing passwords are not migrated or changed.

## Native integration finding: mastery/snapshot HTTP 500

The real simulator exposed a server failure missed by the previous read-only
fixture startup checks. The current lock uses Mongoose 9.7.4, which requires an
explicit `updatePipeline: true` option for array-form updates. Both iPad mastery
and snapshot controllers omitted it, causing a synchronous MongooseError before
MongoDB received the update. The exact native payload was:

```json
{"addCorrectTypeIds":["polynomial-arithmetic-core-definition"]}
```

Both existing routes now explicitly opt into their already-intended pipeline.
User-provided type ID strings are wrapped in `$literal`, so they cannot become
Mongo aggregation field expressions. Grading, canonical ID deduplication, reset
cutoffs and account ownership are unchanged. A new real-router/Bearer/Mongo audit
checks the exact payload, snapshot and topic preservation, legacy `web-` IDs,
literal dollar-prefixed values, 20 concurrent unions and canonical readback.

Side-by-side isolated fixture evidence was retained: the existing process returned
HTTP 500; a second process using the fixed controller returned HTTP 200 and stored
the requested type. Both used the same request shape and separate synthetic
returning-student accounts. The new student's GUI state was left untouched.

## Attendance row-concurrency contract

Real two-teacher reproduction found a sequential lost update: teacher A changed
student 1 from PRESENT to LATE; teacher B changed only student 2 but posted its
stale whole roster, reverting student 1 to PRESENT. The native client now creates
write commands only for rows changed relative to its captured baseline. It does
not turn the read roster into a whole-roster POST.

Teacher attendance GET/POST responses include optional `conditionalWriteVersion: 1`.
Each non-null `attendance` object now includes `id` and nullable `updatedAt` in
addition to its previous status/note/source/arrival fields. For that version,
changed POST records include:

```json
{
  "studentUserId": "<existing student object ID>",
  "status": "LATE",
  "note": "New intended note",
  "expectedState": {
    "recordId": "<attendance ID from GET>",
    "updatedAt": "2026-09-07T01:00:00.000Z",
    "status": "PRESENT",
    "note": "Original server note"
  }
}
```

For an unrecorded row, expectedState must explicitly contain `recordId: null`,
`updatedAt: null`, `status: null`, `note: ""`. A supplied malformed/mixed/missing
guard field produces 400 `ATTENDANCE_EXPECTED_STATE_INVALID`, never silent
downgrade. Each existing row must match its identity, last update, status and note
both in the transaction read and the atomic write/delete filter. A stale teacher
write cannot overwrite another teacher's or administrator's accepted changes.
Any conflict returns 409 `ATTENDANCE_WRITE_CONFLICT` and rolls back all guarded
rows and their audit records. After 409, native reload keeps local edits and marks
conflicting rows for explicit server/local choice; no automatic retry rebases them.
Changing the selected class/date while saving cannot install the old roster over
the new selection.

The platform already uses Mongo replica-set transactions for settlement/payment.
Guarded attendance batches likewise require transaction support; unsupported
deployment errors fail closed as 503 `ATTENDANCE_CONDITIONAL_WRITE_UNAVAILABLE`.
No extra index or historical data rewrite is needed. Existing session/student
unique indexes remain; new no-session attendance rows use a deterministic
ObjectId of their logical row to arbitrate simultaneous inserts through Mongo's
built-in `_id` uniqueness. Existing record IDs are never rewritten. Ambiguous
historical duplicate rows are rejected by the guarded path rather than erased.

Existing web/keyless callers which omit expectedStates/expectedState retain their
previous semantics. Consequently **old whole-roster web clients are not claimed
to have CAS protection**. New native clients on an old server still send only
changed rows but cannot claim same-row concurrency protection when the capability
is absent. Never infer supported guards from a missing DTO field.

`audit/verifyAttendanceConditionalWriteDb.js` covers the legacy reproduction plus
protected different/same-row writes, administrator corrections, all-or-none audit,
ten competing updates, ten simultaneous first creates, stale clear, administrator
change between transaction read/write, malformed/foreign-owner input, and actual
Bearer JSON GET/POST. The full existing `scripts/verifyAcademyPortal.js` passes in
an isolated database, preserving normal legacy academy behavior.

The regression also covers an academy owner selecting no classId: an existing
assigned student's record must be updated using its actual persisted class scope,
not treated as a missing classId:null row and reinserted with the same _id. This
avoids a deterministic duplicate-key conflict on an otherwise valid owner edit.

## Native academy assignment OMR

These APIs adapt the current web `academyClassworkService` rather than introducing
a second grading policy. Teacher routes require a current, unexpired teacher role
and current class permission. Retained staff membership alone does not authorize
a revoked teacher to read answer keys. Permission is rechecked after awaited reads.

| Route | Contract |
| --- | --- |
| GET `/api/v1/academy/teacher/classes/:classId/classwork` | Existing response, with each week's optional assignmentOmr and submissions; teacher-only answerKey and student result identity |
| POST `/api/v1/academy/teacher/classes/:classId/classwork/weeks` | Existing JSON/multipart route plus optional assignmentOmr object or JSON string |
| GET `/api/v1/academy/student/weeks/:weekId` | Existing week response plus nullable submission; answerKey is never serialized to students |
| POST `/api/v1/academy/student/weeks/:weekId/submission` | `{ "answers": ["2", "12.0", "9", "가나"] }`; 200 `{ "schemaVersion": "ACADEMY_ASSIGNMENT_V1", "submission": ... }` |

OMR configuration uses enabled, questionCount (1–100), consecutive sections
`{startNumber,endNumber,answerType,choiceCount}`, and answers/answerKey. Types are
MULTIPLE_CHOICE or SHORT_ANSWER; objective choices are 2–9. The native client sends
the explicit sections. Missing/null/empty assignmentOmr preserves an existing OMR
on a legacy metadata edit; `{enabled:false}` explicitly removes it. Teacher answer
changes use the same web regrading path. Existing OMR-free weeks remain supported.

Student answers must be 1–100 strings, each at most 80 JavaScript UTF-16 code units
at the API boundary. The service requires all configured questions, validates
choice ranges, normalizes NFKC/whitespace/case, supports `|`-separated short-answer
keys, and computes the result. Student-supplied score/identity cannot choose the
result or its owner. Submission includes id, weekId, answers, answerModes,
answeredCount, correctByQuestion, correctCount, questionCount, scorePercent,
status, submittedAt, gradedAt, autoZeroedAt and answerKeyConfiguredAt. Teacher list
serialization additionally includes student identity; student responses do not.

Within the deadline, repeat submission updates the unique week/student result;
it is not an immutable terminal assessment. Invalid input returns 400; inaccessible
week/class 404; expired deadline 410; unauthenticated 401; revoked teacher 403.
After a deadline, the canonical service records MISSED/0 for eligible non-submitters
without replacing an existing SUBMITTED result. Reopening a deadline removes MISSED
placeholders through the existing teacher-save workflow. **No new cross-device
expectedRevision/idempotency guarantee is advertised for this mutable OMR route.**

The deadline scheduler runs every minute in the normal server startup. Fixture
schedulers are disabled; isolated tests exercise deadline finalization through
the real service/read paths instead. Teacher and student GETs can finalize due
assignments, so do not use real student weeks as supposedly read-only smoke data.

## Weekly-mock insights and canonical resources

| GET route | Scope and authority |
| --- | --- |
| `/api/v1/academy/teacher/weekly-mock-insights` | Current teacher's academy overall and class comparisons |
| `/api/v1/academy/teacher/weekly-mock-insights?classId=<id>` | Authorized assigned class; classes array empty |
| `/api/v1/academy/admin/:academyId/weekly-mock-insights` | Super administrator, selected academy |
| `/api/v1/admin/weekly-mock-insights` | Super administrator, global |

Response schema is WEEKLY_MOCK_INSIGHTS_NATIVE_V1 with scope `{kind,id,label}`,
overall, and classes. Insights expose exam/participant/submission counts, average
score, concept counts, hardestConcept, generatedAt and concept rows with official
counts/accuracy/difficulty/level/labels. These use the same current
`weeklyMockInsightService` aggregation as the web: up to 36 recent released official
exams, submitted results, excluding flagged integrity and unfinished finalization.
No student identity is returned by aggregate routes. Foreign class access,
student/non-admin callers, malformed query arrays and mid-query revocation are
covered by the isolated HTTP suite. Empty data is a valid empty insight, not a
fabricated positive score. Responses are private, no-store.

GET `/api/v1/admin/answer-key-resources/skeleton` and `/catalog` returns the actual
tracked public template bytes, not a locally regenerated substitute. Only current
super administrators may use these native endpoints. Content-Type is JSON or
Markdown UTF-8; Content-Disposition supplies the filename; X-Content-SHA256 is the
byte digest; Cache-Control is private/no-store and nosniff is set. Only the two
fixed keys are accepted; unknown/prototype/path-traversal keys return 404. Source
files must be regular, nonempty and at most 2MiB or the endpoint returns 503.
Deploy both `public/templates/matths-answer-key-skeleton.json` and
`public/templates/matths-ai-concept-catalog.md`; a sparse source-only artifact that
omits these files is not a complete deployment.

Admin weekly-mock review DTOs now retain the source's canonical concept metadata.
The v3 authoring/grading policy remains the current `privateMockExamService` policy:
questions numbered 1–30, canonical concept IDs/titles, real explanations, per-item
2/3/4 points totalling 100, mixed question types and number-based grading. Legacy
formats retain the upstream compatibility path. The app prioritizes explicit
questionModes; old fixed-type fallback is not used to override v3 metadata.

## Index preparation, rollout and rollback

### Preconditions and strict inspection semantics

- An authorized deployment operator must select the intended deployment revision
  and DB through the existing secret provider. This task has no Cloudtype session
  or production DB authority; none of the following commands was run in production.
- Run the CLI from this checkout with lockfile-compatible dependencies. The CLI
  reads `process.env.DB` only; it does not load config.env, .env or hosting secrets
  for you. Do not paste connection strings or credentials into commands/logs.
- Default inspection needs connection/listIndexes rights; --apply additionally
  needs createIndex rights on the two community collections and a writable primary.
  Check topology and transaction support separately: guarded attendance requires
  a replica set or transaction-capable sharded cluster. A standalone Mongo server
  is not sufficient for the complete feature set. The index CLI does not test this.
- Schedule/record a backup and rollback owner before write-enabled rollout.
  Check duplicate string requestId/authorId combinations without deleting data.
  Invalid existing index options, uniqueness conflicts, permissions or disk capacity
  are release blockers, not reasons to drop an index or silently disable a guard.

No historical document rewrite or destructive migration is required. New optional
fields are added to User preferences, AssessmentAttempt and community documents.
The mobile index CLI manages exactly one index on each of `communityposts` and
`communitycomments` (this is **not** a complete list of all upstream academy indexes):

```javascript
{
  key: { authorId: 1, requestId: 1 },
  name: "community_author_request_id_unique_v1",
  unique: true,
  partialFilterExpression: { requestId: { $type: "string" } }
}
```

The deployment operator must supply DB through the existing secret provider; do
not put credentials in shell history, reports or screenshots. Run from the deployed
checkout with its locked dependencies:

```sh
node scripts/prepareMobileReliabilityIndexes.js
node scripts/prepareMobileReliabilityIndexes.js --apply
node scripts/prepareMobileReliabilityIndexes.js
```

The first and third commands only inspect. There is no `--dry-run` flag: no argument
is dry inspection; `--apply` is the sole accepted flag. Unknown flags exit 1 before
connecting. The script disables autoCreate and autoIndex both before importing
models and on connect, so model initialization cannot quietly create collections
during inspection. The setting is confined to this CLI process, not app runtime.

Exit 0 means both exact specifications were found. Exit 2 means an index is missing or
does not match. `--apply` creates exactly the two indexes and never drops existing
indexes/data; if a community collection is absent, Mongo may create that collection
and its automatic _id index as part of createIndex. The two creates are sequential,
not a transaction: if the second fails, the first may remain successfully created.
Exit 1 means usage, environment, connection or index operation failed. Do not ignore a
duplicate-key, options-conflict, permission, or storage error. Leave the old
deployment active and investigate the named collection/index before retrying;
do not delete documents or automatically drop an existing index. Historical
documents without a string requestId are outside the partial index.

The current upstream OMR feature additionally uses AcademyAssignmentSubmission's
unique `{weekId:1,studentUserId:1}` index (`academy_assignment_submission_unique`),
the class/week deadline queue (`academy_assignment_deadline_queue`), the new
membership `{classId:1,status:1,approvedAt:1}` index and the supporting submission
indexes declared in `models/academyModel.js`. The community CLI does not create or
verify them. Verify the expected specs against that model before enabling OMR.
Normal `server.js` startup calls `ensureAcademyIndexes`, which creates these indexes
but also runs **inherited** backfills and can drop the old academy/student/date
attendance unique index. Other startup migrations also exist. Therefore starting
the full server/that helper is not a harmless substitute for read-only inspection;
review its existing migration behavior and back up before an operator executes it.

Roll out all server instances together or drain old instances before advertising
support. A mixed deployment can reject optional fields on old instances; iOS must
retain keyed pending operations rather than downgrade them. Evaluate final auth,
profile/tutorial, community and assessment smoke results before broadening traffic.

Rollback may restore the previous server code while retaining all new fields and
indexes. **Do not drop the indexes or erase idempotency keys.** New clients seeing
older capabilities behavior keep local state and pause previously-keyed pending
writes. Old keyless clients continue their original behavior. During rollback the
new assessment CAS protections are no longer active: drain outstanding writes and
inform the client/reviewer rather than claiming continued protection. No production
restart/deploy or App Store submission was executed by this task.

Rollback of native OMR/insights/resource adapters can restore an older server while
keeping upstream OMR data/indexes and source templates. Do not erase submissions or
restore pre-existing documents merely to hide a missing route. New apps must show
unavailable/error and preserve drafts on an older 404 response, not locally invent
a submission or a successful upload. Restore missing template artifacts as an
artifact repair if that is the isolated failure. There is no new universal runtime
feature flag that safely switches off every addition.

### Operator checklist and post-deployment smoke

- [ ] Final commit/artifact selected by the release owner; this working tree has not been pushed by this task.
- [ ] Same artifact passes the 10-suite local/staging checks below; test fixtures are never pointed at production.
- [ ] Production backup, topology/transaction support, roles, all required community/OMR index specs and runtime createIndex permission confirmed.
- [ ] Both template artifacts included and byte digests recorded without credentials.
- [ ] Rollback revision, person responsible and short observation window agreed.
- [ ] All old server instances drained before advertising CAS/idempotency protection.
- [ ] Deployment operator, not this task, runs approved production smoke using dedicated QA accounts/academy only.

Start with existing login/profile/curriculum/learning GETs. On staging/dedicated
QA data verify: first-learning GET→PATCH→stale409/current and old COMPLETE/SKIP;
community identical-key201/same ID, changed payload409 and deleted-resource410;
assessment actual revisions, stale draft409 and terminal replay; attendance changed
rows, one stale same-row409 and no partial roster/audit write; OMR teacher creation,
student answer-key redaction, submit/update/read, teacher regrade, deadline MISSED
and reopening; each insight role/scope plus student403; both resource download
digests and non-admin403. Do not use an actual student's assessment/attendance/week
to manufacture these cases. Payload examples are not permission to modify real data.

Separately verify external SMTP/private relay, storage uploads/downloads, production
scheduler execution, IAP/checkout and app signed builds. They are not established by
the isolated suite. Observe HTTP 4xx/5xx, latency and scheduler/index failures for at
least 15 minutes using the operator's approved baseline. Stop rollout for any
cross-account/answer-key disclosure, data overwrite/duplicate visible create,
failed guarded transaction, missing canonical resources or critical login/submit
failure. Keep drafts/keys and evidence; do not fix an outage with broad data deletion.
If rollback removes guards, drain pending writes and state explicitly that new CAS
guarantees are unavailable until a compatible server returns.

## Reproducible validation

Latest local rerun on 2026-09-07, after the CLI read-only guard and nested index
regression: `npm run mobile-reliability:verify-db` completed with exit 0 and
`Isolated memory Mongo suite passed: 10 audit(s).` Expected authorization/conflict
denials and disabled-SMTP messages are part of these synthetic tests, not successful
email delivery. This local pass does not change the unconfirmed production status.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run mobile-reliability:verify-db
node scripts/verifyDashboardTutorial.js
node audit/verifyIpadCommunityHttpContract.js
node audit/verifyIpadAssessmentHttpContract.js
node audit/verifyAssessmentServiceSafety.js
node audit/verifyIpadProfileHttpContract.js
node scripts/verifyIpadServerSurface.js
```

The additional commands after the package suite are separate compatibility checks;
they are not counted among its ten DB suites or implied rerun by that one command.

The package's 10-suite command starts its own disposable MongoDB 8.2.6 replica set;
it overrides the database URI for each audit and disables schedulers and known
external-provider credentials. The child isolation wrapper still reads config.env
before masking known provider settings, so use a clean secret-free checkout for QA.
Do not invoke that wrapper directly with an operator/production URI. Unlike the
native fixture worker below, this general audit wrapper is not advertised as a
complete network-egress sandbox. The exercised upload/email boundaries are mocked
or disabled; this is not production E2E. It exercises real services/models/constraints:
20 competing first-learning writes, strict malformed input and exact UInt64;
20 post and 20 comment retries, three independent Node processes, quotas and
attachment cleanup; 14 assessment concurrency/terminal/web-compatibility cases;
ASCII/multibyte password limits and actual bcrypt/token-version changes. A fifth
suite exercises the actual Express router with real signed Bearer tokens and
MongoDB auth/lifecycle services: missing/revoked token denial, separate account
state, date JSON, capability readiness, revision conflicts, legacy COMPLETE,
community 201 replay/409 conflict/410 tombstone, and index preparation twice. A
sixth suite covers the native-discovered mastery/snapshot pipeline failure above.
A seventh real HTTP/Mongo suite checks sequential two-device edits to the same
question, twenty matching-baseline drafts with one winner, CAS-loss submission
that refuses automatic rebase, stale expiry, legacy omission, actual list/ack
revisions, terminal precedence and strict invalid/foreign-owner rejection.

| Suite selected by `mobile-reliability:verify-db` | Additional coverage |
| --- | --- |
| verifyFirstLearningStateDb.js | Account-owned CAS, schema, UInt64, tutorial invalidation |
| verifyCommunityRequestIdDb.js | Concurrent/multi-process keyed create, payload conflict, tombstone and upload cleanup |
| verifyAssessmentTerminalSafetyDb.js | Abandoned/terminal state, concurrent writes and web resume semantics |
| verifyPasswordResetByteBoundDb.js | Actual bcrypt/password/code/token-version paths |
| verifyMobileReliabilityHttpDb.js | Real Bearer router contracts plus actual index CLI inspection/apply regression |
| verifyIpadLearningPipelineDb.js | Simulator-discovered Mongoose pipeline update and concurrent canonical unions |
| verifyAssessmentExpectedRevisionDb.js | Actual DTO/list/ack revisions, stale same-question submit/draft/expiry |
| verifyAttendanceConditionalWriteDb.js | Changed-row/teacher/admin conflicts, atomic batch/audit, no-class owner route |
| verifyAcademyAssignmentNativeDb.js | Native teacher/student OMR, redaction, mixed modes, regrade/MISSED/reopen, role/class revocation including during awaited read |
| verifyWeeklyMockInsightsNativeDb.js | Four scopes, canonical counts, excluded flagged/pending attempts, revocation; admin concept DTO and exact original template bytes/digests |

The index regression is nested inside the fifth suite (not an eleventh package
suite). It creates a separate fresh loopback DB, slows only index-list timing,
and checks before/after collections/indexes/documents: default inspection creates
nothing; --apply creates only the two target indexes/collections; repeated apply
preserves other indexes/data; an unsupported flag changes nothing. Its DB is then
removed. This addresses implicit Mongoose model autoCreate during a slow inspection.

The selected 10 suites are a scope manifest, not a statement that every web/iOS
route was tested. Earlier `MOBILE_RELIABILITY_VALIDATION_2026-09-07.json` is a separate
historical evidence snapshot; use the latest root integration log for the final
combined verdict rather than inferring current deployment from that file.

Storage upload/deletion behavior is tested through a controlled object-store
boundary, not live Cloudinary/R2. The assessment tests control request timing but
do not mock service/model results. These checks do not prove production deployment,
live external storage availability, or every existing application route.
