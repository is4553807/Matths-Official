const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { AdminTodo, User } = require("../models/matthsModel");
const {
  ArenaAccessState,
  ArenaMatch,
  ArenaMatchAttempt,
  ArenaMatchAttemptEvent,
  ArenaMatchEvidence,
  ArenaOutboxEvent,
  ArenaProblemPack,
} = require("../models/goatArenaModel");
const {
  ARENA_EVIDENCE_STORAGE_DIR,
} = require("../middleware/arenaEvidenceUpload");
const {
  compareArenaAttemptScores,
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");
const {
  isSundayDivisionLocked,
} = require("./arenaMatchService");
const {
  cancelSubNormalNoStart,
  settleSubNormalMatch,
  settleSubRevengeNoShow,
} = require("./arenaMatchSettlementService");
const {
  cancelMainNormalNoStart,
  settleMainNormalMatch,
} = require("./mainArenaSettlementService");
const {
  settleMainRevengeNoShow,
} = require("./mainArenaRevengeService");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
  STORAGE_PURPOSES,
  storageFields,
  storeUploadedFile,
} = require("./fileStorageService");
const { withSchedulerLease } = require("./schedulerLeaseService");
const {
  reconcileAutomaticDefenseNoShows,
  recordAutomaticDefenseNoShow,
} = require("./arenaAutomaticDefenseService");

const ARENA_EVIDENCE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ARENA_EVIDENCE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAST_COMPLETION_REVIEW_THRESHOLD_MS = 5 * 60 * 1000;
const RAPID_CORRECT_ANSWER_THRESHOLD_MS = 60 * 1000;
const RAPID_CORRECT_ANSWER_REVIEW_COUNT = 3;
const ARENA_INTEGRITY_REVIEW_TARGET_MS = 24 * 60 * 60 * 1000;
let arenaEvidenceRetentionTimer = null;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isAtlasTransactionConflict(
  error
) {
  return (
    Number(error?.code) === 117 ||
    error?.codeName ===
      "ConflictingOperationInProgress"
  );
}

async function withFreshEvidenceTransaction(
  work,
  { maxAttempts = 3 } = {}
) {
  let lastError = null;
  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    const session =
      await mongoose.startSession();
    try {
      return await session.withTransaction(
        () => work(session)
      );
    } catch (error) {
      lastError = error;
      if (
        !isAtlasTransactionConflict(
          error
        ) ||
        attempt === maxAttempts
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          75 * attempt
        )
      );
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

async function discardArenaEvidenceFiles(files = []) {
  await Promise.all(
    files.map(async (file) => {
      const storedAsset =
        file?.storageAsset || file;
      if (
        storedAsset?.storageProvider ===
        "CLOUDINARY"
      ) {
        await destroyStoredAsset(
          storedAsset
        ).catch(() => {});
        return;
      }
      if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
    })
  );
}

async function sha256File(filePath) {
  const data = await fs.promises.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function hasExpectedImageSignature(filePath, extension) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if ([".jpg", ".jpeg"].includes(extension)) {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (extension === ".png") {
      return bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    }
    if (extension === ".webp") {
      return (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
    }
    if (extension === ".heic") {
      const brand = bytes.subarray(4, 12).toString("ascii");
      return /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/.test(brand);
    }
    return false;
  } finally {
    await handle.close();
  }
}

async function buildEvidenceFiles(files = []) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) {
    throw statusError(
      400,
      "풀이 증거 사진을 1장 이상 5장 이하로 제출해주세요.",
      "ARENA_EVIDENCE_FILE_COUNT"
    );
  }
  const totalSizeBytes = files.reduce(
    (sum, file) => sum + Math.max(0, Number(file?.size) || 0),
    0
  );
  if (totalSizeBytes > 30 * 1024 * 1024) {
    throw statusError(
      400,
      "풀이 증거는 경기당 총 30MB 이하로 제출해주세요.",
      "ARENA_EVIDENCE_TOTAL_SIZE"
    );
  }
  const result = [];
  const safeMimeByExtension = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
  };
  for (const file of files) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (!(await hasExpectedImageSignature(file.path, extension))) {
      throw statusError(
        400,
        "풀이 증거 파일의 실제 이미지 형식을 확인해주세요.",
        "INVALID_ARENA_EVIDENCE_SIGNATURE"
      );
    }
    const sha256 = await sha256File(file.path);
    const asset = await storeUploadedFile(file, {
      folder: "matths/arena-evidence",
      purpose: STORAGE_PURPOSES.USER_ARENA_EVIDENCE,
    });
    result.push({
      originalName: String(file.originalname || "풀이 증거").slice(0, 255),
      storedName: asset?.storedName || path.basename(file.filename),
      mimeType: safeMimeByExtension[extension] || "application/octet-stream",
      sizeBytes: Number(file.size || 0),
      sha256,
      ...storageFields(asset),
    });
  }
  return result;
}

