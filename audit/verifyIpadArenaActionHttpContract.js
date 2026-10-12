const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "development";

const USER_ID = "0123456789abcdef01234567";
const MATCH_ID = "fedcba987654321001234567";
const HEADERS = {
  "idempotency-key": "ipad-action-1234567890",
  "x-matths-client-version": "1.0.0(16)",
};

function request({ body = {}, files = [], headers = HEADERS } = {}) {
  return {
    apiUser: { _id: USER_ID },
    params: { matchId: MATCH_ID },
    body,
    files,
    headers,
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

async function invoke(handler, req) {
  let payload;
  let error;
  const res = {
    set() { return res; },
    json(value) { payload = value; return res; },
  };
  await handler(req, res, (value) => { error = value; });
  return { payload, error };
}

async function run() {
  const {
    createIpadGoatArenaActionController,
    uploadError,
  } = require("../controllers/ipadGoatArenaActionController");
  assert.equal(uploadError.length, 4);

  const calls = [];
  const controller = createIpadGoatArenaActionController({
    async submitEvidence(input) {
      calls.push(["evidence", input]);
      return {
        evidenceId: "evidence-1",
        status: "ON_TIME",
        matchStatus: "IN_PROGRESS",
      };
    },
    async finalizeAfterEvidence(input) {
      calls.push(["finalize", input]);
      return { settled: true };
    },
    async attachClientReview(input) {
      calls.push(["review", input]);
      return { reviewId: input.reviewId, accepted: true };
    },
    async getSupplementalEvidenceRequest(input) {
      calls.push(["supplemental-get", input]);
      return {
        matchId: input.matchId,
        status: "REQUESTED",
        deadlineAt: "2026-09-03T00:00:00.000Z",
      };
    },
    async submitSupplementalEvidence(input) {
      calls.push(["supplemental-submit", input]);
      return {
        status: "SUBMITTED",
        submittedAt: "2026-09-02T01:00:00.000Z",
        fileCount: input.files.length,
      };
    },
  });

  const evidenceRequest = request({ files: [{ path: "/tmp/evidence.jpg" }] });
  evidenceRequest.arenaEvidenceReceivedAt = new Date("2026-09-02T00:00:00.000Z");
  const evidence = await invoke(controller.submitMatchEvidence, evidenceRequest);
  assert.ifError(evidence.error);
  assert.equal(evidence.payload.evidence.submissionId, HEADERS["idempotency-key"]);
  assert.equal(calls[0][0], "evidence");
  assert.equal(calls[1][0], "finalize");
  assert.equal(calls[1][1].matchId, MATCH_ID);
  assert.equal(calls[1][1].userId, USER_ID);

  const review = await invoke(
    controller.submitClientReview,
    request({
      body: {
        evidenceId: "222222222222222222222222",
        model: "Qwen vision",
        modelVersion: "qwen.gguf",
        reviewState: "suspicious",
        signals: ["unexplained-jump"],
        completedAt: "2026-09-02T00:00:00.000Z",
      },
    })
  );
  assert.ifError(review.error);
  assert.equal(review.payload.review.accepted, true);
  assert.equal(calls[2][0], "review");
  assert.equal(calls[2][1].reviewId, HEADERS["idempotency-key"]);

  const supplemental = await invoke(controller.getSupplementalEvidence, request());
  assert.ifError(supplemental.error);
  assert.equal(supplemental.payload.schemaVersion, "GOAT_ARENA_SUPPLEMENTAL_EVIDENCE_V1");
  assert.equal(supplemental.payload.request.status, "REQUESTED");

  const supplementalRequest = request({ files: [{ path: "/tmp/supplemental.jpg" }] });
  supplementalRequest.arenaEvidenceReceivedAt = new Date("2026-09-02T01:00:00.000Z");
  const submitted = await invoke(
    controller.submitSupplementalEvidenceFiles,
    supplementalRequest
  );
  assert.ifError(submitted.error);
  assert.equal(submitted.payload.submission.status, "SUBMITTED");
  assert.equal(submitted.payload.submission.fileCount, 1);

  const missingHeaders = await invoke(
    controller.submitMatchEvidence,
    request({ files: [{ path: "/tmp/evidence.jpg" }], headers: {} })
  );
  assert.equal(missingHeaders.error?.code, "GOAT_ARENA_COMMAND_HEADER_REQUIRED");

  const unexpectedBody = await invoke(
    controller.submitClientReview,
    request({ body: { unsupported: true } })
  );
  assert.equal(unexpectedBody.error?.code, "GOAT_ARENA_COMMAND_BODY_INVALID");

  const routeSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "api-routes.js"),
    "utf8"
  );
  for (const route of [
    '"/goat-arena/matches/:matchId/evidence"',
    '"/goat-arena/matches/:matchId/evidence/client-review"',
    '"/goat-arena/matches/:matchId/supplemental-evidence"',
  ]) {
    assert.ok(routeSource.includes(route), `${route} Bearer route is missing`);
  }
  assert.ok(
    routeSource.indexOf("router.use(requireApiAuth)") <
      routeSource.indexOf('"/goat-arena/matches/:matchId/evidence"')
  );

  console.log("iPad Arena evidence and review HTTP contracts passed.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
