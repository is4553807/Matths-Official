const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  auditCycleBalances,
  auditInvitations,
  auditMatchTuples,
  auditOutbox,
  createIssueCollector,
} = require("../services/arenaReconciliationService");

const root = path.resolve(__dirname, "..");
const text = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const cycle = {
  _id: "cycle-1",
  userId: "user-1",
  division: "SUB",
  status: "ACTIVE",
  availableLearningDays: 27,
  paybackScoreDays: 29,
  lockedLearningDays: 1,
  reservedLearningDays: 0,
  updatedAt: new Date("2026-08-02T00:00:00Z"),
};
const ledgerSummary = {
  _id: "cycle-1",
  availableLearningDays: 27,
  paybackScoreDays: 29,
  lockedLearningDays: 1,
  reservedLearningDays: 0,
  ownerIds: ["user-1"],
  lastBalanceAfter: {
    availableLearningDays: 27,
    paybackScoreDays: 29,
    lockedLearningDays: 1,
    reservedLearningDays: 0,
  },
  lastOccurredAt: new Date("2026-08-02T00:00:00Z"),
};

const healthy = createIssueCollector();
auditCycleBalances({
  cycles: [cycle],
  ledgerSummaries: [ledgerSummary],
  userById: new Map([["user-1", { name: "테스트 사용자" }]]),
  collector: healthy,
});
assert.equal(healthy.totals.critical, 0);

const mismatch = createIssueCollector();
auditCycleBalances({
  cycles: [{ ...cycle, availableLearningDays: 26 }],
  ledgerSummaries: [ledgerSummary],
  userById: new Map(),
  collector: mismatch,
});
assert.equal(mismatch.totals.critical, 2);

const challengerBefore = {
  arenaRank: "BRONZE",
  arenaPosition: 4,
  arenaGp: 50,
};
const defenderBefore = {
  arenaRank: "SILVER",
  arenaPosition: 2,
  arenaGp: 70,
};
const settledMatch = {
  _id: "match-1",
  status: "SETTLED",
  winnerRole: "CHALLENGER",
  challenger: { userId: "user-1" },
  defender: { userId: "user-2" },
  settlementIdempotencyKey: "match-1:settled",
  settledAt: new Date(),
  resultSnapshot: { winnerRole: "CHALLENGER" },
};
const standingChanges = [
  {
    matchId: "match-1",
    userId: "user-1",
    changeType: "TUPLE_SWAP",
    tupleBefore: challengerBefore,
    tupleAfter: defenderBefore,
  },
  {
    matchId: "match-1",
    userId: "user-2",
    changeType: "TUPLE_SWAP",
    tupleBefore: defenderBefore,
    tupleAfter: challengerBefore,
  },
];
const swapCollector = createIssueCollector();
auditMatchTuples({
  matches: [settledMatch],
  standingChanges,
  participantLocks: [],
  collector: swapCollector,
});
assert.equal(swapCollector.totals.critical, 0);

const badSwapCollector = createIssueCollector();
auditMatchTuples({
  matches: [{ ...settledMatch, _id: "match-2" }],
  standingChanges: standingChanges.map((change) => ({
    ...change,
    matchId: "match-2",
    changeType: "NO_TUPLE_WRITE",
    tupleAfter: change.tupleBefore,
  })),
  participantLocks: [],
  collector: badSwapCollector,
});
assert.equal(badSwapCollector.totals.critical, 1);

const invitation = {
  _id: "invitation-1",
  initiatorUserId: "user-1",
  targetTier: "BRONZE",
  stakeDays: 2,
  reservedLearningDays: 0,
  status: "MATCHED",
  acceptedCandidateId: "user-2",
  matchedOfferId: "offer-1",
};
const invitationCollector = createIssueCollector();
auditInvitations({
  invitations: [invitation],
  offers: [
    {
      _id: "offer-1",
      invitationRequestId: "invitation-1",
      candidateUserId: "user-2",
      status: "ACCEPTED",
    },
  ],
  activeMainCycles: [],
  collector: invitationCollector,
});
assert.equal(invitationCollector.totals.critical, 0);

const duplicateInvitationCollector = createIssueCollector();
auditInvitations({
  invitations: [invitation],
  offers: [
    {
      _id: "offer-1",
      invitationRequestId: "invitation-1",
      candidateUserId: "user-2",
      status: "ACCEPTED",
    },
    {
      _id: "offer-2",
      invitationRequestId: "invitation-1",
      candidateUserId: "user-3",
      status: "ACCEPTED",
    },
  ],
  activeMainCycles: [],
  collector: duplicateInvitationCollector,
});
assert.ok(duplicateInvitationCollector.totals.critical >= 1);

const partialScopeCollector = createIssueCollector();
auditInvitations({
  invitations: [
    {
      ...invitation,
      _id: "invitation-partial",
      status: "SEARCHING",
      matchedOfferId: null,
      acceptedCandidateId: null,
      reservedLearningDays: 2,
    },
  ],
  offers: [],
  activeMainCycles: [],
  completeActiveCycleScope: false,
  completeActiveInvitationScope: false,
  collector: partialScopeCollector,
});
assert.equal(partialScopeCollector.totals.critical, 0);

const outboxCollector = createIssueCollector();
auditOutbox({
  pendingCount: 3,
  oldestPendingEvent: {
    _id: "event-1",
    createdAt: new Date("2026-08-02T00:00:00Z"),
  },
  now: new Date("2026-08-02T00:10:00Z"),
  collector: outboxCollector,
});
assert.equal(outboxCollector.totals.warning, 1);

const routes = text("routes/matths-routes.js");
const controller = text("controllers/matthsController.js");
const navigation = text("views/partials/admin-navigation.ejs");
const view = text("views/admin-arena-audit.ejs");
assert.ok(routes.includes('"/admin/arena-audit"'));
assert.ok(routes.includes('"/api/admin/arena-audit"'));
assert.ok(controller.includes("getArenaReconciliationAudit"));
assert.ok(navigation.includes("Arena 감사"));
assert.ok(view.includes("자동 수정하지 않음"));

console.log(
  "Arena 원장·상태 교환·초대 단일 수락·처리 대기 이벤트 감사 검증 완료"
);