function timingAnomalyFlags({ attempt, scoring } = {}) {
  const flags = [];
  const activeSolveTimeMs = Number(attempt?.activeSolveTimeMs || 0);
  if (
    activeSolveTimeMs > 0 &&
    activeSolveTimeMs < FAST_COMPLETION_REVIEW_THRESHOLD_MS
  ) {
    flags.push("FAST_COMPLETION_UNDER_FIVE_MINUTES");
  }
  const rapidCorrectCount = (scoring?.questionResults || []).filter(
    (result) =>
      result?.correct === true &&
      Number.isFinite(Number(result?.responseTimeMs)) &&
      Number(result.responseTimeMs) <= RAPID_CORRECT_ANSWER_THRESHOLD_MS
  ).length;
  if (rapidCorrectCount >= RAPID_CORRECT_ANSWER_REVIEW_COUNT) {
    flags.push("MULTIPLE_RAPID_CORRECT_ANSWERS");
  }
  return flags;
}

async function detectEvidenceAnomalies({ attempt, scoring, files, session }) {
  const flags = timingAnomalyFlags({ attempt, scoring });
  if (files.some((file) => Number(file.sizeBytes) < 5 * 1024)) {
    flags.push("VERY_SMALL_EVIDENCE_FILE");
  }
  const focusRows = await ArenaMatchAttemptEvent.aggregate([
    {
      $match: {
        attemptId: attempt._id,
        eventType: "ACTIVITY_RECORDED",
      },
    },
    { $unwind: "$signals" },
    { $match: { "signals.type": "FOCUS_LOST" } },
    { $count: "count" },
  ]).session(session);
  const focusEvents = Number(focusRows[0]?.count || 0);
  if (focusEvents >= 5) {
    flags.push("REPEATED_FOCUS_LOSS");
  }
  const duplicate = await ArenaMatchEvidence.exists({
    matchId: attempt.matchId,
    userId: { $ne: attempt.userId },
    "files.sha256": { $in: files.map((file) => file.sha256) },
  }).session(session);
  if (duplicate) {
    flags.push("SAME_EVIDENCE_AS_OPPONENT");
  }
  return [...new Set(flags)];
}

function hasFinishedQuestions(attempt) {
  return attempt?.status === "SUBMITTED" || (
    attempt?.status === "EVIDENCE_REQUIRED" &&
    Number(attempt?.currentQuestionIndex || 0) >= 5
  );
}

