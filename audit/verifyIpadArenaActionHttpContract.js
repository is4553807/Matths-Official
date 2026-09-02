const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "development";

const USER_ID = "0123456789abcdef01234567";
const MATCH_ID = "fedcba987654321001234567";
const OFFER_ID = "111111111111111111111111";
const HEADERS = {
  "idempotency-key": "ipad-action-1234567890",
  "x-matths-client-version": "1.0.0(16)",
};

function request({ matchId = MATCH_ID, body = {}, files = [] } = {}) {
  return {
    apiUser: { _id: USER_ID },
    params: { matchId },
    body,
    files,
    headers: HEADERS,
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
  assert.equal(uploadError.length, 4, "multer 오류 핸들러는 Express 4-인자 함수여야 합니다");

  const calls = [];
  const controller = createIpadGoatArenaActionController({
    async createSubChallenge(input) {
      calls.push(["create", input]);
      return {
        match: {
          _id: MATCH_ID,
          status: "READY",
          integrityStatus: "CLEAR",
        },
      };
    },
    async respondInvitation(input) {
      calls.push(["respond", input]);
      if (input.response === "DECLINE") return { status: "DECLINED" };
      return {
        status: "MATCHED",
        match: {
          _id: MATCH_ID,
          status: "READY",
          integrityStatus: "CLEAR",
        },
      };
    },
    async submitEvidence(input) {
      calls.push(["evidence", input]);
      return {
        evidenceId: "evidence-1",
        attemptId: "attempt-1",
        status: "ON_TIME",
        matchStatus: "SUBMITTED",
        replayed: false,
        submittedAt: "2026-09-02T00:00:00.000Z",
        deadlineAt: "2026-09-02T00:01:00.000Z",
        anomalyFlags: [],
      };
    },
    async settleMatch(input) {
      calls.push(["settle", input]);
      return { settled: true };
    },
    async attachClientReview(input) {
      calls.push(["client-review", input]);
      return { reviewId: input.reviewId, replayed: false, accepted: true };
    },
    async getMainActions(input) {
      calls.push(["main-options", input]);
      return {
        eligible: true,
        reasons: [],
        currentTier: "골드",
        availableLearningDays: 12,
        matchmakingRestrictedUntil: null,
        activeMatch: null,
        requestLocked: false,
        policy: {
          stakeDaysByTierGap: [
            { tierGap: 1, stakeDays: 2 },
            { tierGap: 2, stakeDays: 3 },
          ],
        },
        sentInvitations: [{
          _id: "333333333333333333333333",
          status: "OFFERED",
          targetTier: "실버",
          stakeDays: 2,
          reservedLearningDays: 2,
          createdAt: new Date("2026-09-02T00:00:00.000Z"),
        }],
        upwardTargets: [{
          label: "플래티넘",
          gap: 1,
          minimumStakeDays: 1,
          maximumStakeDays: 5,
        }],
        lowerTargets: [{ label: "실버", gap: 1 }],
      };
    },
    async createMainUpward(input) {
      calls.push(["main-upward", input]);
      return {
        match: { _id: MATCH_ID, status: "READY", integrityStatus: "PENDING" },
      };
    },
    async createMainInvitation(input) {
      calls.push(["main-invitation", input]);
      return {
        _id: "333333333333333333333333",
        status: "OFFERED",
        targetTier: input.targetTier,
        stakeDays: input.stakeDays,
      };
    },
    async cancelMainInvitation(input) {
      calls.push(["main-cancel", input]);
      return {
        _id: input.invitationId,
        status: "CANCELLED",
        releasedLearningDays: 2,
        burnedLearningDays: 0,
      };
    },
  });

  const created = await invoke(controller.createUnrankedMatch, request());
  assert.ifError(created.error);
  assert.deepEqual(created.payload.match, {
    id: MATCH_ID,
    status: "READY",
    integrityState: "CLEAR",
  });
  assert.equal(calls[0][1].requestId, HEADERS["idempotency-key"]);

  const accepted = await invoke(
    controller.acceptRankedInvitation,
    request({ matchId: OFFER_ID })
  );
  assert.ifError(accepted.error);
  assert.equal(accepted.payload.invitationId, OFFER_ID);
  assert.equal(accepted.payload.match.id, MATCH_ID);
  assert.deepEqual(calls[1][1], {
    offerId: OFFER_ID,
    userId: USER_ID,
    response: "ACCEPT",
  });

  const declined = await invoke(
    controller.declineRankedInvitation,
    request({
      matchId: OFFER_ID,
      body: { reasonCode: "TECHNICAL_ISSUE" },
    })
  );
  assert.ifError(declined.error);
  assert.equal(declined.payload.match.status, "CANCELLED");
  assert.equal(calls[2][1].declineReasonCode, "TECHNICAL_ISSUE");

  const invalidDecline = await invoke(
    controller.declineRankedInvitation,
    request({ matchId: OFFER_ID, body: { reasonCode: "UNKNOWN" } })
  );
  assert.equal(invalidDecline.error?.code, "GOAT_ARENA_DECLINE_REASON_INVALID");

  const evidenceRequest = request({ files: [{ path: "/tmp/evidence.jpg" }] });
  evidenceRequest.arenaEvidenceReceivedAt = new Date("2026-09-02T00:00:00.000Z");
  const evidence = await invoke(controller.submitMatchEvidence, evidenceRequest);
  assert.ifError(evidence.error);
  assert.equal(evidence.payload.evidence.submissionId, HEADERS["idempotency-key"]);
  assert.equal(calls[3][0], "evidence");
  assert.equal(calls[4][0], "settle");
  assert.deepEqual(calls[4][1], { matchId: MATCH_ID });

  const clientReview = await invoke(
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
  assert.ifError(clientReview.error);
  assert.equal(clientReview.payload.review.accepted, true);
  assert.equal(calls[5][0], "client-review");
  assert.equal(calls[5][1].reviewId, HEADERS["idempotency-key"]);

  const options = await invoke(controller.getMainActionOptions, request());
  assert.ifError(options.error);
  assert.equal(options.payload.schemaVersion, "GOAT_ARENA_MAIN_ACTIONS_V1");
  assert.equal(options.payload.upwardTargets[0].maximumStakeDays, 5);
  assert.equal(options.payload.lowerTargets[0].minimumStakeDays, 2);
  assert.equal(options.payload.sentInvitations[0].canCancel, true);

  const upward = await invoke(
    controller.createMainUpwardMatch,
    request({ body: { targetTier: "플래티넘", stakeDays: 2 } })
  );
  assert.ifError(upward.error);
  assert.equal(upward.payload.kind, "MATCH");
  assert.equal(upward.payload.match.id, MATCH_ID);

  const invitation = await invoke(
    controller.createMainLowerInvitation,
    request({ body: { targetTier: "실버", stakeDays: 2 } })
  );
  assert.ifError(invitation.error);
  assert.equal(invitation.payload.kind, "INVITATION");
  assert.equal(invitation.payload.invitation.status, "OFFERED");

  // cancel 경로는 matchId가 아니라 invitationId를 사용한다.
  const cancelRequest = request();
  cancelRequest.params.invitationId = "333333333333333333333333";
  const cancellation = await invoke(controller.cancelSentMainInvitation, cancelRequest);
  assert.ifError(cancellation.error);
  assert.equal(cancellation.payload.kind, "INVITATION_CANCELLATION");
  assert.equal(cancellation.payload.invitation.releasedLearningDays, 2);

  const missingHeaders = request();
  missingHeaders.headers = {};
  const rejected = await invoke(controller.createUnrankedMatch, missingHeaders);
  assert.equal(rejected.error?.code, "GOAT_ARENA_COMMAND_HEADER_REQUIRED");

  const routeSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "api-routes.js"),
    "utf8"
  );
  for (const route of [
    '"/goat-arena/matches/sub"',
    '"/goat-arena/matches/:matchId/accept"',
    '"/goat-arena/matches/:matchId/decline"',
    '"/goat-arena/matches/:matchId/evidence"',
    '"/goat-arena/matches/:matchId/evidence/client-review"',
    '"/goat-arena/matches/main/options"',
    '"/goat-arena/matches/main/upward"',
    '"/goat-arena/matches/main/invitations"',
    '"/goat-arena/matches/main/invitations/:invitationId/cancel"',
  ]) {
    assert.ok(routeSource.includes(route), `${route} Bearer 라우트가 없습니다`);
  }
  assert.ok(
    routeSource.indexOf("router.use(requireApiAuth)") <
      routeSource.indexOf('"/goat-arena/matches/sub"'),
    "Arena action routes must remain behind requireApiAuth"
  );

  console.log("iPad Arena matchmaking, invitation, and evidence HTTP contracts passed.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
