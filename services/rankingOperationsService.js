const { AdminActionLog, User } = require("../models/matthsModel");
const {
  ArenaMatch,
  ArenaOutboxEvent,
  ArenaStandingChangeLedger,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const { calculateFinalRankingRows, recalculateFinalRanking } = require("./finalRankingService");
const { getFileStorageStatus } = require("./fileStorageService");

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function getRankingHealth({ now = new Date() } = {}) {
  const currentTime = new Date(now);
  const profiles = await LiveFinalRankingProfile.find({
    status: { $in: ["ACTIVE", "SUNDAY_DISPLAY_FROZEN"] },
  })
    .sort({ finalRank: 1 })
    .lean();
  const rankCounts = new Map();
  profiles.forEach((profile) => {
    const rank = Number(profile.finalRank);
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  });
  const duplicateRanks = [...rankCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([rank, count]) => ({ rank, count }));
  const missingRanks = [];
  for (let rank = 1; rank <= profiles.length; rank += 1) {
    if (!rankCounts.has(rank)) missingRanks.push(rank);
  }
  const latestCalculationAt = profiles.reduce((latest, profile) => {
    const time = new Date(profile.updatedAt || 0).getTime();
    return time > new Date(latest || 0).getTime() ? profile.updatedAt : latest;
  }, null);
  const staleCount = profiles.filter(
    (profile) => currentTime - new Date(profile.updatedAt || 0) > 15 * 60 * 1000
  ).length;
  const pendingOutboxCount = await ArenaOutboxEvent.countDocuments({
    publishedAt: null,
    createdAt: { $lt: new Date(currentTime.getTime() - 5 * 60 * 1000) },
  });
  const alerts = [];
  if (duplicateRanks.length) alerts.push(`${duplicateRanks.length}개 순위에서 중복이 발견되었습니다.`);
  if (missingRanks.length) alerts.push(`${missingRanks.length}개 순위가 비어 있습니다.`);
  if (staleCount) alerts.push(`${staleCount}명의 랭킹 계산 시각이 15분 이상 지연되었습니다.`);
  if (pendingOutboxCount) alerts.push(`처리 대기 이벤트 ${pendingOutboxCount}건을 확인해주세요.`);
  return {
    generatedAt: currentTime,
    latestCalculationAt,
    activeProfileCount: profiles.length,
    duplicateRanks,
    missingRanks: missingRanks.slice(0, 50),
    staleCount,
    pendingOutboxCount,
    alerts,
    status: alerts.length ? "REVIEW" : "HEALTHY",
  };
}

async function getRecentRankingHistory() {
  const changes = await ArenaStandingChangeLedger.find()
    .sort({ occurredAt: -1, _id: -1 })
    .limit(120)
    .lean();
  const users = await User.find({ _id: { $in: changes.map((change) => change.userId) } })
    .select("name realName email")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return changes.map((change) => ({
    id: String(change._id),
    user: userById.get(String(change.userId)) || null,
    matchId: String(change.matchId),
    changeType: change.changeType,
    before: change.tupleBefore,
    after: change.tupleAfter,
    occurredAt: change.occurredAt,
  }));
}

async function previewFinalRankingRecalculation({ now = new Date() } = {}) {
  const rows = await calculateFinalRankingRows({ now });
  const existing = await LiveFinalRankingProfile.find({
    seasonId: rows[0]?.seasonId,
  }).lean();
  const existingByUser = new Map(existing.map((profile) => [String(profile.userId), profile]));
  const changed = rows
    .map((row) => {
      const before = existingByUser.get(String(row.userId));
      if (
        Number(before?.finalRank || 0) === Number(row.finalRank) &&
        Number(before?.finalRating || 0) === Number(row.finalRating)
      ) return null;
      return {
        userId: String(row.userId),
        beforeRank: before?.finalRank || null,
        afterRank: row.finalRank,
        beforeRating: before?.finalRating ?? null,
        afterRating: row.finalRating,
      };
    })
    .filter(Boolean);
  const users = await User.find({ _id: { $in: changed.map((item) => item.userId) } })
    .select("name realName")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  return {
    generatedAt: new Date(now),
    totalRows: rows.length,
    changedCount: changed.length,
    changes: changed.slice(0, 200).map((item) => ({
      ...item,
      user: userById.get(item.userId) || null,
    })),
  };
}

async function getRankingOperationsDashboard({ preview = false, now = new Date() } = {}) {
  const [health, history, recalculationPreview] = await Promise.all([
    getRankingHealth({ now }),
    getRecentRankingHistory(),
    preview ? previewFinalRankingRecalculation({ now }) : null,
  ]);
  const storage = getFileStorageStatus();
  const operations = {
    storage,
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    sharedSessionConfigured: true,
    schedulerEnabled: process.env.DISABLE_SCHEDULERS !== "1",
  };
  return { health, history, recalculationPreview, operations };
}

async function rebuildFinalRankingByAdmin({ adminUserId, now = new Date() }) {
  const result = await recalculateFinalRanking({ now, forcePublish: true });
  await AdminActionLog.create({
    adminUserId,
    action: "ARENA_FINAL_RANKING_REBUILT",
    detail: `최종 종합 랭킹 ${result.rows.length}개를 다시 계산했습니다.`,
    metadata: { rowCount: result.rows.length, executedAt: now },
  });
  return result;
}

async function runRankingMaintenanceTask({ adminUserId, task, now = new Date() }) {
  const code = String(task || "").trim().toUpperCase();
  let result;
  if (code === "ACCESS_CYCLE_RETRY") {
    const {
      processDepletedAccessCycles,
      processDueDailyConsumptions,
    } = require("./accessCycleDailyService");
    result = {
      consumption: await processDueDailyConsumptions({ now }),
      expiration: await processDepletedAccessCycles({ now }),
    };
  } else if (code === "NOTIFICATION_RETRY") {
    const { processDueAccessCycleExpiryReminders } = require("./accessCycleExpiryReminderService");
    result = await processDueAccessCycleExpiryReminders({ now });
  } else if (code === "SETTLEMENT_RETRY") {
    const { settleArenaMatch } = require("./arenaMatchSettlementService");
    const matches = await ArenaMatch.find({ status: { $in: ["SUBMITTED", "RESOLVED"] } })
      .sort({ updatedAt: 1 })
      .limit(100)
      .select("_id")
      .lean();
    const summary = { scanned: matches.length, settled: 0, waiting: 0, failed: 0 };
    for (const match of matches) {
      try {
        const settlement = await settleArenaMatch({ matchId: match._id, now });
        if (settlement?.settled) summary.settled += 1;
        else summary.waiting += 1;
      } catch (error) {
        summary.failed += 1;
      }
    }
    result = summary;
  } else if (code === "SEASON_RETRY") {
    const { openAnnualArenaSeason } = require("./arenaSeasonService");
    result = await openAnnualArenaSeason({ now });
  } else {
    const error = new Error("지원하지 않는 운영 작업입니다.");
    error.status = 400;
    throw error;
  }
  await AdminActionLog.create({
    adminUserId,
    action: `ARENA_MAINTENANCE_${code}`,
    detail: `${code} 운영 작업을 수동 실행했습니다.`,
    metadata: { result, executedAt: now },
  });
  return result;
}

async function exportFinalRankingCsv({ adminUserId } = {}) {
  const profiles = await LiveFinalRankingProfile.find({
    status: { $in: ["ACTIVE", "SUNDAY_DISPLAY_FROZEN"] },
  })
    .sort({ finalRank: 1 })
    .lean();
  const users = await User.find({ _id: { $in: profiles.map((profile) => profile.userId) } })
    .select("name realName email school")
    .lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const header = ["최종 종합 순위", "최종 종합 점수", "Division", "닉네임", "실명", "이메일", "학교", "최근 계산 시각"];
  const rows = profiles.map((profile) => {
    const user = userById.get(String(profile.userId)) || {};
    return [
      profile.finalRank,
      profile.finalRating,
      profile.currentCompetitiveDivision,
      user.name,
      user.realName,
      user.email,
      user.school?.name,
      profile.updatedAt?.toISOString?.() || "",
    ];
  });
  if (adminUserId) {
    await AdminActionLog.create({
      adminUserId,
      action: "ARENA_FINAL_RANKING_EXPORTED",
      detail: `최종 종합 랭킹 ${profiles.length}개를 CSV로 내보냈습니다.`,
      metadata: { rowCount: profiles.length },
    });
  }
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

module.exports = {
  exportFinalRankingCsv,
  getRankingHealth,
  getRankingOperationsDashboard,
  previewFinalRankingRecalculation,
  rebuildFinalRankingByAdmin,
  runRankingMaintenanceTask,
};
