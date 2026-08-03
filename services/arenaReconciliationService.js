const {
  AccessCycle,
  ArenaLearningDayLedger,
  ArenaMatch,
  ArenaMatchParticipantLock,
  ArenaOutboxEvent,
  ArenaStandingChangeLedger,
  MainShopEffect,
  MainShopPurchase,
  MainInvitationOffer,
  MainInvitationRequest,
} = require("../models/goatArenaModel");
const { User } = require("../models/matthsModel");

const ACTIVE_INVITATION_STATUSES = new Set([
  "SEARCHING",
  "OFFERED",
  "PAUSED",
  "MATCH_FORMING",
]);
const UNRESOLVED_MATCH_STATUSES = new Set([
  "REQUESTED",
  "MATCHED",
  "READY",
  "IN_PROGRESS",
  "SUBMITTED",
  "RESOLVED",
  "HELD",
]);
const TERMINAL_MATCH_STATUSES = new Set([
  "SETTLED",
  "CANCELLED",
  "INVALID",
  "INSURED_CANCELLED",
]);
const BALANCE_KEYS = [
  "availableLearningDays",
  "paybackScoreDays",
  "lockedPaybackScoreDays",
  "lockedLearningDays",
  "reservedLearningDays",
];
const DEFAULT_SCAN_LIMIT = 5000;
const DEFAULT_ISSUE_LIMIT = 300;
const OUTBOX_PENDING_GRACE_MS = 5 * 60 * 1000;
const SHOP_PENDING_GRACE_MS = 15 * 60 * 1000;

