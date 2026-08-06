const { createHash } = require("node:crypto");
const {
  ArenaRankUpPresentation,
} = require("../models/goatArenaModel");
const {
  arenaTierByValue,
  arenaTierIndex,
} = require("./arenaTierPolicy");

function tierSlug(value) {
  return arenaTierByValue(value).code.toLowerCase();
}

function promotionPresentationId(matchId, userId) {
  const digest = createHash("sha256")
    .update(`${String(matchId)}:${String(userId)}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `rankup_${digest}`;
}

function isTierPromotion(tupleBefore, tupleAfter) {
  return arenaTierIndex(tupleAfter?.arenaRank) >
    arenaTierIndex(tupleBefore?.arenaRank);
}

async function createRankUpPresentation({
  matchId,
  userId,
  tupleBefore,
  tupleAfter,
  occurredAt = new Date(),
  session = null,
}) {
  if (!isTierPromotion(tupleBefore, tupleAfter)) {
    return null;
  }

  const presentationId = promotionPresentationId(matchId, userId);
  const query = ArenaRankUpPresentation.findOneAndUpdate(
    { matchId, userId },
    {
      $setOnInsert: {
        presentationId,
        matchId,
        userId,
        fromTier: tierSlug(tupleBefore?.arenaRank),
        toTier: tierSlug(tupleAfter?.arenaRank),
        status: "PENDING",
        occurredAt,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );
  if (session) query.session(session);
  return query;
}

async function createRankUpPresentationsForSettlement({
  matchId,
  challengerUserId,
  defenderUserId,
  challengerTupleBefore,
  challengerTupleAfter,
  defenderTupleBefore,
  defenderTupleAfter,
  occurredAt,
  session,
}) {
  // MongoDB 트랜잭션의 같은 session에서는 병렬 쿼리를 실행하지 않습니다.
  // 두 참가자 중 실제로 승급한 사용자만 순서대로 1회성 이벤트를 만듭니다.
  const presentations = [];
  for (const participant of [
    {
      userId: challengerUserId,
      tupleBefore: challengerTupleBefore,
      tupleAfter: challengerTupleAfter,
    },
    {
      userId: defenderUserId,
      tupleBefore: defenderTupleBefore,
      tupleAfter: defenderTupleAfter,
    },
  ]) {
    const presentation = await createRankUpPresentation({
      matchId,
      userId: participant.userId,
      tupleBefore: participant.tupleBefore,
      tupleAfter: participant.tupleAfter,
      occurredAt,
      session,
    });
    if (presentation) presentations.push(presentation);
  }
  return presentations;
}

async function getPendingRankUpPresentation({ matchId, userId }) {
  const filter = {
    userId,
    status: "PENDING",
  };
  if (matchId) filter.matchId = matchId;

  const presentation = await ArenaRankUpPresentation.findOne(filter)
    .select("presentationId fromTier toTier")
    .sort({ occurredAt: 1, _id: 1 })
    .lean();

  return presentation
    ? {
        id: presentation.presentationId,
        fromTier: presentation.fromTier,
        toTier: presentation.toTier,
      }
    : null;
}

async function acknowledgeRankUpPresentation({
  presentationId,
  userId,
  now = new Date(),
}) {
  const cleanId = String(presentationId || "").trim();
  if (!cleanId || cleanId.length > 240) {
    const error = new Error("승급 연출 식별자를 확인해주세요.");
    error.status = 400;
    error.code = "INVALID_RANK_UP_PRESENTATION_ID";
    throw error;
  }

  const presentation = await ArenaRankUpPresentation.findOneAndUpdate(
    {
      presentationId: cleanId,
      userId,
      status: "PENDING",
    },
    {
      $set: {
        status: "DISPLAYED",
        displayedAt: now,
      },
    },
    { returnDocument: "after" }
  ).lean();

  if (presentation) {
    return { acknowledged: true, alreadyAcknowledged: false };
  }

  const existing = await ArenaRankUpPresentation.findOne({
    presentationId: cleanId,
    userId,
  })
    .select("status")
    .lean();
  if (existing?.status === "DISPLAYED") {
    return { acknowledged: true, alreadyAcknowledged: true };
  }

  const error = new Error("확인할 승급 연출을 찾을 수 없습니다.");
  error.status = 404;
  error.code = "RANK_UP_PRESENTATION_NOT_FOUND";
  throw error;
}

module.exports = {
  acknowledgeRankUpPresentation,
  createRankUpPresentation,
  createRankUpPresentationsForSettlement,
  getPendingRankUpPresentation,
  isTierPromotion,
  promotionPresentationId,
  tierSlug,
};
