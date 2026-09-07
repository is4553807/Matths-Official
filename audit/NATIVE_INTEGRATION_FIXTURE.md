# Native simulator integration fixture

This is **local integration QA, not production E2E**. The runner starts the real
API router, real Bearer login/auth and real services over a disposable MongoDB
8.2.6 replica set. It binds only `127.0.0.1` on a random port. It does not use the
production database, SMTP, cloud storage, or application environment settings.

Updated for the 2026-09-07 current-main integration baseline
`eacae5f8949b12e6afe6965326c762d9b061bfb2`. The current router also exposes native
assignment OMR, weekly-mock insights, and authenticated canonical template files.
Their presence does not mean this runner seeds every workflow or verifies each
one on startup; coverage and limitations are listed below. Production has not been
deployed by this task. Cloudtype/operator access and production new-index status
remain unavailable/unconfirmed.

## Start

From the server checkout with its locked dependencies installed:

```sh
node audit/runNativeIntegrationFixture.js
```

For a side-by-side before/after server, preserve the original process and use a
different explicitly named owner-readable manifest (still only under `/tmp`):

```sh
node audit/runNativeIntegrationFixture.js --manifest=/tmp/matths-native-integration-fixed-0907.json
```

Each run gets its own port, database, controller/worker and generated credentials.
The `--manifest` filename must match `matths-native-integration-[a-z0-9-]+.json`;
arbitrary paths are refused. Stop each exact controller independently when done.

Keep this process running while the simulator is in use. Standard output reports
only the loopback port, controller/worker process IDs, non-secret account labels,
manifest path and smoke-test HTTP status codes. It does not print passwords,
tokens, signing secrets or request bodies.

The runtime manifest is created with exclusive creation and mode **0600** at:

`/tmp/matths-native-integration-0907.json`

The manifest contains `origin`, `apiBaseURL`, process IDs, fixture record IDs and
`accounts`. Each account entry contains `label`, `role`, `email`, `password`,
`token` and `userId`. Read credentials programmatically from this file; never
paste its full contents into a terminal output, screenshot, tracked source,
commit, chat message or build log.

| Account key | Data |
| --- | --- |
| student | New student; dashboard tutorial PENDING; no active assessment |
| returningStudent | Second student; completed dashboard tutorial; one active generated official-service assessment |
| teacher | Active teacher and owner of the local fixture academy |
| admin | Local fixture administrator |

All emails use the reserved `qa.invalid` domain. All passwords and signing keys
are randomly generated each run. Email local-parts also include the runId, so a
fresh DB's account cannot accidentally inherit another fixture's email-scoped iOS
drafts. Use the same still-running fixture if you want to test account persistence;
restarting creates different accounts by design. All four accounts can use the **existing**
`POST /api/v1/auth/login` endpoint; the manifest token is also available for QA
bootstrap. A role and two-student switch therefore exercises real server ownership.

The shared active academy has one class, both students, a published lesson/week
with a due assignment, and a manual attendance schedule. Public and synthetic
school community boards contain posts; a public post has a teacher comment.
All content is marked as synthetic local QA data.

The default week has instructions and a future due date, **but no assignmentOmr**.
The runner does not seed a graded PrivateMockExam dataset or an external PDF asset.
Do not claim a default startup validates OMR grading, a nonempty heatmap or real
file delivery. The dedicated suites below seed those additional cases separately.
Also, the default worker uses autoIndex:false and its explicit index-creation list
does not yet include AcademyAssignmentSubmission. Therefore its default ready state
must **not** be used to sign off OMR unique-index/concurrent-first-submission parity.
The dedicated OMR DB suite explicitly creates that model's indexes before testing.
An ongoing fixture must not be silently restarted or have its data changed merely
to add this coverage; coordinate any separate index-complete GUI fixture with its
QA owner. This documentation update does not modify the runner's setup code.

## Native app boundary