async function submitArenaMatchEvidence({
  matchId,
  userId,
  files,
  receivedAt = new Date(),
  now = new Date(),
}) {
  const acceptedAt =
    receivedAt instanceof Date &&
    !Number.isNaN(
      receivedAt.getTime()
    )
      ? receivedAt
      : now;
  if (isSundayDivisionLocked(acceptedAt)) {
    await discardArenaEvidenceFiles(files);
    throw statusError(
      423,
      "일요일 15시부터 월요일 0시까지 풀이 증거를 제출할 수 없습니다.",
      "SUNDAY_DIVISION_LOCK"
    );
  }
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(userId)) {
    await discardArenaEvidenceFiles(files);
    throw statusError(400, "경기 정보를 확인해주세요.", "INVALID_ARENA_EVIDENCE_TARGET");
  }
  let evidenceFiles;
  try {
    evidenceFiles = await buildEvidenceFiles(files);
  } catch (error) {
    await discardArenaEvidenceFiles(files);
    throw error;
  }

  let result = null;
  try {
    await withFreshEvidenceTransaction(async (session) => {
      result = null;
      /*
       * 같은 MongoDB 트랜잭션 세션에서는 병렬 명령을 실행할 수 없다.
       * Promise.all로 두 조회를 동시에 보내면 Atlas에서 transaction
       * number 충돌(code 117)이 발생하므로 반드시 순차 조회한다.
       */
      const match =
        await ArenaMatch.findById(
          matchId
        ).session(session);
      const attempt =
        await ArenaMatchAttempt.findOne({
          matchId,
          userId,
        }).session(session);
      if (!match || !attempt) {
        throw statusError(404, "풀이 증거를 제출할 경기를 찾을 수 없습니다.", "ARENA_EVIDENCE_MATCH_NOT_FOUND");
      }
      const existing = await ArenaMatchEvidence.findOne({
        attemptId: attempt._id,
      }).session(session);
      if (existing) {
        result = { evidence: existing, match, replayed: true };
        return;
      }
      if (attempt.status !== "EVIDENCE_REQUIRED") {
        throw statusError(409, "현재 단계에서는 풀이 증거를 제출할 수 없습니다.", "ARENA_EVIDENCE_NOT_REQUIRED");
      }
      if (
        match.matchType === "REVENGE" &&
        match.completionDeadlineAt &&
        new Date(match.completionDeadlineAt) < now
      ) {
        throw statusError(410, "복수전의 24시간 완료 기한이 끝났습니다.", "REVENGE_COMPLETION_DEADLINE_EXPIRED");
      }
      if (
        !attempt.evidenceDeadlineAt ||
        new Date(
          attempt.evidenceDeadlineAt
        ) < acceptedAt
      ) {
        throw statusError(410, "풀이 증거 제출 제한시간 1분이 끝났습니다.", "ARENA_EVIDENCE_DEADLINE_EXPIRED");
      }

      const problemPack = await ArenaProblemPack.findById(
        attempt.problemPackId
      )
        .select("+questions")
        .session(session)
        .lean();
      if (!problemPack) {
        throw statusError(
          409,
          "경기에 고정된 문제 팩을 찾을 수 없습니다.",
          "ARENA_EVIDENCE_PROBLEM_PACK_NOT_FOUND"
        );
      }
      const scoring = scoreArenaAttempt({
        attempt,
        problemPack,
      });
      let flags = [];
      const [evidence] = await ArenaMatchEvidence.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            files: evidenceFiles,
            deadlineAt: attempt.evidenceDeadlineAt,
            submittedAt: now,
            retentionUntil: new Date(now.getTime() + ARENA_EVIDENCE_RETENTION_MS),
            status: "ON_TIME",
            anomalyFlags: [],
          },
        ],
        { session, ordered: true }
      );
      attempt.status = "SUBMITTED";
      attempt.evidenceSubmittedAt = now;
      attempt.score = scoring.score;
      attempt.correctCount = scoring.correctCount;
      await attempt.save({ session });

      const otherAttempt = await ArenaMatchAttempt.findOne({
        matchId: match._id,
        userId: { $ne: userId },
      }).session(session);
      let matchIntegrityFlags = [];
      let evidenceByRole = {};
      let screenedRole = null;
      if (otherAttempt?.status === "SUBMITTED") {
        const otherEvidence = await ArenaMatchEvidence.findOne({
          matchId: match._id,
          attemptId: otherAttempt._id,
        }).session(session).lean();
        const attemptByRole = new Map([
          [attempt.role, attempt],
          [otherAttempt.role, otherAttempt],
        ]);
        const evidenceByAttemptId = new Map([
          [String(evidence.attemptId), evidence],
          [String(otherEvidence?.attemptId || ""), otherEvidence],
        ]);
        const scoringByRole = new Map([
          [attempt.role, scoring],
          [
            otherAttempt.role,
            scoreArenaAttempt({ attempt: otherAttempt, problemPack }),
          ],
        ]);
        screenedRole = compareArenaAttemptScores(
          scoringByRole.get("CHALLENGER"),
          scoringByRole.get("DEFENDER")
        );
        const screenedAttempt = attemptByRole.get(screenedRole);
        const screenedEvidence = evidenceByAttemptId.get(
          String(screenedAttempt?._id || "")
        );
        if (!screenedAttempt || !screenedEvidence) {
          throw statusError(
            409,
            "잠정 승자의 풀이 증거를 확인할 수 없습니다.",
            "ARENA_WINNER_EVIDENCE_NOT_FOUND"
          );
        }
        matchIntegrityFlags = await detectEvidenceAnomalies({
          attempt: screenedAttempt,
          scoring: scoringByRole.get(screenedRole),
          files: screenedEvidence.files || [],
          session,
        });
        await ArenaMatchEvidence.updateMany(
          { matchId: match._id },
          {
            $set: {
              screenedAsWinner: false,
              anomalyFlags: [],
              status: "ON_TIME",
            },
          },
          { session }
        );
        await ArenaMatchEvidence.updateOne(
          { _id: screenedEvidence._id },
          {
            $set: {
              screenedAsWinner: true,
              anomalyFlags: matchIntegrityFlags,
              status: matchIntegrityFlags.length
                ? "ANOMALY_FLAGGED"
                : "ON_TIME",
            },
          },
          { session }
        );
        if (String(screenedEvidence._id) === String(evidence._id)) {
          evidence.screenedAsWinner = true;
          evidence.anomalyFlags = matchIntegrityFlags;
          evidence.status = matchIntegrityFlags.length
            ? "ANOMALY_FLAGGED"
            : "ON_TIME";
        }
        flags = screenedRole === attempt.role ? matchIntegrityFlags : [];
        evidenceByRole = {
          CHALLENGER:
            screenedRole === "CHALLENGER" ? matchIntegrityFlags : [],
          DEFENDER:
            screenedRole === "DEFENDER" ? matchIntegrityFlags : [],
        };
        match.status = matchIntegrityFlags.length ? "HELD" : "SUBMITTED";
        match.integrityStatus = matchIntegrityFlags.length
          ? "SUSPICIOUS"
          : "CLEAR";
        if (matchIntegrityFlags.length) {
          match.integrityScreenedRole = screenedRole;
          match.integrityReviewStartedAt = now;
          match.integrityReviewDeadlineAt = new Date(
            now.getTime() + ARENA_INTEGRITY_REVIEW_TARGET_MS
          );
          match.integrityReviewCompletedAt = null;
          match.integrityPauseCompensationMs = 0;
          match.integrityPauseCompensatedAt = null;
        }
      } else if (
        otherAttempt?.status === "EVIDENCE_REQUIRED" &&
        hasFinishedQuestions(otherAttempt)
      ) {
        // 상대의 1분 증거 제출 창이 아직 열려 있다면 경기 보류가 아니다.
        // 제출 시한이 실제로 지난 뒤 스케줄러가 자동 패배를 정산한다.
        match.status = "IN_PROGRESS";
        match.integrityStatus = "PENDING";
      } else if (
        match.status === "HELD"
      ) {
        const deadlineTodo =
          await AdminTodo.findOne({
            sourceType:
              "ArenaEvidenceDeadline",
            sourceId: attempt._id,
            status: "pending",
          }).session(session);
        if (deadlineTodo) {
          deadlineTodo.status =
            "completed";
          deadlineTodo.description =
            `${deadlineTodo.description} 업로드 요청은 제한시간 안에 서버에 도착해 정상 제출로 복구했습니다.`;
          await deadlineTodo.save({
            session,
          });
          match.status =
            otherAttempt?.status ===
            "SUBMITTED"
              ? "SUBMITTED"
              : "IN_PROGRESS";
          match.integrityStatus =
            otherAttempt?.status ===
            "SUBMITTED"
              ? "CLEAR"
              : "PENDING";
        }
      }
      await match.save({ session });

      await ArenaMatchAttemptEvent.create(
        [
          {
            attemptId: attempt._id,
            matchId: match._id,
            userId,
            idempotencyKey: `ARENA_EVIDENCE:${attempt._id}`,
            eventType: "EVIDENCE_SUBMITTED",
            serverAt: now,
            metadata: {
              evidenceId: String(evidence._id),
              fileCount: evidenceFiles.length,
              anomalyFlags: flags,
            },
          },
        ],
        { session, ordered: true }
      );
      const outbox = [
        {
          eventType: "ArenaEvidenceSubmitted",
          aggregateType: "ArenaMatchEvidence",
          aggregateId: evidence._id,
          idempotencyKey: `${evidence._id}:ArenaEvidenceSubmitted`,
          payload: { matchId: String(match._id), userId: String(userId) },
        },
      ];
      if (match.status === "HELD" && matchIntegrityFlags.length) {
        const participantUserIds = [
          match.challenger.userId,
          match.defender.userId,
        ];
        const targetUserId = screenedRole === "DEFENDER"
          ? match.defender.userId
          : match.challenger.userId;
        await ArenaAccessState.updateMany(
          { userId: { $in: participantUserIds } },
          {
            $set: {
              integrityStatus: "REVIEW_REQUIRED",
              defensePoolEligible: false,
              reasonCode: "MATCH_INTEGRITY_REVIEW",
            },
          },
          { session }
        );
        await AdminTodo.findOneAndUpdate(
          {
            sourceType: "ArenaMatchIntegrityReview",
            sourceId: match._id,
          },
          {
            $setOnInsert: {
              category: "integrity",
              title: "GOAT Arena 경기 종료 후 무결성 검토 필요",
              description:
                `양측 제출 완료 후 잠정 승자인 ${screenedRole === "DEFENDER" ? "방어자" : "공격자"} 기록에서 확인이 필요한 신호가 감지되었습니다.`,
              href: `/admin/arena-matches#match-${match._id}`,
              targetUserId,
              actorUserId: targetUserId,
              sourceType: "ArenaMatchIntegrityReview",
              sourceId: match._id,
              status: "pending",
              metadata: {
                matchId: String(match._id),
                anomalyFlags: matchIntegrityFlags,
                anomalyFlagsByRole: evidenceByRole,
                screenedRole,
                reviewStartedAt: match.integrityReviewStartedAt,
                reviewDeadlineAt: match.integrityReviewDeadlineAt,
              },
            },
          },
          {
            upsert: true,
            returnDocument: "after",
            setDefaultsOnInsert: true,
            session,
          }
        );
        outbox.push({
          eventType: "ArenaMatchIntegrityReviewStarted",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaMatchIntegrityReviewStarted`,
          payload: {
            matchId: String(match._id),
            anomalyFlags: matchIntegrityFlags,
            anomalyFlagsByRole: evidenceByRole,
            screenedRole,
          },
        });
      }
      if (match.status === "SUBMITTED") {
        outbox.push({
          eventType: "ArenaMatchSubmitted",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaMatchSubmitted`,
          payload: { scoringVersion: match.scoringVersion },
        });
      }
      await ArenaOutboxEvent.create(outbox, {
        session,
        ordered: true,
      });
      result = { evidence, match, replayed: false };
    });
    if (result.replayed) {
      await discardArenaEvidenceFiles(
        evidenceFiles
      );
    }
    return {
      evidenceId: String(result.evidence._id),
      status: result.evidence.status,
      matchStatus: result.match.status,
      replayed: result.replayed,
    };
  } catch (error) {
    await discardArenaEvidenceFiles(
      evidenceFiles?.length
        ? evidenceFiles
        : files
    );
    throw error;
  }
}

