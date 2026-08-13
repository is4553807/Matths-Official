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
  arenaTierByValue,
  arenaTierIndex,
  arenaTupleFromLegacyGp,
  resolveArenaTier,
} = require("./arenaTierPolicy");
const {
  resolveMainCompetitivePool,
} = require("./mainCompetitivePoolService");

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

function initialArenaLegacyGpFromPlacement(attempt) {
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

function initialArenaTupleFromPlacement(attempt) {
  return arenaTupleFromLegacyGp(
    initialArenaLegacyGpFromPlacement(attempt)
  );
}

function initialArenaGpFromPlacement(attempt) {
  return initialArenaTupleFromPlacement(attempt).arenaGp;
}

function standingId(standing) {
  return String(standing?._id || "");
}

function isInitialPlacementStanding(standing) {
  if (!standing?.sourcePlacementAttemptId || !standing?.seededAt) {
    return false;
  }
  return (
    new Date(standing.reachedCurrentGpAt || 0).getTime() ===
    new Date(standing.seededAt).getTime()
  );
}

function compareStandingTieBreakers(left, right) {
  const gpDifference =
    Number(right.arenaGp) -
    Number(left.arenaGp);
  if (gpDifference !== 0) {
    return gpDifference;
  }
  if (
    isInitialPlacementStanding(left) &&
    isInitialPlacementStanding(right)
  ) {
    const leftScore = left.seedPlacementScore === null ||
      left.seedPlacementScore === undefined
      ? -Infinity
      : Number(left.seedPlacementScore);
    const rightScore = right.seedPlacementScore === null ||
      right.seedPlacementScore === undefined
      ? -Infinity
      : Number(right.seedPlacementScore);
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftElapsed = left.seedPlacementElapsedTimeMs !== null &&
      left.seedPlacementElapsedTimeMs !== undefined &&
      Number.isFinite(Number(left.seedPlacementElapsedTimeMs))
      ? Number(left.seedPlacementElapsedTimeMs)
      : Infinity;
    const rightElapsed = right.seedPlacementElapsedTimeMs !== null &&
      right.seedPlacementElapsedTimeMs !== undefined &&
      Number.isFinite(Number(right.seedPlacementElapsedTimeMs))
      ? Number(right.seedPlacementElapsedTimeMs)
      : Infinity;
    if (leftElapsed !== rightElapsed) {
      return leftElapsed - rightElapsed;
    }
    const leftMmr = left.seedPlacementMmr === null ||
      left.seedPlacementMmr === undefined
      ? -Infinity
      : Number(left.seedPlacementMmr);
    const rightMmr = right.seedPlacementMmr === null ||
      right.seedPlacementMmr === undefined
      ? -Infinity
      : Number(right.seedPlacementMmr);
    if (leftMmr !== rightMmr) return rightMmr - leftMmr;
    const leftStartedAt = left.seedPlacementStartedAt
      ? new Date(left.seedPlacementStartedAt).getTime()
      : Infinity;
    const rightStartedAt = right.seedPlacementStartedAt
      ? new Date(right.seedPlacementStartedAt).getTime()
      : Infinity;
    if (leftStartedAt !== rightStartedAt) {
      return leftStartedAt - rightStartedAt;
    }
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

function compareStandingForLayout(left, right) {
  const tierDifference =
    arenaTierIndex(right.arenaRank) -
    arenaTierIndex(left.arenaRank);
  if (tierDifference !== 0) return tierDifference;
  const qualificationDifference =
    arenaTierIndex(qualifiedArenaRank(right)) -
    arenaTierIndex(qualifiedArenaRank(left));
  if (qualificationDifference !== 0) {
    return qualificationDifference;
  }
  return compareStandingTieBreakers(left, right);
}

function qualifiedArenaRank(standing) {
  if (standing?.qualifiedArenaRank) {
    return standing.qualifiedArenaRank;
  }
  if (
    standing?.seedPolicyVersion ===
      INITIAL_ARENA_SEED_POLICY_VERSION &&
    Number.isFinite(Number(standing?.seedPlacementMmr))
  ) {
    return arenaTupleFromLegacyGp(
      Number(standing.seedPlacementMmr)
    ).arenaRank;
  }
  return standing?.arenaRank;
}

function compareStandingForQualification(left, right) {
  const tierDifference =
    arenaTierIndex(qualifiedArenaRank(right)) -
    arenaTierIndex(qualifiedArenaRank(left));
  if (tierDifference !== 0) return tierDifference;
  return compareStandingTieBreakers(left, right);
}

/*
 * 공개 순위는 티어 → 티어 내부 GP 내림차순으로 정렬하되, arenaPosition은
 * 전체 순위가 아니라 같은 티어 안의 순위입니다. 동점이면 배치 동점 원본과
 * 해당 GP 도달 시각을 차례로 사용합니다.
 */
function computeArenaCohortLayout(
  standings = [],
  { division = null } = {}
) {
  const cohortDivision = String(
    division ||
      standings.find(
        (standing) => standing?.division
      )?.division ||
      "SUB"
  ).toUpperCase();
  const canonicalOrder = [...standings].sort(
    compareStandingForQualification
  );
  const activeRankerCount = canonicalOrder.length;
  const resolved = canonicalOrder.map((standing, index) => {
    const tier = resolveArenaTier({
      division: cohortDivision,
      rank: qualifiedArenaRank(standing),
      gp: standing.arenaGp,
      topPercentile:
        activeRankerCount > 0
          ? (index + 1) / activeRankerCount
          : 1,
      activeRankerCount,
    });
    return {
      ...standing,
      qualifiedArenaRank: qualifiedArenaRank(standing),
      arenaRank: tier.label,
    };
  });
  const sorted = resolved.sort(compareStandingForLayout);
  const tierPositions = new Map();

  return sorted.map((standing) => {
    const tier = arenaTierByValue(standing.arenaRank);
    const position =
      (tierPositions.get(tier.code) || 0) + 1;
    tierPositions.set(tier.code, position);
    return {
      _id: standing._id,
      userId: standing.userId,
      arenaGp: Number(standing.arenaGp),
      arenaRank: tier.label,
      qualifiedArenaRank: standing.qualifiedArenaRank,
      arenaPosition: position,
    };
  });
}

function temporaryPositionBaseByTier(
  standings = [],
  layout = []
) {
  const maximumByTier = new Map();
  for (const standing of [
    ...standings,
    ...layout,
  ]) {
    const key = String(
      standing?.arenaRank || ""
    );
    maximumByTier.set(
      key,
      Math.max(
        maximumByTier.get(key) || 0,
        Number(
          standing?.arenaPosition
        ) || 0
      )
    );
  }
  return maximumByTier;
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
      returnDocument: "after",
      session,
    }
  ).lean();
}

async function rebalanceArenaCohortInTransaction({
  session,
  seasonKey,
  division = "SUB",
  competitivePool = "ALL",
  now = new Date(),
  lockHeld = false,
}) {
  if (!lockHeld) {
    await lockArenaCohort({
      session,
      seasonKey,
      division,
      now,
    });
  }
  const standings = await ArenaStanding.find({
    seasonKey,
    division,
    status: "ACTIVE",
  })
    .session(session)
    .lean();
  const layout =
    computeArenaCohortLayout(
      standings,
      { division }
    );
  const currentById = new Map(
    standings.map((standing) => [
      standingId(standing),
      standing,
    ])
  );
  const changedEntries = layout
    .filter((entry) => {
      const current = currentById.get(
        standingId(entry)
      );
      return (
        current?.arenaRank !==
          entry.arenaRank ||
        (current?.qualifiedArenaRank || current?.arenaRank) !==
          entry.qualifiedArenaRank ||
        Number(current?.arenaPosition) !==
          entry.arenaPosition
      );
    });

  if (changedEntries.length) {
    /*
     * `(division, seasonKey, arenaRank, arenaPosition)`은 고유 인덱스다.
     * 순위를 바로 맞바꾸면 첫 번째 갱신이 아직 이동하지 않은 사용자의
     * 위치와 충돌할 수 있으므로, 현재 티어별 임시 위치로 모두 피신시킨 뒤
     * 최종 티어·순위를 적용한다.
     */
    /*
     * 재배치 과정에서 다른 티어의 사용자가 유입되면 최종 티어 인원이 현재
     * 인원보다 많아질 수 있다. 임시 위치가 그 최종 순위와 겹치지 않도록
     * 현재 최대값과 최종 최대값 중 더 큰 값 뒤로 이동시킨다.
     */
    const highestPositionByCurrentTier =
      temporaryPositionBaseByTier(
        standings,
        layout
      );
    const temporaryOffsetByTier = new Map();
    const temporaryOperations = changedEntries.map((entry) => {
      const current = currentById.get(standingId(entry));
      const key = String(current?.arenaRank || "");
      const offset = (temporaryOffsetByTier.get(key) || 0) + 1;
      temporaryOffsetByTier.set(key, offset);
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: {
            $set: {
              arenaPosition:
                (highestPositionByCurrentTier.get(key) || 0) + offset,
            },
          },
        },
      };
    });
    await ArenaStanding.bulkWrite(
      temporaryOperations,
      { session, ordered: true }
    );

    const finalOperations = changedEntries.map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            arenaRank: entry.arenaRank,
            qualifiedArenaRank:
              entry.qualifiedArenaRank,
            arenaPosition:
              entry.arenaPosition,
          },
        },
      },
    }));
    await ArenaStanding.bulkWrite(
      finalOperations,
      { session, ordered: true }
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
      "활성화할 Unranked 순위를 확인해주세요.",
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
      "결제에 연결할 Unranked 순위를 찾을 수 없습니다.",
      "ARENA_STANDING_NOT_FOUND"
    );
  }
  const placementSeedTuple =
    standing.status !== "ACTIVE" &&
    standing.seedPolicyVersion ===
      INITIAL_ARENA_SEED_POLICY_VERSION &&
    Number.isFinite(
      Number(standing.seedPlacementMmr)
    )
      ? arenaTupleFromLegacyGp(
          Number(standing.seedPlacementMmr)
        )
      : null;
  const activationArenaRank =
    placementSeedTuple?.arenaRank ||
    standing.arenaRank;
  const activationArenaGp =
    placementSeedTuple?.arenaGp ??
    standing.arenaGp;
  if (standing.status !== "ACTIVE") {
    await lockArenaCohort({
      session,
      seasonKey: standing.seasonKey,
      division: "SUB",
      now,
    });
    const lastActiveStanding =
      await ArenaStanding.findOne({
        division: "SUB",
        seasonKey: standing.seasonKey,
        arenaRank: activationArenaRank,
        status: "ACTIVE",
      })
        .sort({ arenaPosition: -1 })
        .select("arenaPosition")
        .session(session)
        .lean();
    await ArenaStanding.updateOne(
      { _id: standing._id },
      {
        $set: {
          status: "ACTIVE",
          arenaRank:
            activationArenaRank,
          qualifiedArenaRank:
            activationArenaRank,
          arenaGp:
            activationArenaGp,
          arenaPosition:
            Number(lastActiveStanding?.arenaPosition || 0) + 1,
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
    lockHeld:
      standing.status !== "ACTIVE",
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
          .select("accountStatus isActive schoolGrade")
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
            "활성 상태인 계정만 현재 시즌 Division에 배치될 수 있습니다.",
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
        const initialArenaTuple =
          initialArenaTupleFromPlacement(attempt);
        const arenaGp = initialArenaTuple.arenaGp;
        const seedPlacementScore = Number(
          attempt.placementResult
            ?.placementScore
        );
        const seedPlacementElapsedTimeMs = Number(
          attempt.elapsedTimeMs
        );
        const seedPlacementMmr = Number(
          attempt.placementResult?.initialMmr ??
            attempt.placementResult?.initialRating
        );
        const seedPlacementStartedAt = attempt.startedAt
          ? new Date(attempt.startedAt)
          : new Date(attempt.createdAt || seededAt);
        const accessState = await ArenaAccessState.findOne({ userId })
          .session(session)
          .lean();
        const placementDivision =
          accessState?.state === "SEASON_PLACEMENT_REQUIRED" &&
          accessState?.currentCompetitiveDivision === "MAIN"
            ? "MAIN"
            : "SUB";
        const competitivePool =
          placementDivision === "MAIN"
            ? resolveMainCompetitivePool(user)
            : "ALL";
        const cycleCandidate = await AccessCycle.findOne({
          userId,
          division: placementDivision,
          status: "ACTIVE",
        })
          .session(session)
          .lean();
        const cycleTotal = cycleCandidate
          ? Number(cycleCandidate.availableLearningDays || 0) +
            Number(cycleCandidate.reservedLearningDays || 0) +
            Number(cycleCandidate.lockedLearningDays || 0)
          : 0;
        const cycle =
          cycleCandidate &&
          (placementDivision === "MAIN"
            ? cycleTotal > 0
            : Number(cycleCandidate.availableLearningDays || 0) > 0)
            ? cycleCandidate
            : null;
        let standing =
          await ArenaStanding.findOne({
            userId,
            division: placementDivision,
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
            `이번 시즌의 배치고사가 이미 ${placementDivision === "MAIN" ? "Ranked" : "Unranked"}에 반영되었습니다.`,
            "INITIAL_PLACEMENT_ALREADY_SEEDED"
          );
        }

        /*
         * 최초 배치 연결은 만료·Ranked 재구독 상태를 되돌리는 복구 수단이
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
              placementDivision &&
            (placementDivision !== "MAIN" ||
              standing?.competitivePool === competitivePool) &&
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
                placementDivision,
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
        /*
         * 원본 배치 티어를 먼저 저장합니다. Unranked는 이 값을 그대로 쓰고,
         * Ranked만 활성 코호트 재정렬에서 인원 제한을 적용합니다.
         */
        const placeholderTier =
          arenaTierByValue(
            initialArenaTuple.arenaRank
          );
        /*
         * 티어 내부 순위는 고유 인덱스로 보호된다. 기존 인원이 있는 티어에
         * 새 사용자를 곧바로 1위로 삽입하면 재정렬 전에 중복 키가 발생하므로,
         * 코호트 잠금을 먼저 잡고 현재 마지막 순위 다음의 임시 위치에 넣는다.
         */
        await lockArenaCohort({
          session,
          seasonKey,
          division: placementDivision,
          now,
        });
        const lastTierStanding =
          await ArenaStanding.findOne({
            division: placementDivision,
            seasonKey,
            arenaRank: placeholderTier.label,
          })
            .sort({ arenaPosition: -1 })
            .select("arenaPosition")
            .session(session)
            .lean();
        const temporaryArenaPosition =
          Number(lastTierStanding?.arenaPosition || 0) + 1;
        if (!standing) {
          [standing] = await ArenaStanding.create(
            [
              {
                userId,
                division: placementDivision,
                seasonKey,
                competitivePool,
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
                seedPlacementElapsedTimeMs:
                  Number.isFinite(seedPlacementElapsedTimeMs)
                    ? seedPlacementElapsedTimeMs
                    : null,
                seedPlacementMmr:
                  Number.isFinite(seedPlacementMmr)
                    ? seedPlacementMmr
                    : null,
                seedPlacementStartedAt,
                seededAt,
                arenaRank:
                  placeholderTier.label,
                qualifiedArenaRank:
                  placeholderTier.label,
                arenaPosition:
                  temporaryArenaPosition,
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
            competitivePool,
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
            seedPlacementElapsedTimeMs:
              Number.isFinite(seedPlacementElapsedTimeMs)
                ? seedPlacementElapsedTimeMs
                : null,
            seedPlacementMmr:
              Number.isFinite(seedPlacementMmr)
                ? seedPlacementMmr
                : null,
            seedPlacementStartedAt:
              standing.seedPlacementStartedAt ||
              seedPlacementStartedAt,
            seededAt:
              standing.seededAt || seededAt,
            qualifiedArenaRank:
              standing.qualifiedArenaRank ||
              placeholderTier.label,
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
            update.arenaPosition =
              temporaryArenaPosition;
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
                division: placementDivision,
                competitivePool,
                now,
                lockHeld: true,
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
                placementDivision,
              mainCompetitivePool:
                placementDivision === "MAIN"
                  ? competitivePool
                  : null,
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
                ? placementDivision === "MAIN"
                  ? "ANNUAL_MAIN_SEASON_PLACEMENT_ACTIVE"
                  : "INITIAL_PLACEMENT_PAID_ACTIVE"
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
                division: placementDivision,
                competitivePool,
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
              placementDivision,
            mainCompetitivePool:
              placementDivision === "MAIN"
                ? competitivePool
                : null,
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

  /*
   * 이미 같은 배치고사로 현재 순위와 접근 상태가 연결된 사용자는 대시보드
   * 재방문 때마다 전체 최종 종합 랭킹을 다시 계산하지 않는다. 복구가 필요한
   * 불완전 데이터만 아래 트랜잭션 경로로 보낸다.
   */
  const existingStanding =
    await ArenaStanding.findOne({
      userId,
      sourcePlacementAttemptId:
        attemptId,
      status: {
        $in: ["ACTIVE", "LOCKED"],
      },
    }).lean();
  if (existingStanding) {
    const existingAccessState =
      await ArenaAccessState.findOne({
        userId,
        standingId:
          existingStanding._id,
        currentSeasonPlacementCompleted:
          true,
      }).lean();
    if (existingAccessState) {
      return {
        standing:
          existingStanding,
        accessState:
          existingAccessState,
        paidActive:
          existingAccessState.state ===
          "PAID_ACTIVE",
        seasonKey:
          existingStanding.seasonKey,
        replayed: true,
      };
    }
  }

  const pendingRenewal = await ArenaAccessState.exists({
    userId,
    state: "PAID_PENDING_RENEWAL_ASSESSMENT",
  });
  if (pendingRenewal) {
    const {
      completeRenewalRankAssessmentInTransaction,
    } = require("./arenaRenewalService");
    const session = await mongoose.startSession();
    let renewalResult = null;
    try {
      await session.withTransaction(async () => {
        renewalResult =
          await completeRenewalRankAssessmentInTransaction({
            userId,
            attemptId,
            session,
            now,
          });
      });
    } finally {
      await session.endSession();
    }
    if (renewalResult) {
      const { recalculateFinalRanking } = require("./finalRankingService");
      await recalculateFinalRanking({ now });
      return {
        standing: renewalResult.placed,
        accessState: {
          state: "PAID_ACTIVE",
          currentCompetitiveDivision: "SUB",
          currentSeasonPlacementCompleted: true,
          defensePoolEligible: true,
          weeklyMockEligible: true,
          finalRankingActive: true,
        },
        paidActive: true,
        seasonKey: kstSeasonKey(now),
        renewalAssessmentCompleted: true,
      };
    }
  }

  let lastError = null;
  for (
    let attempt = 1;
    attempt <= TRANSACTION_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      const placed = await runInitialPlacementTransaction({
        userId,
        attemptId,
        now,
      });
      const { recalculateFinalRanking } = require("./finalRankingService");
      await recalculateFinalRanking({ now });
      return placed;
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
  initialArenaLegacyGpFromPlacement,
  initialArenaTupleFromPlacement,
  kstSeasonKey,
  lockArenaCohort,
  rebalanceArenaCohortInTransaction,
  syncInitialArenaPlacement,
  temporaryPositionBaseByTier,
};