Use this URL only through a loopback-only **DEBUG** app configuration. Do not
change the Release production URL, embed runtime credentials into committed app
source, or overwrite the user's TestFlight app. This fixture is intended for the
iOS simulator. It is not designed to be reachable from a physical phone or LAN.

The runner checks `/me`, `/curriculum`, `/learning`, `/assessments`, student,
teacher and administrator academy dashboards, `/community`, capabilities and
all four real login operations before publishing the ready manifest.

First-learning GET/PATCH/CAS, actual iOS JSON decoding, account switching,
assessment state, basic academy navigation and community operations can then use
the same real API transport. This does not validate App Store transactions,
production data, actual SMTP or cloud object delivery.

## Additional API work after startup

Read origin, fixture IDs and each required account token in memory from the
0600 manifest. Verify fixtureOnly=true, productionEquivalent=false and loopback
origin before making any request. The worker adds
`X-Matths-Fixture: isolated-local-not-production` to responses. Never accept a
fallback production origin or reuse an old run's token. The ready message's ten
GET statuses and four login checks are only the startup checks listed above.

| Workflow | Current local route/use | What startup does not establish |
| --- | --- | --- |
| First learning | GET/PATCH `/api/v1/me/first-learning` with GET revision and schemaVersion 1 | Cross-device conflicts require multiple actual client requests; an imported completed blob is not official learning confirmation |
| Assessment CAS | GET/list/start expose mutationRevision; optional expectedRevision on draft/submit/expire | The single seeded returningStudent assessment is not every terminal or scoring case; coordinate its use with GUI QA |
| Teacher attendance | Existing teacher roster GET/POST with conditionalWriteVersion and changed-row expectedState | A duplicate/conflict test needs two captured baselines, not just one successful roster read |
| Teacher OMR | GET `/api/v1/academy/teacher/classes/:classId/classwork`, POST its `/weeks` route with assignmentOmr | Default week has no OMR; create/edit only the explicitly synthetic fixture week/academy after coordinating with the current QA owner |
| Student OMR | GET `/api/v1/academy/student/weeks/:weekId`, POST its `/submission` with answers | No default graded submission; teacher answerKey must remain absent in student replies, including after submit |
| Weekly insights | Teacher `/api/v1/academy/teacher/weekly-mock-insights` (optional classId); admin `/api/v1/academy/admin/:academyId/weekly-mock-insights` or `/api/v1/admin/weekly-mock-insights` | Empty correct response is expected until official mock/attempt fixture data is seeded; positive aggregate and revocation cases belong to the dedicated suite |
| Templates | Administrator GET `/api/v1/admin/answer-key-resources/skeleton` or `/catalog` | Requires actual tracked public/templates files in the checkout; the fake object store does not synthesize these files |

Teacher OMR saves use the same canonical web service, including regrading existing
submissions. Student repeat submits update the unique week/student result until
the deadline. The feature is not an immutable assessment and has no new
expectedRevision/requestId contract. Deadline finalization may run during real
teacher/student reads. Because the runner disables schedulers, verifying MISSED
through such a read is not proof that a one-minute production scheduler ran.

Weekly-mock insight JSON uses WEEKLY_MOCK_INSIGHTS_NATIVE_V1; OMR submission uses
ACADEMY_ASSIGNMENT_V1. Templates return raw original bytes with X-Content-SHA256,
Content-Type and Content-Disposition, not a JSON envelope. Compare bytes/hash
without printing credentials. Test stale/revoked roles and foreign scope denial
with purpose-built synthetic accounts rather than granting a real account access.

Capabilities currently advertise only firstLearningState/communityIdempotency,
not every route above. A capability GET can create the two community indexes
through its runtime ensureIndex path; the fixture is disposable, so that is
expected. For an operator's strict read-only DB preflight use the documented CLI,
not a capability or academy-week GET. See
[`MOBILE_RELIABILITY_CONTRACT_2026-09-07.md`](../docs/MOBILE_RELIABILITY_CONTRACT_2026-09-07.md)
for rollout/rollback and exact index permissions/specifications.

