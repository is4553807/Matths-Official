const mongoose = require("mongoose");
const {
  AssessmentAttempt,
  User,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaCohortRevision,
  ArenaOutboxEvent,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  resolveArenaTier,
} = require("./arenaTierPolicy");

const KST_TIME_ZONE = "Asia/Seoul";
const INITIAL_ARENA_SEED_POLICY_VERSION =
  "INITIAL-PLACEMENT-BASELINE-V1";
const TRANSACTION_RETRY_LIMIT = 3;
const LIFECYCLE_OWNED_ACCESS_STATES = [
  "MAIN_DEMOTED_TO_SUB",
  "SUB_ACCESS_EXPIRED_LOCKED",
  "PAID_PENDING_RENEWAL_ASSESSMENT",
];

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function kstSeasonKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw statusError(
      400,
      "배치고사 완료 시각을 확인할 수 없습니다.",
      "INVALID_PLACEMENT_COMPLETION_TIME"
    );
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

function initialArenaGpFromPlacement(attempt) {
  const placementResult =
    attempt?.placementResult || {};
  const candidate =
    placementResult.initialRating ??
    placementResult.initialMmr;
  const value = Number(candidate);
  if (!Number.isFinite(value) || value < 0) {
    throw statusError(
      409,
      "배치고사에서 최초 GP를 생성할 수 없습니다.",
      "INITIAL_ARENA_GP_UNAVAILABLE"
    );
  }
  return Math.round(value);
}

function standingId(standing) {
  return String(standing?._id || "");
}

function compareStandingForLayout(left, right) {
  const gpDifference =
    Number(right.arenaGp) -
    Number(left.arenaGp);
  if (gpDifference !== 0) {
    return gpDifference;
  }
  const leftReachedAt = new Date(
    left.reachedCurrentGpAt ||
      left.createdAt ||
      0
  ).getTime();
  const rightReachedAt = new Date(
    right.reachedCurrentGpAt ||
      right.createdAt ||
      0
  ).getTime();
  if (leftReachedAt !== rightReachedAt) {
    return leftReachedAt - rightReachedAt;
  }
  return standingId(left).localeCompare(
    standingId(right)
  );
}

/*
 * 공개 순위는 GP 내림차순으로 정렬하되, arenaPosition은 전체 순위가 아니라
 * 같은 티어 안의 순위입니다. 동점이면 해당 GP에 먼저 도달한 사용자가 앞섭니다.
 */
function computeArenaCohortLayout(standings = []) {
  const sorted = [...standings].sort(
    compareStandingForLayout
  );
  const activeRankerCount = sorted.length;
  const tierPositions = new Map();

  return sorted.map((standing, index) => {
    const tier = resolveArenaTier({
      gp: standing.arenaGp,
      topPercentile:
        activeRankerCount > 0
          ? (index + 1) /
            activeRankerCount
          : 1,
      activeRankerCount,
    });
    const position =
      (tierPositions.get(tier.code) || 0) + 1;
    tierPositions.set(tier.code, position);
    return {
      _id: standing._id,
      userId: standing.userId,
      arenaGp: Number(standing.arenaGp),
      arenaRank: tier.label,
      arenaPosition: position,
    };
  });
}

async function lockArenaCohort({
  session,
  seasonKey,
  division,
  now,
}) {
  return ArenaCohortRevision.findOneAndUpdate(
    { seasonKey, division },
    {
      $inc: { revision: 1 },
      $set: { recalculatedAt: now },
      $setOnInsert: {
        seasonKey,
        division,
      },
    },
    {
      upsert: true,
      new: true,
      session,
    }
  ).lean();
}

async function rebalanceArenaCohortInTransaction({
  session,
  seasonKey,
  division = "SUB",
  now = new Date(),
}) {
  await lockArenaCohort({
    session,
    seasonKey,
    division,
    now,
  });
  const standings = await ArenaStanding.find({
    seasonKey,
    division,
    status: "ACTIVE",
  })
    .session(session)
    .lean();
  const layout =
    computeArenaCohortLayout(standings);
  const currentById = new Map(
    standings.map((standing) => [
      standingId(standing),
      standing,
    ])
  );
  const operations = layout
    .filter((entry) => {
      const current = currentById.get(
        standingId(entry)
      );
      return (
        current?.arenaRank !==
          entry.arenaRank ||
        Number(current?.arenaPosition) !==
          entry.arenaPosition
      );
    })
    .map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            arenaRank: entry.arenaRank,
            arenaPosition:
              entry.arenaPosition,
          },
        },
      },
    }));

  if (operations.length) {
    await ArenaStanding.bulkWrite(
      operations,
      { session }
    );
  }
  return layout;
}