async function getArenaSupplementalEvidenceRequest({
  matchId,
  userId,
  now = new Date(),
}) {
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(userId)) {
    throw statusError(404, "추가 소명 요청을 찾을 수 없습니다.", "ARENA_SUPPLEMENTAL_NOT_FOUND");
  }
  let evidence = await ArenaMatchEvidence.findOne({ matchId, userId }).lean();
  if (!evidence || evidence.supplementalRequest?.status === "NONE") {
    throw statusError(404, "현재 제출해야 할 추가 소명 자료가 없습니다.", "ARENA_SUPPLEMENTAL_NOT_REQUESTED");
  }
  if (
    evidence.supplementalRequest?.status === "REQUESTED" &&
    evidence.supplementalRequest?.deadlineAt &&
    new Date(evidence.supplementalRequest.deadlineAt) <= now
  ) {
    await ArenaMatchEvidence.updateOne(
      { _id: evidence._id, "supplementalRequest.status": "REQUESTED" },
      { $set: { "supplementalRequest.status": "EXPIRED" } }
    );
    evidence = {
      ...evidence,
      supplementalRequest: {
        ...evidence.supplementalRequest,
        status: "EXPIRED",
      },
    };
  }
  const match = await ArenaMatch.findById(matchId)
    .select("division matchType challenger.userId defender.userId")
    .lean();
  if (!match) {
    throw statusError(404, "경기 정보를 찾을 수 없습니다.", "ARENA_SUPPLEMENTAL_MATCH_NOT_FOUND");
  }
  return {
    matchId: String(match._id),
    division: match.division,
    matchType: match.matchType,
    role: String(match.challenger?.userId) === String(userId)
      ? "CHALLENGER"
      : "DEFENDER",
    status: evidence.supplementalRequest.status,
    requestedAt: evidence.supplementalRequest.requestedAt,
    deadlineAt: evidence.supplementalRequest.deadlineAt,
    requestMessage: evidence.supplementalRequest.requestMessage || "",
    submittedAt: evidence.supplementalRequest.submittedAt,
    submittedLate: evidence.supplementalRequest.submittedLate === true,
    lateByMs: Number(evidence.supplementalRequest.lateByMs || 0),
    fileCount: evidence.supplementalRequest.files?.length || 0,
    serverNow: now.toISOString(),
  };
}