function identifier(value) {
  if (value === null || value === undefined) return "";
  return String(value?._id || value);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function balanceTuple(source = {}) {
  return Object.fromEntries(
    BALANCE_KEYS.map((key) => [key, numeric(source?.[key])])
  );
}

function balancesEqual(left, right) {
  return BALANCE_KEYS.every(
    (key) => numeric(left?.[key]) === numeric(right?.[key])
  );
}

function balanceDescription(balance) {
  const normalized = balanceTuple(balance);
  return [
    `사용 가능 ${normalized.availableLearningDays}일`,
    `페이백 점수 ${normalized.paybackScoreDays}점`,
    `경기 예치 페이백 점수 ${normalized.lockedPaybackScoreDays}점`,
    `경기 예치 ${normalized.lockedLearningDays}일`,
    `초대 예약 ${normalized.reservedLearningDays}일`,
  ].join(" · ");
}

function arenaTuple(source = {}) {
  return {
    arenaRank: String(source?.arenaRank || ""),
    arenaPosition: numeric(source?.arenaPosition),
    arenaGp: numeric(source?.arenaGp),
  };
}

function arenaTuplesEqual(left, right) {
  const a = arenaTuple(left);
  const b = arenaTuple(right);
  return (
    a.arenaRank === b.arenaRank &&
    a.arenaPosition === b.arenaPosition &&
    a.arenaGp === b.arenaGp
  );
}

function createIssueCollector(limit = DEFAULT_ISSUE_LIMIT) {
  const issues = [];
  const totals = {
    critical: 0,
    warning: 0,
    byCategory: {},
  };
  function add(issue) {
    const severity = issue.severity === "critical" ? "critical" : "warning";
    totals[severity] += 1;
    totals.byCategory[issue.category] =
      numeric(totals.byCategory[issue.category]) + 1;
    if (issues.length < limit) {
      issues.push({ ...issue, severity });
    }
  }
  return { add, issues, totals, limit };
}

function userLabel(userById, userId) {
  const user = userById.get(identifier(userId));
  return user?.realName || user?.name || user?.email || "사용자";
}

function auditCycleBalances({ cycles, ledgerSummaries, userById, collector }) {
  const summaryByCycle = new Map(
    ledgerSummaries.map((summary) => [identifier(summary._id), summary])
  );
  for (const cycle of cycles) {
    const cycleId = identifier(cycle._id);
    const summary = summaryByCycle.get(cycleId);
    const label = userLabel(userById, cycle.userId);
    if (!summary) {
      collector.add({
        severity: "critical",
        category: "BALANCE",
        title: "학습일수 원장이 없는 이용 주기",
        detail: `${label} 사용자의 ${cycle.division} Division 이용 주기에 원장 기록이 없습니다.`,
        entityType: "AccessCycle",
        entityId: cycleId,
        observedAt: cycle.updatedAt || cycle.createdAt,
      });
      continue;
    }

    const cycleBalance = balanceTuple(cycle);
    const deltaBalance = {
      availableLearningDays: summary.availableLearningDays,
      paybackScoreDays: summary.paybackScoreDays,
      lockedLearningDays: summary.lockedLearningDays,
      reservedLearningDays: summary.reservedLearningDays,
    };
    if (!balancesEqual(cycleBalance, deltaBalance)) {
      collector.add({
        severity: "critical",
        category: "BALANCE",
        title: "원장 누계와 실제 잔액 불일치",
        detail: `${label} · 실제 잔액: ${balanceDescription(cycleBalance)} · 원장 누계: ${balanceDescription(deltaBalance)}`,
        entityType: "AccessCycle",
        entityId: cycleId,
        observedAt: summary.lastOccurredAt,
      });
    }
    if (!balancesEqual(cycleBalance, summary.lastBalanceAfter || {})) {
      collector.add({
        severity: "critical",
        category: "BALANCE",
        title: "마지막 원장 잔액과 실제 잔액 불일치",
        detail: `${label} 사용자의 마지막 원장 사본이 현재 이용 주기 잔액과 다릅니다.`,
        entityType: "AccessCycle",
        entityId: cycleId,
        observedAt: summary.lastOccurredAt,
      });
    }
    if (
      (summary.ownerIds || []).some(
        (ownerId) => identifier(ownerId) !== identifier(cycle.userId)
      )
    ) {
      collector.add({
        severity: "critical",
        category: "BALANCE",
        title: "다른 사용자의 원장이 이용 주기에 연결됨",
        detail: `${label} 사용자의 이용 주기에 소유자가 다른 원장 기록이 포함되어 있습니다.`,
        entityType: "AccessCycle",
        entityId: cycleId,
        observedAt: summary.lastOccurredAt,
      });
    }

    if (cycle.division === "MAIN" && Array.isArray(cycle.learningDayBuckets)) {
      const bucketBalance = cycle.learningDayBuckets.reduce(
        (total, bucket) => ({
          availableLearningDays:
            total.availableLearningDays + numeric(bucket.availableDays),
          paybackScoreDays: cycleBalance.paybackScoreDays,
          lockedLearningDays:
            total.lockedLearningDays + numeric(bucket.lockedDays),
          reservedLearningDays:
            total.reservedLearningDays + numeric(bucket.reservedDays),
        }),
        balanceTuple({ paybackScoreDays: cycleBalance.paybackScoreDays })
      );
      if (!balancesEqual(cycleBalance, bucketBalance)) {
        collector.add({
          severity: "critical",
          category: "BALANCE",
          title: "Main 학습일수 출처 합계 불일치",
          detail: `${label} 사용자의 출처별 학습일수 합계가 이용 주기 잔액과 다릅니다.`,
          entityType: "AccessCycle",
          entityId: cycleId,
          observedAt: cycle.updatedAt,
        });
      }
    }
  }
}

function auditMatchTuples({ matches, standingChanges, participantLocks, collector }) {
  const changesByMatch = new Map();
  for (const change of standingChanges) {
    const matchId = identifier(change.matchId);
    if (!changesByMatch.has(matchId)) changesByMatch.set(matchId, []);
    changesByMatch.get(matchId).push(change);
  }
  const locksByMatch = new Map();
  for (const lock of participantLocks) {
    const matchId = identifier(lock.matchId);
    if (!locksByMatch.has(matchId)) locksByMatch.set(matchId, []);
    locksByMatch.get(matchId).push(lock);
  }

  for (const match of matches) {
    const matchId = identifier(match._id);
    const changes = changesByMatch.get(matchId) || [];
    const locks = locksByMatch.get(matchId) || [];
    const participantIds = new Set([
      identifier(match.challenger?.userId),
      identifier(match.defender?.userId),
    ]);

    if (UNRESOLVED_MATCH_STATUSES.has(match.status)) {
      if (
        locks.length !== 2 ||
        locks.some((lock) => !participantIds.has(identifier(lock.userId)))
      ) {
        collector.add({
          severity: "critical",
          category: "MATCH",
          title: "미정산 경기의 참가 잠금 불일치",
          detail: `미정산 경기에는 두 참가자의 잠금이 필요하지만 현재 ${locks.length}개입니다.`,
          entityType: "ArenaMatch",
          entityId: matchId,
          href: `/admin/arena-matches#match-${matchId}`,
          observedAt: match.updatedAt,
        });
      }
      continue;
    }

    if (TERMINAL_MATCH_STATUSES.has(match.status) && locks.length > 0) {
      collector.add({
        severity: "critical",
        category: "MATCH",
        title: "종료된 경기에 참가 잠금이 남아 있음",
        detail: `종료 상태인 경기에 ${locks.length}개의 참가 잠금이 남아 있습니다.`,
        entityType: "ArenaMatch",
        entityId: matchId,
        href: `/admin/arena-matches#match-${matchId}`,
        observedAt: match.updatedAt,
      });
    }

    if (match.status === "INSURED_CANCELLED") {
      if (changes.length > 0) {
        collector.add({
          severity: "critical",
          category: "STANDING",
          title: "방어 일정 보호 경기에서 Arena 상태가 기록됨",
          detail: "승패 없이 취소된 경기는 티어·순위·GP를 변경하면 안 됩니다.",
          entityType: "ArenaMatch",
          entityId: matchId,
          href: `/admin/arena-matches#match-${matchId}`,
          observedAt: match.updatedAt,
        });
      }
      continue;
    }

    if (match.status !== "SETTLED") continue;
    if (!match.settlementIdempotencyKey || !match.settledAt || !match.resultSnapshot) {
      collector.add({
        severity: "critical",
        category: "MATCH",
        title: "정산 완료 경기의 결과 사본 누락",
        detail: "정산 키·정산 시각·결과 사본 중 하나 이상이 없습니다.",
        entityType: "ArenaMatch",
        entityId: matchId,
        href: `/admin/arena-matches#match-${matchId}`,
        observedAt: match.updatedAt,
      });
    }
    if (changes.length !== 2) {
      collector.add({
        severity: "critical",
        category: "STANDING",
        title: "정산 경기의 Arena 상태 기록 수 불일치",
        detail: `정산 경기에는 참가자별 기록 2개가 필요하지만 현재 ${changes.length}개입니다.`,
        entityType: "ArenaMatch",
        entityId: matchId,
        href: `/admin/arena-matches#match-${matchId}`,
        observedAt: match.settledAt,
      });
      continue;
    }

    const challengerChange = changes.find(
      (change) => identifier(change.userId) === identifier(match.challenger?.userId)
    );
    const defenderChange = changes.find(
      (change) => identifier(change.userId) === identifier(match.defender?.userId)
    );
    if (!challengerChange || !defenderChange) {
      collector.add({
        severity: "critical",
        category: "STANDING",
        title: "Arena 상태 기록의 참가자 불일치",
        detail: "경기 참가자와 Arena 상태 변경 원장의 사용자가 일치하지 않습니다.",
        entityType: "ArenaMatch",
        entityId: matchId,
        href: `/admin/arena-matches#match-${matchId}`,
        observedAt: match.settledAt,
      });
      continue;
    }

    const shouldSwap = match.winnerRole === "CHALLENGER";
    const valid = shouldSwap
      ? challengerChange.changeType === "TUPLE_SWAP" &&
        defenderChange.changeType === "TUPLE_SWAP" &&
        arenaTuplesEqual(challengerChange.tupleAfter, defenderChange.tupleBefore) &&
        arenaTuplesEqual(defenderChange.tupleAfter, challengerChange.tupleBefore)
      : match.winnerRole === "DEFENDER" &&
        challengerChange.changeType === "NO_TUPLE_WRITE" &&
        defenderChange.changeType === "NO_TUPLE_WRITE" &&
        arenaTuplesEqual(challengerChange.tupleBefore, challengerChange.tupleAfter) &&
        arenaTuplesEqual(defenderChange.tupleBefore, defenderChange.tupleAfter);
    if (!valid) {
      collector.add({
        severity: "critical",
        category: "STANDING",
        title: "경기 결과와 Arena 상태 교환 불일치",
        detail: "도전자 승리는 양측 상태 전체 교환, 방어자 승리는 상태 유지여야 합니다.",
        entityType: "ArenaMatch",
        entityId: matchId,
        href: `/admin/arena-matches#match-${matchId}`,
        observedAt: match.settledAt,
      });
    }
  }
}

function auditInvitations({
  invitations,
  offers,
  activeMainCycles,
  completeActiveCycleScope = true,
  completeActiveInvitationScope = true,
  collector,
}) {
  const offersByInvitation = new Map();
  for (const offer of offers) {
    const invitationId = identifier(offer.invitationRequestId);
    if (!offersByInvitation.has(invitationId)) {
      offersByInvitation.set(invitationId, []);
    }
    offersByInvitation.get(invitationId).push(offer);
  }
  const activeCycleByUser = new Map(
    activeMainCycles.map((cycle) => [identifier(cycle.userId), cycle])
  );
  const reservationTotalByUser = new Map();
  const activeReservationKeys = new Map();

  for (const invitation of invitations) {
    const invitationId = identifier(invitation._id);
    const invitationOffers = offersByInvitation.get(invitationId) || [];
    const accepted = invitationOffers.filter((offer) => offer.status === "ACCEPTED");
    const isActive = ACTIVE_INVITATION_STATUSES.has(invitation.status);
    const expectedReservation = isActive ? numeric(invitation.stakeDays) : 0;
    if (numeric(invitation.reservedLearningDays) !== expectedReservation) {
      collector.add({
        severity: "critical",
        category: "INVITATION",
        title: "초대 예약 학습일수 불일치",
        detail: `초대 상태와 예약 학습일수가 맞지 않습니다. 현재 예약 ${numeric(invitation.reservedLearningDays)}일, 예상 ${expectedReservation}일입니다.`,
        entityType: "MainInvitationRequest",
        entityId: invitationId,
        observedAt: invitation.updatedAt,
      });
    }
    if (accepted.length > 1) {
      collector.add({
        severity: "critical",
        category: "INVITATION",
        title: "한 초대에 복수 수락자 발생",
        detail: `한 초대에 수락 완료 제안이 ${accepted.length}개 있습니다.`,
        entityType: "MainInvitationRequest",
        entityId: invitationId,
        observedAt: invitation.updatedAt,
      });
    }
    if (invitation.status === "MATCHED") {
      const acceptedOffer = accepted[0];
      if (
        accepted.length !== 1 ||
        identifier(invitation.matchedOfferId) !== identifier(acceptedOffer?._id) ||
        identifier(invitation.acceptedCandidateId) !==
          identifier(acceptedOffer?.candidateUserId)
      ) {
        collector.add({
          severity: "critical",
          category: "INVITATION",
          title: "성립된 초대의 수락자 연결 불일치",
          detail: "성립된 경기의 수락 제안·수락 사용자 연결을 확인해주세요.",
          entityType: "MainInvitationRequest",
          entityId: invitationId,
          observedAt: invitation.matchedAt || invitation.updatedAt,
        });
      }
    } else if (accepted.length > 0) {
      collector.add({
        severity: "critical",
        category: "INVITATION",
        title: "미성립 초대에 수락 완료 제안이 남아 있음",
        detail: "경기가 성립되지 않은 초대에 수락 완료 상태가 남아 있습니다.",
        entityType: "MainInvitationRequest",
        entityId: invitationId,
        observedAt: invitation.updatedAt,
      });
    }

    if (isActive) {
      const userId = identifier(invitation.initiatorUserId);
      reservationTotalByUser.set(
        userId,
        numeric(reservationTotalByUser.get(userId)) + expectedReservation
      );
      const reservationKey = `${userId}:${String(invitation.targetTier || "").toUpperCase()}`;
      const duplicates = numeric(activeReservationKeys.get(reservationKey)) + 1;
      activeReservationKeys.set(reservationKey, duplicates);
      if (duplicates > 1) {
        collector.add({
          severity: "critical",
          category: "INVITATION",
          title: "같은 목표 티어에 활성 초대가 중복됨",
          detail: "사용자당 목표 티어 하나에 활성 초대 예약은 한 개만 허용됩니다.",
          entityType: "MainInvitationRequest",
          entityId: invitationId,
          observedAt: invitation.updatedAt,
        });
      }
      if (completeActiveCycleScope && !activeCycleByUser.has(userId)) {
        collector.add({
          severity: "critical",
          category: "INVITATION",
          title: "활성 Main 이용 주기 없는 초대 예약",
          detail: "초대자에게 활성 Main Division 이용 주기가 없습니다.",
          entityType: "MainInvitationRequest",
          entityId: invitationId,
          observedAt: invitation.updatedAt,
        });
      }
    }
  }

  if (completeActiveCycleScope && completeActiveInvitationScope) {
    for (const [userId, cycle] of activeCycleByUser) {
      const expectedReserved = numeric(reservationTotalByUser.get(userId));
      if (numeric(cycle.reservedLearningDays) !== expectedReserved) {
        collector.add({
          severity: "critical",
          category: "INVITATION",
          title: "초대 예약 합계와 이용 주기 예약 잔액 불일치",
          detail: `이용 주기 예약 ${numeric(cycle.reservedLearningDays)}일, 활성 초대 합계 ${expectedReserved}일입니다.`,
          entityType: "AccessCycle",
          entityId: identifier(cycle._id),
          observedAt: cycle.updatedAt,
        });
      }
    }
  }
}

function auditOutbox({ pendingCount, oldestPendingEvent, now, collector }) {
  if (!pendingCount || !oldestPendingEvent) return;
  const ageMs =
    new Date(now).getTime() -
    new Date(oldestPendingEvent.createdAt || now).getTime();
  if (ageMs < OUTBOX_PENDING_GRACE_MS) return;
  collector.add({
    severity: "warning",
    category: "OUTBOX",
    title: "처리 대기 이벤트가 남아 있음",
    detail: `${pendingCount}개의 이벤트가 아직 처리 완료되지 않았습니다. 가장 오래된 이벤트의 대기 시간은 약 ${Math.max(1, Math.floor(ageMs / 60000))}분입니다.`,
    entityType: "ArenaOutboxEvent",
    entityId: identifier(oldestPendingEvent._id),
    observedAt: oldestPendingEvent.createdAt,
  });
}

function auditShopTransactions({ purchases, effects, ledgers, now, collector }) {
  const effectsByPurchase = new Map();
  const purchaseById = new Map(
    purchases.map((purchase) => [identifier(purchase._id), purchase])
  );
  const ledgersByPurchase = new Map();
  const activeProtectionByMatch = new Map();
  const purchaseKeyCount = new Map();

  for (const effect of effects) {
    const purchaseId = identifier(effect.purchaseId);
    if (!effectsByPurchase.has(purchaseId)) effectsByPurchase.set(purchaseId, []);
    effectsByPurchase.get(purchaseId).push(effect);
    const purchase = purchaseById.get(purchaseId);
    if (!purchase) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "구매 기록 없는 상점 효과",
        detail: "효과가 참조하는 구매 기록을 찾을 수 없습니다.",
        entityType: "MainShopEffect",
        entityId: identifier(effect._id),
        observedAt: effect.updatedAt || effect.createdAt,
      });
      continue;
    }
    if (
      identifier(effect.userId) !== identifier(purchase.userId) ||
      String(effect.itemCode) !== String(purchase.itemCode)
    ) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "상점 구매와 효과 소유자 불일치",
        detail: "구매자 또는 상품 코드가 효과 기록과 일치하지 않습니다.",
        entityType: "MainShopEffect",
        entityId: identifier(effect._id),
        observedAt: effect.updatedAt || effect.createdAt,
      });
    }
    if (
      effect.itemCode === "DEFENSE_SCHEDULE_PROTECTION" &&
      ["ACTIVE", "APPLIED"].includes(effect.status) &&
      effect.relatedMatchId
    ) {
      const matchId = identifier(effect.relatedMatchId);
      const rows = activeProtectionByMatch.get(matchId) || [];
      rows.push(effect);
      activeProtectionByMatch.set(matchId, rows);
    }
  }
  for (const ledger of ledgers) {
    const purchaseId = identifier(ledger.sourceId);
    if (!ledgersByPurchase.has(purchaseId)) ledgersByPurchase.set(purchaseId, []);
    ledgersByPurchase.get(purchaseId).push(ledger);
  }
  for (const purchase of purchases) {
    const purchaseId = identifier(purchase._id);
    const purchaseEffects = effectsByPurchase.get(purchaseId) || [];
    const purchaseLedgers = ledgersByPurchase.get(purchaseId) || [];
    const key = String(purchase.purchaseKey || "");
    purchaseKeyCount.set(key, numeric(purchaseKeyCount.get(key)) + 1);
    if (purchaseEffects.length !== 1) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "상점 구매와 효과 기록 수 불일치",
        detail: `구매 한 건에는 효과 한 건이 필요하지만 현재 ${purchaseEffects.length}건입니다.`,
        entityType: "MainShopPurchase",
        entityId: purchaseId,
        observedAt: purchase.updatedAt || purchase.purchasedAt,
      });
    }
    if (
      purchase.status === "PENDING" &&
      new Date(now).getTime() - new Date(purchase.purchasedAt || purchase.createdAt).getTime() >=
        SHOP_PENDING_GRACE_MS
    ) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "상점 구매가 처리 대기 상태에 멈춤",
        detail: "트랜잭션 완료 또는 자동 롤백되지 않은 구매입니다.",
        entityType: "MainShopPurchase",
        entityId: purchaseId,
        observedAt: purchase.updatedAt || purchase.purchasedAt,
      });
    }
    if (purchase.status === "COMPLETED") {
      const expectedBurn = purchase.itemCode === "DEFENSE_SCHEDULE_PROTECTION"
        ? "DEFENSE_SCHEDULE_PROTECTION_BURN"
        : "SHOP_ITEM_PURCHASE_BURN";
      if (!purchaseLedgers.some((ledger) => ledger.eventType === expectedBurn)) {
        collector.add({
          severity: "critical",
          category: "SHOP",
          title: "상점 구매 차감 원장 누락",
          detail: "구매 완료 상태이지만 해당 학습일수 차감 원장을 찾을 수 없습니다.",
          entityType: "MainShopPurchase",
          entityId: purchaseId,
          observedAt: purchase.updatedAt || purchase.purchasedAt,
        });
      }
      if (purchaseEffects.some((effect) => effect.status === "FAILED")) {
        collector.add({
          severity: "critical",
          category: "SHOP",
          title: "결제 완료 뒤 상점 효과 실패",
          detail: "구매 차감은 완료됐지만 효과 적용이 실패했습니다. 자동 환불 또는 운영자 검토가 필요합니다.",
          entityType: "MainShopPurchase",
          entityId: purchaseId,
          observedAt: purchase.updatedAt || purchase.purchasedAt,
        });
      }
    }
    if (
      purchase.status === "REVERSED" &&
      !purchaseLedgers.some((ledger) => ledger.eventType === "SHOP_ITEM_PURCHASE_REVERSAL")
    ) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "상점 환불 원장 누락",
        detail: "구매는 반환 처리됐지만 학습일수 반환 원장이 없습니다.",
        entityType: "MainShopPurchase",
        entityId: purchaseId,
        observedAt: purchase.reversedAt || purchase.updatedAt,
      });
    }
  }
  for (const [purchaseKey, count] of purchaseKeyCount) {
    if (purchaseKey && count > 1) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "동일 요청의 상점 구매 중복",
        detail: `같은 구매 요청 키로 ${count}건이 저장되었습니다.`,
        entityType: "MainShopPurchase",
        entityId: purchaseKey,
        observedAt: now,
      });
    }
  }
  for (const [matchId, protectionEffects] of activeProtectionByMatch) {
    if (protectionEffects.length > 1) {
      collector.add({
        severity: "critical",
        category: "SHOP",
        title: "한 경기에 방어 일정 보호권이 중복 적용됨",
        detail: `같은 경기에 활성 보호 효과가 ${protectionEffects.length}건 있습니다.`,
        entityType: "ArenaMatch",
        entityId: matchId,
        observedAt: protectionEffects[0].updatedAt || protectionEffects[0].createdAt,
      });
    }
  }
}