## Automated DB/HTTP verification is a separate fixture

```sh
npm run mobile-reliability:verify-db
```

The package currently selects 10 suites: first-learning state, community request
identity, assessment terminal safety, reset-password byte bound, actual mobile
HTTP router/index CLI, iPad mastery pipelines, assessment expectedRevision,
attendance conditional writes, academy assignment native OMR, and weekly-mock
native insights/resources. It starts a **different disposable Mongo replica set**
and does not attach to the ongoing simulator runner or modify its manifest.
The 2026-09-07 rerun after the strict index-inspection fix completed exit 0 with
all ten audits passing. This is automated local integration evidence, separate
from the parent task's simulator screenshots and any production smoke results.

The OMR suite exercises mixed 2-/9-choice and short-answer rows, teacher-only keys,
student redaction, repeat submission, canonical regrading, MISSED/deadline reopen,
legacy omitted configuration and role/class-access revocation during an awaited
read. The insight suite exercises four scopes, actual counts, flagged/unfinished
exclusion, role/class revocation, concept metadata, and both tracked template
downloads byte-for-byte. These are actual Express/Bearer/Mongo paths with synthetic
records, not an assertion that the default GUI seed contains all such data.

The HTTP suite additionally executes the real index preparation CLI against a fresh
loopback DB. Delayed index-read timing proves default inspection does not create
collections/indexes; --apply creates only the two community indexes/collections;
existing documents/indexes and repeated apply remain unchanged. This is nested
inside the HTTP suite, so the package count remains 10.

Use a clean checkout without production config for general audit commands. Their
`runInIsolatedAuditEnvironment.js` wrapper reads config.env and masks known provider
values; it is **not** the native worker's explicit environment allowlist and
loopback socket sandbox. Never invoke that wrapper directly with a production DB
URI. Neither automation mode proves SMTP, live cloud assets, production deployment,
or complete native UI behavior.

## Isolation and storage limits

- Controller creates a brand-new in-memory replica set/database; supplied `DB`
  or cloud environment variables are never forwarded to the API worker.
- Worker environment is an explicit allowlist with generated secrets and
  `DISABLE_SCHEDULERS=1`. `dotenv` configuration loading is disabled in that worker.
- Mongo URI is validated as a loopback URI with the exact generated database
  prefix, with no username/password.
- All worker outbound sockets are guarded to allow loopback only. Startup proves
  a public destination is rejected before a network connection occurs.
- SMTP transport is disabled. Upload/deletion calls at the storage service
  boundary are mocked into private worker memory. This is not a full asset
  delivery emulator; attachment download/avatar/cloud delivery QA is outside
  this fixture's validated surface.
- No application schedulers, production checkout mutation, checkout, reset,
  deployment or git operations are performed by the runner.

## Stop and clean up

Send `SIGTERM` to the **controller PID** from the ready output or manifest:

```sh
kill -TERM <controller-pid>
```

The controller asks the API worker to stop, closes the Mongo replica set, removes
its own generated temporary directory and removes the manifest only when its
`runId` matches. A worker that does not stop within ten seconds is terminated.
The existing manifest causes a second runner to refuse startup rather than
overwrite active credentials. Do not use `killall node` or broad temporary-file
deletion. After a force-kill/machine crash, verify the recorded controller and
worker are no longer running before deleting the exact stale manifest and
starting a new fixture.

Stopping discards fixture-only data; it does not remove any production or user
data. A fresh start gets a different database, port, IDs, passwords and tokens.

The first startup smoke failure exercised cleanup of its disposable worker and
MongoDB. Successful manual shutdown should be performed only after the native
QA session finishes, so an agent must not interrupt an active simulator run just
to test shutdown.