async function submitArenaSupplementalEvidence({
  matchId,
  userId,
  files,
  receivedAt = new Date(),
  now = new Date(),
}) {
  const acceptedAt = receivedAt instanceof Date && !Number.isNaN(receivedAt.getTime())
    ? receivedAt
    : now;
  if (!mongoose.isValidObjectId(matchId) || !mongoose.isValidObjectId(userId)) {
    await discardArenaEvidenceFiles(files);
    throw statusError(400, "추가 소명 요청 정보를 확인해주세요.", "INVALID_ARENA_SUPPLEMENTAL_TARGET");
  }
  const currentEvidence = await ArenaMatchEvidence.findOne({ matchId, userId }).lean();
  if (!currentEvidence) {
    await discardArenaEvidenceFiles(files);
    throw statusError(404, "추가 소명 요청을 찾을 수 없습니다.", "ARENA_SUPPLEMENTAL_NOT_FOUND");
  }
  if (currentEvidence.supplementalRequest?.status === "SUBMITTED") {
    await discardArenaEvidenceFiles(files);
    return { replayed: true, status: "SUBMITTED" };
  }
  if (
    currentEvidence.supplementalRequest?.status !== "REQUESTED" ||
    !currentEvidence.supplementalRequest?.deadlineAt
  ) {
    await discardArenaEvidenceFiles(files);
    throw statusError(
      409,
      "현재 제출할 수 있는 추가 소명 요청이 없습니다.",
      "ARENA_SUPPLEMENTAL_NOT_ACTIVE"
    );
  }
  const match = await ArenaMatch.findOne({
    _id: matchId,
    status: "HELD",
  })
    .select("_id")
    .lean();
  if (!match) {
    await discardArenaEvidenceFiles(files);
    throw statusError(
      410,
      "운영 검토가 이미 끝나 추가 소명 자료를 제출할 수 없습니다.",
      "ARENA_SUPPLEMENTAL_REVIEW_COMPLETED"
    );
  }
  const deadlineAt = new Date(currentEvidence.supplementalRequest.deadlineAt);
  if (acceptedAt.getTime() >= deadlineAt.getTime()) {
    await ArenaMatchEvidence.updateOne(
      {
        _id: currentEvidence._id,
        "supplementalRequest.status": "REQUESTED",
      },
      { $set: { "supplementalRequest.status": "EXPIRED" } }
    );
    await discardArenaEvidenceFiles(files);
    throw statusError(
      410,
      "추가 소명 자료의 24시간 제출 기한이 끝났습니다. 미제출로 처리됩니다.",
      "ARENA_SUPPLEMENTAL_DEADLINE_EXPIRED"
    );
  }

  let supplementalFiles;
  try {
    supplementalFiles = await buildEvidenceFiles(files);
  } catch (error) {
    await discardArenaEvidenceFiles(files);
    throw error;
  }
  try {
    const retentionUntil = new Date(now.getTime() + ARENA_EVIDENCE_RETENTION_MS);
    const updated = await ArenaMatchEvidence.findOneAndUpdate(
      {
        _id: currentEvidence._id,
        "supplementalRequest.status": "REQUESTED",
        "supplementalRequest.deadlineAt": { $gt: acceptedAt },
      },
      {
        $set: {
          "supplementalRequest.status": "SUBMITTED",
          "supplementalRequest.submittedAt": now,
          "supplementalRequest.submittedLate": false,
          "supplementalRequest.lateByMs": 0,
          "supplementalRequest.files": supplementalFiles,
          retentionUntil: new Date(currentEvidence.retentionUntil) > retentionUntil
            ? currentEvidence.retentionUntil
            : retentionUntil,
        },
      },
      { returnDocument: "after" }
    ).lean();
    if (!updated) {
      await discardArenaEvidenceFiles(supplementalFiles);
      throw statusError(409, "추가 소명 요청 상태가 변경되었습니다. 페이지를 새로고침해주세요.", "ARENA_SUPPLEMENTAL_STATE_CHANGED");
    }
    return {
      replayed: false,
      status: updated.supplementalRequest.status,
      submittedAt: updated.supplementalRequest.submittedAt,
      submittedLate: updated.supplementalRequest.submittedLate === true,
      lateByMs: Number(updated.supplementalRequest.lateByMs || 0),
      fileCount: updated.supplementalRequest.files.length,
    };
  } catch (error) {
    if (error.code !== "ARENA_SUPPLEMENTAL_STATE_CHANGED") {
      await discardArenaEvidenceFiles(supplementalFiles);
    }
    throw error;
  }
}