async function activateStandingForPaidPlacement({
  userId,
  standingId: requestedStandingId,
  session,
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(userId) ||
    !mongoose.isValidObjectId(
      requestedStandingId
    )
  ) {
    throw statusError(
      400,
      "활성화할 Sub Division 순위를 확인해주세요.",
      "INVALID_ARENA_STANDING_ID"
    );
  }
  const standing = await ArenaStanding.findOne({
    _id: requestedStandingId,
    userId,
    division: "SUB",
    status: { $ne: "ARCHIVED" },
  })
    .session(session)
    .lean();
  if (!standing) {
    throw statusError(
      409,
      "결제에 연결할 Sub Division 순위를 찾을 수 없습니다.",
      "ARENA_STANDING_NOT_FOUND"
    );
  }
  if (standing.status !== "ACTIVE") {
    await ArenaStanding.updateOne(
      { _id: standing._id },
      {
        $set: {
          status: "ACTIVE",
          reachedCurrentGpAt:
            standing.reachedCurrentGpAt ||
            now,
        },
      },
      { session }
    );
  }
  const layout =
    await rebalanceArenaCohortInTransaction({
      session,
      seasonKey: standing.seasonKey,
      division: "SUB",
      now,
    });
  return (
    layout.find(
      (entry) =>
        standingId(entry) ===
        standingId(standing)
    ) || null
  );
}

function isRetryableTransactionError(error) {
  return Boolean(
    error?.code === 11000 ||
      error?.hasErrorLabel?.(
        "TransientTransactionError"
      ) ||
      error?.hasErrorLabel?.(
        "UnknownTransactionCommitResult"
      )
  );
}

