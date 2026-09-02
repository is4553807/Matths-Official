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

function request({ matchId = MATCH_ID, body = {}, files = [], query = {} } = {}) {
  return {
    apiUser: { _id: USER_ID },
    params: { matchId },
    body,
    files,
    query,
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
    async getPaybackAccountSummary(userId) {
      calls.push(["payback-summary", userId]);
      return {
        confirmed: true,
        bankName: "토스뱅크",
        last4: "2195",
        confirmedAt: "2026-09-02T00:00:00.000Z",
        accountHolderName: "응답에 나오면 안 됨",
        accountNumber: "123456782195",
      };
    },
    async hasPendingPaybackPayout(input) {
      calls.push(["payback-eligibility", input]);
      return true;
    },
    async saveConfirmedPaybackAccount(userId, input) {
      calls.push(["payback-save", { userId, input }]);
      return {
        confirmed: true,
        bankName: input.bankName,
        last4: String(input.accountNumber).slice(-4),
        confirmedAt: "2026-09-02T01:00:00.000Z",
        accountHolderName: input.accountHolderName,
        accountNumber: input.accountNumber,
      };
    },
    async getMainFriendlyMatchData(input) {
      calls.push(["friendly-options", input]);
      return {
        query: input.nickname,
        eligible: true,
        eligibilityReason: "",
        feeDays: 1,
        activeMatch: null,
        searchResults: [{
          userId: "444444444444444444444444",
          nickname: "친구학생",
          tier: "GOLD",
          availableLearningDays: 8,
        }],
        receivedInvitations: [{
          _id: "555555555555555555555555",
          status: "PENDING",
          inviterUserId: { name: "초대한학생" },
          feeDays: 1,
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
        }],
        sentInvitations: [{
          _id: "666666666666666666666666",
          status: "PENDING",
          inviteeUserId: { name: "초대받은학생" },
          feeDays: 1,
          expiresAt: new Date("2026-09-03T00:00:00.000Z"),
        }],
      };
    },
    async createMainFriendlyInvitation(input) {
      calls.push(["friendly-create", input]);
      return {
        invitation: {
          _id: "666666666666666666666666",
          status: "PENDING",
          inviteeUserId: { name: "초대받은학생" },
          feeDays: 1,
        },
      };
    },
    async respondToMainFriendlyInvitation(input) {
      calls.push(["friendly-respond", input]);
      if (input.response === "ACCEPT") {
        return {
          match: { _id: MATCH_ID, status: "READY", integrityStatus: "PENDING" },
        };
      }
      return {
        invitation: {
          _id: input.invitationId,
          status: "DECLINED",
          inviterUserId: { name: "초대한학생" },
          feeDays: 1,
        },
      };
    },
    async cancelMainFriendlyInvitation(input) {
      calls.push(["friendly-cancel", input]);
      return {
        invitation: {
          _id: input.invitationId,
          status: "CANCELLED",
          inviteeUserId: { name: "초대받은학생" },
          feeDays: 1,
        },
      };
    },
    async getPendingArenaRevengeRight(input) {
      calls.push(["revenge-right", input]);
      return {
        id: "777777777777777777777777",
        division: "SUB",
        stakeDays: 2,
        feeDays: 1,
        expiresAt: "2026-09-03T00:00:00.000Z",
      };
    },
    async claimArenaRevengeRight(input) {
      calls.push(["revenge-claim", input]);
      return { matchId: MATCH_ID, replayed: false };
    },
    async forfeitArenaRevengeRight(input) {
      calls.push(["revenge-forfeit", input]);
      return { sourceMatchId: MATCH_ID, replayed: false };
    },
    async getSupplementalEvidenceRequest(input) {
      calls.push(["supplemental-get", input]);
      return {
        matchId: input.matchId,
        division: "MAIN",
        matchType: "NORMAL",
        role: "CHALLENGER",
        status: "REQUESTED",
        requestedAt: "2026-09-02T00:00:00.000Z",
        deadlineAt: "2026-09-03T00:00:00.000Z",
        requestMessage: "풀이 과정의 앞뒤 사진을 제출해주세요.",
        submittedAt: null,
        submittedLate: false,
        lateByMs: 0,
        fileCount: 0,
        serverNow: "2026-09-02T01:00:00.000Z",
      };
    },
    async submitSupplementalEvidence(input) {
      calls.push(["supplemental-submit", input]);
      return {
        replayed: false,
        status: "SUBMITTED",
        submittedAt: "2026-09-02T01:00:00.000Z",
        submittedLate: false,
        lateByMs: 0,
        fileCount: input.files.length,
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

  const payback = await invoke(controller.getPaybackAccount, request());
  assert.ifError(payback.error);
  assert.equal(payback.payload.schemaVersion, "GOAT_ARENA_PAYBACK_ACCOUNT_V1");
  assert.equal(payback.payload.account.last4, "2195");
  assert.equal(payback.payload.payoutEligible, true);
  assert.ok(payback.payload.bankSuggestions.includes("토스뱅크"));
  assert.equal("accountNumber" in payback.payload.account, false);
  assert.equal("accountHolderName" in payback.payload.account, false);

  const confirmedPayback = await invoke(
    controller.confirmPaybackAccount,
    request({
      body: {
        bankName: "토스뱅크",
        accountHolderName: "홍길동",
        accountNumber: "123456782195",
        accountConfirmed: true,
      },
    })
  );
  assert.ifError(confirmedPayback.error);
  assert.equal(confirmedPayback.payload.account.last4, "2195");
  assert.equal("accountNumber" in confirmedPayback.payload.account, false);
  assert.equal("accountHolderName" in confirmedPayback.payload.account, false);

  const unconfirmedPayback = await invoke(
    controller.confirmPaybackAccount,
    request({
      body: {
        bankName: "토스뱅크",
        accountHolderName: "홍길동",
        accountNumber: "123456782195",
        accountConfirmed: false,
      },
    })
  );
  assert.equal(
    unconfirmedPayback.error?.code,
    "PAYBACK_ACCOUNT_CONFIRMATION_REQUIRED"
  );

  const friendly = await invoke(
    controller.getMainFriendlyOptions,
    request({ query: { nickname: "친구" } })
  );
  assert.ifError(friendly.error);
  assert.equal(friendly.payload.schemaVersion, "GOAT_ARENA_MAIN_FRIENDLY_V1");
  assert.equal(friendly.payload.searchResults[0].nickname, "친구학생");
  assert.equal(
    friendly.payload.receivedInvitations[0].counterpartNickname,
    "초대한학생"
  );
  assert.equal(
    friendly.payload.sentInvitations[0].counterpartNickname,
    "초대받은학생"
  );

  const friendlyCreated = await invoke(
    controller.createFriendlyInvitation,
    request({ body: { inviteeUserId: "444444444444444444444444" } })
  );
  assert.ifError(friendlyCreated.error);
  assert.equal(friendlyCreated.payload.invitation.status, "PENDING");

  const friendlyAcceptRequest = request({ body: { response: "ACCEPT" } });
  friendlyAcceptRequest.params.invitationId = "555555555555555555555555";
  const friendlyAccepted = await invoke(
    controller.respondFriendlyInvitation,
    friendlyAcceptRequest
  );
  assert.ifError(friendlyAccepted.error);
  assert.equal(friendlyAccepted.payload.kind, "MATCH");
  assert.equal(friendlyAccepted.payload.match.id, MATCH_ID);

  const friendlyDeclineRequest = request({ body: { response: "DECLINE" } });
  friendlyDeclineRequest.params.invitationId = "555555555555555555555555";
  const friendlyDeclined = await invoke(
    controller.respondFriendlyInvitation,
    friendlyDeclineRequest
  );
  assert.ifError(friendlyDeclined.error);
  assert.equal(friendlyDeclined.payload.invitation.status, "DECLINED");

  const friendlyCancelRequest = request();
  friendlyCancelRequest.params.invitationId = "666666666666666666666666";
  const friendlyCancelled = await invoke(
    controller.cancelFriendlyInvitation,
    friendlyCancelRequest
  );
  assert.ifError(friendlyCancelled.error);
  assert.equal(friendlyCancelled.payload.invitation.status, "CANCELLED");

  const revenge = await invoke(controller.getRevengeRight, request());
  assert.ifError(revenge.error);
  assert.equal(revenge.payload.schemaVersion, "GOAT_ARENA_REVENGE_RIGHT_V1");
  assert.equal(revenge.payload.right.stakeDays, 2);

  const revengeClaimRequest = request();
  revengeClaimRequest.params.rightId = "777777777777777777777777";
  const revengeClaimed = await invoke(controller.claimRevengeRight, revengeClaimRequest);
  assert.ifError(revengeClaimed.error);
  assert.equal(revengeClaimed.payload.match.id, MATCH_ID);

  const revengeForfeitRequest = request();
  revengeForfeitRequest.params.rightId = "777777777777777777777777";
  const revengeForfeited = await invoke(
    controller.forfeitRevengeRight,
    revengeForfeitRequest
  );
  assert.ifError(revengeForfeited.error);
  assert.equal(revengeForfeited.payload.kind, "REVENGE_FORFEIT");

  const supplemental = await invoke(controller.getSupplementalEvidence, request());
  assert.ifError(supplemental.error);
  assert.equal(
    supplemental.payload.schemaVersion,
    "GOAT_ARENA_SUPPLEMENTAL_EVIDENCE_V1"
  );
  assert.equal(supplemental.payload.request.status, "REQUESTED");

  const supplementalRequest = request({ files: [{ path: "/tmp/supplemental.jpg" }] });
  supplementalRequest.arenaEvidenceReceivedAt = new Date("2026-09-02T01:00:00.000Z");
  const supplementalSubmitted = await invoke(
    controller.submitSupplementalEvidenceFiles,
    supplementalRequest
  );
  assert.ifError(supplementalSubmitted.error);
  assert.equal(supplementalSubmitted.payload.submission.status, "SUBMITTED");
  assert.equal(supplementalSubmitted.payload.submission.fileCount, 1);

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
    '"/goat-arena/profile/payback-account"',
    '"/goat-arena/profile/payback-account/confirm"',
    '"/goat-arena/matches/main/friendly"',
    '"/goat-arena/matches/main/friendly/invitations"',
    '"/goat-arena/matches/main/friendly/invitations/:invitationId/respond"',
    '"/goat-arena/matches/main/friendly/invitations/:invitationId/cancel"',
    '"/goat-arena/revenge-rights/pending"',
    '"/goat-arena/revenge-rights/:rightId/claim"',
    '"/goat-arena/revenge-rights/:rightId/forfeit"',
    '"/goat-arena/matches/:matchId/supplemental-evidence"',
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