async function holdExpiredEvidence({ now = new Date(), limit = 100 } = {}) {
  const attempts = await ArenaMatchAttempt.find({
    status: "EVIDENCE_REQUIRED",
    evidenceDeadlineAt: { $lt: now },
  })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let settled = 0;
  let cancelled = 0;
  for (const attempt of attempts) {
    const [match, matchAttempts] = await Promise.all([
      ArenaMatch.findById(attempt.matchId),
      ArenaMatchAttempt.find({ matchId: attempt.matchId }).lean(),
    ]);
    if (!match || !matchAttempts.length || ["SETTLED", "CANCELLED", "HELD"].includes(match.status)) continue;
    const expiredMissingRoles = matchAttempts
      .filter((entry) =>
        entry.status === "EVIDENCE_REQUIRED" &&
        entry.evidenceDeadlineAt &&
        new Date(entry.evidenceDeadlineAt).getTime() <= now.getTime()
      )
      .map((entry) => entry.role);
    if (!expiredMissingRoles.length || !matchAttempts.every(hasFinishedQuestions)) continue;
    // 필수 풀이 증거는 별도의 추가 소명 유예 없이 경기 결과에 직접 반영한다.
    // 양측 모두 미제출이면 승패를 만들 수 없으므로 예치만 원상 복구한다.
    if (expiredMissingRoles.length >= 2) {
      const result = match.matchType === "NORMAL"
        ? (match.division === "SUB"
            ? await cancelSubNormalNoStart({
                matchId: match._id,
                now,
                cancellationReason: "BOTH_REQUIRED_EVIDENCE_NOT_SUBMITTED",
              })
            : await cancelMainNormalNoStart({
                matchId: match._id,
                now,
                cancellationReason: "BOTH_REQUIRED_EVIDENCE_NOT_SUBMITTED",
              }))
        : (match.division === "SUB"
            ? await settleSubRevengeNoShow({
                matchId: match._id,
                noShowRole: "BOTH",
                now,
                allowEarlyForfeit: true,
              })
            : await settleMainRevengeNoShow({
                matchId: match._id,
                noShowRole: "BOTH",
                now,
                allowEarlyForfeit: true,
              }));
      if (result?.cancelled) cancelled += 1;
      if (result?.settled) settled += 1;
      continue;
    }
    const missingRole = expiredMissingRoles[0];
    const winnerRole = missingRole === "CHALLENGER" ? "DEFENDER" : "CHALLENGER";
    let result;
    if (match.matchType === "NORMAL") {
      result = match.division === "SUB"
        ? await settleSubNormalMatch({
            matchId: match._id,
            now,
            forcedWinnerRole: winnerRole,
            automaticReason: "REQUIRED_EVIDENCE_NOT_SUBMITTED",
          })
        : await settleMainNormalMatch({
            matchId: match._id,
            now,
            forcedWinnerRole: winnerRole,
            automaticReason: "REQUIRED_EVIDENCE_NOT_SUBMITTED",
          });
    } else {
      result = match.division === "SUB"
        ? await settleSubRevengeNoShow({
            matchId: match._id,
            noShowRole: missingRole,
            now,
            allowEarlyForfeit: true,
          })
        : await settleMainRevengeNoShow({
            matchId: match._id,
            noShowRole: missingRole,
            now,
            allowEarlyForfeit: true,
          });
    }
    if (result?.settled) settled += 1;
  }
  return { scanned: attempts.length, settled, cancelled };
}