async function runInitialPlacementTransaction({
  userId,
  attemptId,
  now,
}) {
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(
      async () => {
        const attempt =
          await AssessmentAttempt.findOne({
            _id: attemptId,
            userId,
            scopeType: "placement",
            status: "submitted",
          })
            .session(session)
            .lean();
        if (!attempt) {
          throw statusError(
            409,
            "완료된 배치고사 기록을 찾을 수 없습니다.",
            "COMPLETED_PLACEMENT_NOT_FOUND"
          );
        }
        if (
          attempt.placementResult
            ?.verification?.result ===
          "pending"
        ) {
          throw statusError(
            409,
            "배치고사 검증 문항을 먼저 완료해주세요.",
            "PLACEMENT_VERIFICATION_REQUIRED"
          );
        }

        const user = await User.findById(userId)
          .select("accountStatus isActive")
          .session(session)
          .lean();
        if (!user) {
          throw statusError(
            404,
            "배치고사 사용자를 찾을 수 없습니다.",
            "USER_NOT_FOUND"
          );
        }
        if (
          user.accountStatus !== "active" ||
          user.isActive === false
        ) {
          throw statusError(
            403,
            "활성 상태인 계정만 Sub Division에 배치될 수 있습니다.",
            "ACCOUNT_NOT_ACTIVE"
          );
        }

        const seededAt = new Date(
          attempt.submittedAt ||
            attempt.updatedAt ||
            now
        );
        const seasonKey =
          kstSeasonKey(seededAt);
        const currentSeasonKey =
          kstSeasonKey(now);
        if (seasonKey !== currentSeasonKey) {
          result = {
            standing: null,
            accessState: null,
            paidActive: false,
            seasonKey,
            replayed: true,
            skippedReason:
              "HISTORICAL_PLACEMENT_CANNOT_OPEN_CURRENT_SEASON",
          };
          return;
        }
        const arenaGp =
          initialArenaGpFromPlacement(
            attempt
          );
        const seedPlacementScore = Number(
          attempt.placementResult
            ?.placementScore
        );
        const [cycle, accessState] =
          await Promise.all([
            AccessCycle.findOne({
              userId,
              status: "ACTIVE",
              availableLearningDays: {
                $gt: 0,
              },
            })
              .session(session)
              .lean(),
            ArenaAccessState.findOne({
              userId,
            })
              .session(session)
              .lean(),
          ]);
        let standing =
          await ArenaStanding.findOne({
            userId,
            division: "SUB",
            seasonKey,
          })
            .session(session)
            .lean();

        const existingEvent = standing
          ? await ArenaOutboxEvent.findOne({
              idempotencyKey:
                `${attempt._id}:ArenaPlacementCompleted`,
            })
              .select("_id")
              .session(session)
              .lean()
          : null;

        if (
          standing?.sourcePlacementAttemptId &&
          String(
            standing.sourcePlacementAttemptId
          ) !== String(attempt._id)
        ) {
          throw statusError(
            409,
            "이번 시즌의 최초 배치고사가 이미 Sub Division에 반영되었습니다.",
            "INITIAL_PLACEMENT_ALREADY_SEEDED"
          );
        }

        /*
         * 최초 배치 연결은 만료·Main 재구독 상태를 되돌리는 복구 수단이
         * 아니다. 한 번 만들어진 순위가 수명주기 전환에 들어간 뒤에는
         * 재구독·변환 서비스만 접근 상태를 변경할 수 있다.
         */
        if (
          standing?.sourcePlacementAttemptId &&
          LIFECYCLE_OWNED_ACCESS_STATES.includes(
            accessState?.state
          )
        ) {
          result = {
            standing: {
              _id: standing._id,
              userId,
              arenaGp: Number(
                standing.arenaGp
              ),
              arenaRank:
                standing.arenaRank,
              arenaPosition:
                standing.arenaPosition,
            },
            accessState: {
              state: accessState.state,
              currentCompetitiveDivision:
                accessState.currentCompetitiveDivision,
              currentSeasonPlacementCompleted:
                accessState.currentSeasonPlacementCompleted,
              defensePoolEligible: false,
              weeklyMockEligible: false,
              finalRankingActive: false,
            },
            paidActive: false,
            seasonKey,
            replayed: true,
            skippedReason:
              "ACCESS_LIFECYCLE_STATE_OWNS_REENTRY",
          };
          return;
        }

        const paidActive = Boolean(cycle);
        const expectedStandingStatus =
          paidActive ? "ACTIVE" : "LOCKED";
        const expectedAccessState = paidActive
          ? "PAID_ACTIVE"
          : "PAYMENT_REQUIRED";
        const alreadySynchronized = Boolean(
          standing?.sourcePlacementAttemptId &&
            String(
              standing.sourcePlacementAttemptId
            ) === String(attempt._id) &&
            standing.status ===
              expectedStandingStatus &&
            accessState?.state ===
              expectedAccessState &&
            accessState
              ?.currentCompetitiveDivision ===
              "SUB" &&
            String(
              accessState?.standingId || ""
            ) === String(standing._id) &&
            accessState
              ?.currentSeasonPlacementCompleted ===
              true &&
            accessState
              ?.defensePoolEligible ===
              paidActive &&
            accessState
              ?.weeklyMockEligible ===
              paidActive &&
            accessState
              ?.finalRankingActive ===
              paidActive &&
            (!paidActive ||
              String(
                accessState?.accessCycleId ||
                  ""
              ) === String(cycle._id)) &&
            existingEvent
        );
        if (alreadySynchronized) {
          result = {
            standing: {
              _id: standing._id,
              userId,
              arenaGp: Number(
                standing.arenaGp
              ),
              arenaRank:
                standing.arenaRank,
              arenaPosition:
                standing.arenaPosition,
            },
            accessState: {
              state: expectedAccessState,
              currentCompetitiveDivision:
                "SUB",
              currentSeasonPlacementCompleted:
                true,
              defensePoolEligible:
                paidActive,
              weeklyMockEligible:
                paidActive,
              finalRankingActive:
                paidActive,
            },
            paidActive,
            seasonKey,
            replayed: true,
          };
          return;
        }
        const placeholderTier =
          resolveArenaTier({
            gp: arenaGp,
            topPercentile: 1,
            activeRankerCount: 0,
          });
        if (!standing) {
          [standing] = await ArenaStanding.create(
            [
              {
                userId,
                division: "SUB",
                seasonKey,
                sourcePlacementAttemptId:
                  attempt._id,
                seedPolicyVersion:
                  INITIAL_ARENA_SEED_POLICY_VERSION,
                seedPlacementScore:
                  Number.isFinite(
                    seedPlacementScore
                  )
                    ? seedPlacementScore
                    : null,
                seededAt,
                arenaRank:
                  placeholderTier.label,
                arenaPosition: 1,
                arenaGp,
                status: paidActive
                  ? "ACTIVE"
                  : "LOCKED",
                reachedCurrentGpAt: seededAt,
              },
            ],
            { session }
          );
          standing = standing.toObject();
        } else {
          const update = {
            sourcePlacementAttemptId:
              attempt._id,
            seedPolicyVersion:
              standing.seedPolicyVersion ||
              INITIAL_ARENA_SEED_POLICY_VERSION,
            seedPlacementScore:
              Number.isFinite(
                seedPlacementScore
              )
                ? seedPlacementScore
                : null,
            seededAt:
              standing.seededAt || seededAt,
            status: paidActive
              ? "ACTIVE"
              : "LOCKED",
          };
          if (
            !standing.sourcePlacementAttemptId
          ) {
            update.arenaGp = arenaGp;
            update.arenaRank =
              placeholderTier.label;
            update.arenaPosition = 1;
            update.reachedCurrentGpAt =
              seededAt;
          }
          await ArenaStanding.updateOne(
            { _id: standing._id },
            { $set: update },
            { session }
          );
          standing = {
            ...standing,
            ...update,
          };
        }

        let placedStanding = {
          _id: standing._id,
          userId,
          arenaGp: Number(
            standing.arenaGp
          ),
          arenaRank: standing.arenaRank,
          arenaPosition:
            standing.arenaPosition,
        };
        if (paidActive) {
          const layout =
            await rebalanceArenaCohortInTransaction(
              {
                session,
                seasonKey,
                division: "SUB",
                now,
              }
            );
          placedStanding =
            layout.find(
              (entry) =>
                standingId(entry) ===
                standingId(standing)
            ) || placedStanding;
        }

        const state = paidActive
          ? "PAID_ACTIVE"
          : "PAYMENT_REQUIRED";
        await ArenaAccessState.updateOne(
          { userId },
          {
            $set: {
              currentCompetitiveDivision:
                "SUB",
              accessCycleId:
                cycle?._id ||
                accessState?.accessCycleId ||
                null,
              standingId: standing._id,
              state,
              currentSeasonPlacementCompleted:
                true,
              expiredAt: null,
              renewalGraceDeadline: null,
              defensePoolEligible:
                paidActive,
              weeklyMockEligible:
                paidActive,
              finalRankingActive:
                paidActive,
              reasonCode: paidActive
                ? "INITIAL_PLACEMENT_PAID_ACTIVE"
                : "INITIAL_PLACEMENT_PAYMENT_REQUIRED",
            },
            $setOnInsert: {
              mainAchievementStatus:
                "NOT_ACHIEVED",
            },
          },
          { upsert: true, session }
        );

        await ArenaOutboxEvent.updateOne(
          {
            idempotencyKey:
              `${attempt._id}:ArenaPlacementCompleted`,
          },
          {
            $setOnInsert: {
              eventType:
                "ArenaPlacementCompleted",
              aggregateType:
                "ArenaStanding",
              aggregateId: standing._id,
              idempotencyKey:
                `${attempt._id}:ArenaPlacementCompleted`,
              payload: {
                userId,
                attemptId: attempt._id,
                standingId: standing._id,
                accessCycleId:
                  cycle?._id || null,
                division: "SUB",
                seasonKey,
                arenaGp,
                seedPolicyVersion:
                  INITIAL_ARENA_SEED_POLICY_VERSION,
                state,
              },
            },
          },
          { upsert: true, session }
        );

        result = {
          standing: placedStanding,
          accessState: {
            state,
            currentCompetitiveDivision:
              "SUB",
            currentSeasonPlacementCompleted:
              true,
            defensePoolEligible:
              paidActive,
            weeklyMockEligible:
              paidActive,
            finalRankingActive:
              paidActive,
          },
          paidActive,
          seasonKey,
        };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );
  } finally {
    await session.endSession();
  }
  return result;
}

async function syncInitialArenaPlacement({
  userId,
  attemptId,
  now = new Date(),
}) {
  if (
    !mongoose.isValidObjectId(userId) ||
    !mongoose.isValidObjectId(attemptId)
  ) {
    throw statusError(
      400,
      "배치고사 사용자와 기록을 확인해주세요.",
      "INVALID_PLACEMENT_REFERENCE"
    );
  }
  let lastError = null;
  for (
    let attempt = 1;
    attempt <= TRANSACTION_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      return await runInitialPlacementTransaction({
        userId,
        attemptId,
        now,
      });
    } catch (error) {
      lastError = error;
      if (
        attempt ===
          TRANSACTION_RETRY_LIMIT ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }
  throw lastError;
}

module.exports = {
  INITIAL_ARENA_SEED_POLICY_VERSION,
  LIFECYCLE_OWNED_ACCESS_STATES,
  activateStandingForPaidPlacement,
  compareStandingForLayout,
  computeArenaCohortLayout,
  initialArenaGpFromPlacement,
  kstSeasonKey,
  rebalanceArenaCohortInTransaction,
  syncInitialArenaPlacement,
};