function issueCategoryLabel(category) {
  return {
    BALANCE: "학습일수",
    MATCH: "경기 상태",
    STANDING: "Arena 상태",
    INVITATION: "초대",
    OUTBOX: "처리 대기 이벤트",
    SHOP: "Main 상점",
    SCOPE: "검사 범위",
  }[category] || "기타";
}

async function getArenaReconciliationAudit({
  now = new Date(),
  scanLimit = DEFAULT_SCAN_LIMIT,
  issueLimit = DEFAULT_ISSUE_LIMIT,
} = {}) {
  const unresolvedStatuses = [...UNRESOLVED_MATCH_STATUSES];
  const activeInvitationStatuses = [...ACTIVE_INVITATION_STATUSES];
  const [
    activeCycles,
    recentInactiveCycles,
    unresolvedMatches,
    recentTerminalMatches,
    activeInvitations,
    recentTerminalInvitations,
    pendingOutboxCount,
    oldestPendingEvent,
    activeCycleCount,
    activeInvitationCount,
    totalCycleCount,
    totalMatchCount,
    totalInvitationCount,
    totalShopPurchaseCount,
    totalShopEffectCount,
  ] = await Promise.all([
    AccessCycle.find({ status: "ACTIVE" })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    AccessCycle.find({ status: { $ne: "ACTIVE" } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    ArenaMatch.find({ status: { $in: unresolvedStatuses } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    ArenaMatch.find({ status: { $in: [...TERMINAL_MATCH_STATUSES] } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    MainInvitationRequest.find({ status: { $in: activeInvitationStatuses } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    MainInvitationRequest.find({ status: { $nin: activeInvitationStatuses } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(scanLimit)
      .lean(),
    ArenaOutboxEvent.countDocuments({ publishedAt: null }),
    ArenaOutboxEvent.findOne({ publishedAt: null })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    AccessCycle.countDocuments({ status: "ACTIVE" }),
    MainInvitationRequest.countDocuments({
      status: { $in: activeInvitationStatuses },
    }),
    AccessCycle.countDocuments(),
    ArenaMatch.countDocuments(),
    MainInvitationRequest.countDocuments(),
    MainShopPurchase.countDocuments(),
    MainShopEffect.countDocuments(),
  ]);

  const uniqueById = (documents) => [
    ...new Map(documents.map((document) => [identifier(document._id), document])).values(),
  ];
  const cycles = uniqueById([...activeCycles, ...recentInactiveCycles]);
  const matches = uniqueById([...unresolvedMatches, ...recentTerminalMatches]);
  const invitations = uniqueById([
    ...activeInvitations,
    ...recentTerminalInvitations,
  ]);
  const cycleIds = cycles.map((cycle) => cycle._id);
  const matchIds = matches.map((match) => match._id);
  const invitationIds = invitations.map((invitation) => invitation._id);
  const shopPurchases = await MainShopPurchase.find({})
    .sort({ purchasedAt: -1, _id: -1 })
    .limit(scanLimit)
    .lean();
  const shopPurchaseIds = shopPurchases.map((purchase) => purchase._id);
  const userIds = [...new Set(cycles.map((cycle) => identifier(cycle.userId)))];

  const [ledgerSummaries, standingChanges, offers, participantLocks, users, shopEffects, shopLedgers] =
    await Promise.all([
      cycleIds.length
        ? ArenaLearningDayLedger.aggregate([
            { $match: { accessCycleId: { $in: cycleIds } } },
            { $sort: { occurredAt: 1, _id: 1 } },
            {
              $group: {
                _id: "$accessCycleId",
                entryCount: { $sum: 1 },
                availableLearningDays: { $sum: "$availableLearningDaysDelta" },
                paybackScoreDays: { $sum: "$paybackScoreDaysDelta" },
                lockedPaybackScoreDays: { $sum: "$lockedPaybackScoreDaysDelta" },
                lockedLearningDays: { $sum: "$lockedLearningDaysDelta" },
                reservedLearningDays: { $sum: "$reservedLearningDaysDelta" },
                ownerIds: { $addToSet: "$userId" },
                lastBalanceAfter: { $last: "$balanceAfter" },
                lastOccurredAt: { $last: "$occurredAt" },
              },
            },
          ])
        : [],
      matchIds.length
        ? ArenaStandingChangeLedger.find({ matchId: { $in: matchIds } }).lean()
        : [],
      invitationIds.length
        ? MainInvitationOffer.find({
            invitationRequestId: { $in: invitationIds },
          }).lean()
        : [],
      matchIds.length
        ? ArenaMatchParticipantLock.find({ matchId: { $in: matchIds } }).lean()
        : [],
      userIds.length
        ? User.find({ _id: { $in: userIds } })
            .select("name realName email")
            .lean()
        : [],
      MainShopEffect.find({})
        .sort({ updatedAt: -1, _id: -1 })
        .limit(scanLimit)
        .lean(),
      shopPurchaseIds.length
        ? ArenaLearningDayLedger.find({
            sourceType: "MainShopPurchase",
            sourceId: { $in: shopPurchaseIds },
          }).lean()
        : [],
    ]);

  const collector = createIssueCollector(issueLimit);
  const userById = new Map(users.map((user) => [identifier(user._id), user]));
  auditCycleBalances({ cycles, ledgerSummaries, userById, collector });
  auditMatchTuples({
    matches,
    standingChanges,
    participantLocks,
    collector,
  });
  auditInvitations({
    invitations,
    offers,
    activeMainCycles: activeCycles.filter((cycle) => cycle.division === "MAIN"),
    completeActiveCycleScope: activeCycles.length === activeCycleCount,
    completeActiveInvitationScope:
      activeInvitations.length === activeInvitationCount,
    collector,
  });
  auditOutbox({
    pendingCount: pendingOutboxCount,
    oldestPendingEvent,
    now,
    collector,
  });
  auditShopTransactions({
    purchases: shopPurchases,
    effects: shopEffects,
    ledgers: shopLedgers,
    now,
    collector,
  });

  const scopeTruncated =
    totalCycleCount > cycles.length ||
    totalMatchCount > matches.length ||
    totalInvitationCount > invitations.length;
  const shopScopeTruncated =
    totalShopPurchaseCount > shopPurchases.length ||
    totalShopEffectCount > shopEffects.length;
  const anyScopeTruncated = scopeTruncated || shopScopeTruncated;
  if (anyScopeTruncated) {
    collector.add({
      severity: "warning",
      category: "SCOPE",
      title: "최근 데이터 중심으로 검사함",
      detail: `화면 응답 시간을 위해 상태별 최대 ${scanLimit.toLocaleString("ko-KR")}건을 검사했습니다. 전체 배치 감사는 별도 운영 작업에서 실행해야 합니다.`,
      entityType: "AuditScope",
      entityId: "",
      observedAt: now,
    });
  }

  const displayedIssues = collector.issues.map((issue) => ({
    ...issue,
    categoryLabel: issueCategoryLabel(issue.category),
  }));
  const issueTotal = collector.totals.critical + collector.totals.warning;
  return {
    generatedAt: now,
    health:
      collector.totals.critical > 0
        ? "ACTION_REQUIRED"
        : collector.totals.warning > 0
          ? "REVIEW_RECOMMENDED"
          : "HEALTHY",
    summary: {
      criticalCount: collector.totals.critical,
      warningCount: collector.totals.warning,
      issueCount: issueTotal,
      displayedIssueCount: displayedIssues.length,
      pendingOutboxCount,
      checkedCycles: cycles.length,
      checkedMatches: matches.length,
      checkedInvitations: invitations.length,
      checkedLocks: participantLocks.length,
      checkedShopPurchases: shopPurchases.length,
      checkedShopEffects: shopEffects.length,
      byCategory: collector.totals.byCategory,
    },
    scope: {
      scanLimit,
      issueLimit,
      truncated: anyScopeTruncated,
      totalCycleCount,
      totalMatchCount,
      totalInvitationCount,
      totalShopPurchaseCount,
      totalShopEffectCount,
    },
    issues: displayedIssues,
  };
}

module.exports = {
  ACTIVE_INVITATION_STATUSES,
  BALANCE_KEYS,
  OUTBOX_PENDING_GRACE_MS,
  TERMINAL_MATCH_STATUSES,
  UNRESOLVED_MATCH_STATUSES,
  arenaTuplesEqual,
  auditCycleBalances,
  auditInvitations,
  auditMatchTuples,
  auditOutbox,
  auditShopTransactions,
  balanceDescription,
  balanceTuple,
  balancesEqual,
  createIssueCollector,
  getArenaReconciliationAudit,
};