async function holdExpiredMatchStarts({ now = new Date(), limit = 100 } = {}) {
  const recovered = await reconcileAutomaticDefenseNoShows({ now, limit });
  const matches = await ArenaMatch.find({
    matchType: { $ne: "REVENGE" },
    status: { $in: ["MATCHED", "READY", "IN_PROGRESS"] },
    startDeadlineAt: { $lt: now },
  })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let settled = 0;
  let cancelled = 0;
  let automaticDefenseNoShowsRecorded = recovered.recorded;
  for (const match of matches) {
    const attempts = await ArenaMatchAttempt.find({ matchId: match._id })
      .select("userId role status")
      .lean();
    const unstarted = attempts.filter((attempt) => attempt.status === "READY");
    if (!unstarted.length && attempts.length) continue;
    if (unstarted.length === 2) {
      const result = match.division === "SUB"
        ? await cancelSubNormalNoStart({ matchId: match._id, now })
        : await cancelMainNormalNoStart({ matchId: match._id, now });
      if (result?.cancelled) cancelled += 1;
      continue;
    }
    if (unstarted.length !== 1) continue;
    const noShowRole = unstarted[0].role;
    const winnerRole = noShowRole === "CHALLENGER" ? "DEFENDER" : "CHALLENGER";
    const result = match.division === "SUB"
      ? await settleSubNormalMatch({
          matchId: match._id,
          now,
          forcedWinnerRole: winnerRole,
          automaticReason: "START_DEADLINE_NO_SHOW",
        })
      : await settleMainNormalMatch({
          matchId: match._id,
          now,
          forcedWinnerRole: winnerRole,
          automaticReason: "START_DEADLINE_NO_SHOW",
        });
    if (result?.settled) {
      settled += 1;
      if (noShowRole === "DEFENDER") {
        const recorded = await recordAutomaticDefenseNoShow({
          matchId: match._id,
          now,
        });
        if (recorded.recorded) automaticDefenseNoShowsRecorded += 1;
      }
    }
  }
  return {
    scanned: matches.length,
    settled,
    cancelled,
    automaticDefenseNoShowsRecorded,
  };
}

async function holdSundayCutoffMatches({ now = new Date(), limit = 500 } = {}) {
  if (!isSundayDivisionLocked(now)) {
    return { scanned: 0, held: 0, divisionLocked: false };
  }
  const matches = await ArenaMatch.find({
    status: {
      $in: ["MATCHED", "READY", "IN_PROGRESS", "SUBMITTED", "RESOLVED"],
    },
  })
    .limit(Math.max(1, Math.min(1000, Number(limit) || 500)))
    .lean();
  let held = 0;
  for (const match of matches) {
    const updated = await ArenaMatch.findOneAndUpdate(
      {
        _id: match._id,
        status: {
          $in: ["MATCHED", "READY", "IN_PROGRESS", "SUBMITTED", "RESOLVED"],
        },
      },
      {
        $set: {
          status: "HELD",
          integrityStatus:
            match.integrityStatus === "SUSPICIOUS"
              ? "SUSPICIOUS"
              : "PENDING",
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) continue;
    await AdminTodo.findOneAndUpdate(
      { sourceType: "ArenaSundayCutoff", sourceId: match._id },
      {
        $setOnInsert: {
          category: "integrity",
          title: "GOAT Arena 일요일 15시 미정산 경기",
          description:
            "일요일 15시까지 정산되지 않아 경기를 보류했습니다. 순위와 학습일 자산은 자동 변경하지 않습니다.",
          href: `/admin/arena-matches#match-${match._id}`,
          targetUserId: match.challenger.userId,
          actorUserId: match.challenger.userId,
          sourceType: "ArenaSundayCutoff",
          sourceId: match._id,
          status: "pending",
          metadata: { previousStatus: match.status },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    held += 1;
  }
  return { scanned: matches.length, held, divisionLocked: true };
}

async function getAdminArenaEvidenceData() {
  // 추가 소명만을 위해 생성한 빈 문서는 '최근 필수 풀이 증거'로 보이지
  // 않게 한다. 원본 풀이 증거가 실제로 제출된 건만 이 요약에 표시한다.
  const evidence = await ArenaMatchEvidence.find({
    originalEvidenceSubmitted: { $ne: false },
    "files.0": { $exists: true },
  })
    .sort({ submittedAt: -1 })
    .limit(300)
    .lean();
  const matchIds = [...new Set(evidence.map((entry) => String(entry.matchId)))];
  const userIds = [...new Set(evidence.map((entry) => String(entry.userId)))];
  const attemptIds = [...new Set(evidence.map((entry) => String(entry.attemptId)))];
  const [matches, users, attempts] = await Promise.all([
    ArenaMatch.find({ _id: { $in: matchIds } }).lean(),
    User.find({ _id: { $in: userIds } }).select("name realName email").lean(),
    ArenaMatchAttempt.find({ _id: { $in: attemptIds } })
      .select(
        "role status score correctCount activeSolveTimeMs questionTimings submittedAt evidenceSubmittedAt"
      )
      .lean(),
  ]);
  const matchById = new Map(matches.map((match) => [String(match._id), match]));
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const attemptById = new Map(
    attempts.map((attempt) => [String(attempt._id), attempt])
  );
  return evidence.map((entry) => ({
    ...entry,
    id: String(entry._id),
    match: matchById.get(String(entry.matchId)) || null,
    user: userById.get(String(entry.userId)) || null,
    attempt: attemptById.get(String(entry.attemptId)) || null,
  }));
}

async function getAdminEvidenceFile({ evidenceId, storedName }) {
  if (!mongoose.isValidObjectId(evidenceId)) {
    throw statusError(404, "풀이 증거를 찾을 수 없습니다.");
  }
  const evidence = await ArenaMatchEvidence.findById(evidenceId).lean();
  if (evidence?.contentPurgedAt) {
    throw statusError(410, "보존 기간이 끝나 풀이 증거 원본이 삭제되었습니다.");
  }
  const file = [
    ...(evidence?.files || []),
    ...(evidence?.supplementalRequest?.files || []),
  ].find(
    (entry) => entry.storedName === path.basename(String(storedName || ""))
  );
  if (!file) throw statusError(404, "풀이 증거 파일을 찾을 수 없습니다.");
  return {
    ...file,
    absolutePath:
      file.storageProvider === "CLOUDINARY"
        ? null
        : path.join(ARENA_EVIDENCE_STORAGE_DIR, file.storedName),
    cloudUrl: signedCloudinaryUrl(file, {
      download: false,
      originalName: file.originalName,
    }),
  };
}

async function purgeExpiredArenaEvidence({ now = new Date(), limit = 100 } = {}) {
  const candidates = await ArenaMatchEvidence.find({
    retentionUntil: { $lte: now },
    contentPurgedAt: null,
    retentionHoldReason: "",
    status: { $in: ["ON_TIME", "REVIEWED"] },
  })
    .sort({ retentionUntil: 1 })
    .limit(Math.max(1, Math.min(1000, Number(limit) || 100)))
    .lean();

  if (!candidates.length) return { scanned: 0, purged: 0, held: 0 };

  const matches = await ArenaMatch.find({
    _id: { $in: candidates.map((entry) => entry.matchId) },
  })
    .select("status integrityStatus")
    .lean();
  const matchById = new Map(matches.map((match) => [String(match._id), match]));
  let purged = 0;
  let held = 0;

  for (const evidence of candidates) {
    const match = matchById.get(String(evidence.matchId));
    if (
      !match ||
      !["SETTLED", "CANCELLED", "INVALID", "INSURED_CANCELLED"].includes(match.status) ||
      match.integrityStatus !== "CLEAR"
    ) {
      held += 1;
      continue;
    }

    const retainedFiles = [
      ...(evidence.files || []),
      ...(evidence.supplementalRequest?.files || []),
    ];
    await Promise.all(
      retainedFiles.map((file) =>
        destroyStoredAsset({
          ...file,
          path: path.join(ARENA_EVIDENCE_STORAGE_DIR, path.basename(file.storedName || "")),
        }).catch(() => {})
      )
    );
    const update = await ArenaMatchEvidence.updateOne(
      {
        _id: evidence._id,
        contentPurgedAt: null,
        retentionHoldReason: "",
      },
      {
        $set: {
          contentPurgedAt: now,
          files: (evidence.files || []).map((file) => ({
            ...file,
            storageProvider: "PURGED",
            cloudPublicId: "",
            cloudResourceType: "",
            cloudDeliveryType: "",
            cloudVersion: null,
            cloudFormat: "",
          })),
          "supplementalRequest.files": (
            evidence.supplementalRequest?.files || []
          ).map((file) => ({
            ...file,
            storageProvider: "PURGED",
            cloudPublicId: "",
            cloudResourceType: "",
            cloudDeliveryType: "",
            cloudVersion: null,
            cloudFormat: "",
          })),
        },
      }
    );
    if (update.modifiedCount > 0) purged += 1;
  }

  return { scanned: candidates.length, purged, held };
}

function startArenaEvidenceRetentionScheduler() {
  if (process.env.DISABLE_SCHEDULERS === "1" || arenaEvidenceRetentionTimer) return null;
  const run = () =>
    withSchedulerLease(
      { name: "ARENA_EVIDENCE_RETENTION", leaseMs: 30 * 60 * 1000 },
      () => purgeExpiredArenaEvidence()
    ).catch((error) => {
      console.error("Arena evidence retention cleanup failed:", error.message);
    });
  const initialTimer = setTimeout(run, 60 * 1000);
  initialTimer.unref?.();
  arenaEvidenceRetentionTimer = setInterval(run, ARENA_EVIDENCE_PURGE_INTERVAL_MS);
  arenaEvidenceRetentionTimer.unref?.();
  return arenaEvidenceRetentionTimer;
}

module.exports = {
  FAST_COMPLETION_REVIEW_THRESHOLD_MS,
  RAPID_CORRECT_ANSWER_REVIEW_COUNT,
  RAPID_CORRECT_ANSWER_THRESHOLD_MS,
  buildEvidenceFiles,
  detectEvidenceAnomalies,
  discardArenaEvidenceFiles,
  getAdminArenaEvidenceData,
  getAdminEvidenceFile,
  getArenaSupplementalEvidenceRequest,
  holdExpiredEvidence,
  holdExpiredMatchStarts,
  holdSundayCutoffMatches,
  purgeExpiredArenaEvidence,
  startArenaEvidenceRetentionScheduler,
  submitArenaMatchEvidence,
  submitArenaSupplementalEvidence,
  timingAnomalyFlags,
  isAtlasTransactionConflict,
  withFreshEvidenceTransaction,
};
