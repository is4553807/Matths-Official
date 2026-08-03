const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { AdminTodo, User } = require("../models/matthsModel");
const {
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
  scoreArenaAttempt,
} = require("./arenaMatchScoringService");
const {
  isSundayDivisionLocked,
} = require("./arenaMatchService");
const {
  destroyStoredAsset,
  signedCloudinaryUrl,
  STORAGE_PURPOSES,
  storageFields,
  storeUploadedFile,
} = require("./fileStorageService");
const { withSchedulerLease } = require("./schedulerLeaseService");

const ARENA_EVIDENCE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ARENA_EVIDENCE_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FAST_COMPLETION_REVIEW_THRESHOLD_MS = 5 * 60 * 1000;
const RAPID_CORRECT_ANSWER_THRESHOLD_MS = 60 * 1000;
const RAPID_CORRECT_ANSWER_REVIEW_COUNT = 3;
let arenaEvidenceRetentionTimer = null;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function discardArenaEvidenceFiles(files = []) {
  await Promise.all(
    files.map(async (file) => {
      if (file?.storageAsset?.storageProvider === "CLOUDINARY") {
        await destroyStoredAsset(file.storageAsset).catch(() => {});
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

async function createEvidenceTodo({ evidence, attempt, flags, session }) {
  if (!flags.length) return;
  await AdminTodo.findOneAndUpdate(
    {
      sourceType: "ArenaMatchEvidence",
      sourceId: evidence._id,
    },
    {
      $setOnInsert: {
        category: "integrity",
        title: "GOAT Arena 풀이 증거 이상 징후",
        description: `자동 감지 항목: ${flags.join(", ")}`,
        href: `/admin/arena-matches#evidence-${evidence._id}`,
        targetUserId: attempt.userId,
        actorUserId: attempt.userId,
        sourceType: "ArenaMatchEvidence",
        sourceId: evidence._id,
        status: "pending",
        metadata: {
          matchId: String(attempt.matchId),
          anomalyFlags: flags,
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
}

async function submitArenaMatchEvidence({
  matchId,
  userId,
  files,
  now = new Date(),
}) {
  if (isSundayDivisionLocked(now)) {
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

  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const [match, attempt] = await Promise.all([
        ArenaMatch.findById(matchId).session(session),
        ArenaMatchAttempt.findOne({ matchId, userId }).session(session),
      ]);
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
      if (!attempt.evidenceDeadlineAt || new Date(attempt.evidenceDeadlineAt) < now) {
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
      const flags = await detectEvidenceAnomalies({
        attempt,
        scoring,
        files: evidenceFiles,
        session,
      });
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
            status: flags.length ? "ANOMALY_FLAGGED" : "ON_TIME",
            anomalyFlags: flags,
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
      if (otherAttempt?.status === "SUBMITTED") {
        match.status = "SUBMITTED";
      }
      if (flags.length) {
        match.integrityStatus = "SUSPICIOUS";
      } else if (
        otherAttempt?.status === "SUBMITTED" &&
        match.integrityStatus !== "SUSPICIOUS"
      ) {
        match.integrityStatus = "CLEAR";
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
      if (flags.length) {
        outbox.push({
          eventType: "ArenaEvidenceAnomalyDetected",
          aggregateType: "ArenaMatchEvidence",
          aggregateId: evidence._id,
          idempotencyKey: `${evidence._id}:ArenaEvidenceAnomalyDetected`,
          payload: { matchId: String(match._id), flags },
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
      await createEvidenceTodo({ evidence, attempt, flags, session });
      result = { evidence, match, replayed: false };
    });
    if (result.replayed) {
      await discardArenaEvidenceFiles(files);
    }
    return {
      evidenceId: String(result.evidence._id),
      status: result.evidence.status,
      matchStatus: result.match.status,
      replayed: result.replayed,
    };
  } catch (error) {
    await discardArenaEvidenceFiles(files);
    throw error;
  } finally {
    await session.endSession();
  }
}

async function holdExpiredEvidence({ now = new Date(), limit = 100 } = {}) {
  const attempts = await ArenaMatchAttempt.find({
    status: "EVIDENCE_REQUIRED",
    evidenceDeadlineAt: { $lt: now },
  })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let held = 0;
  for (const attempt of attempts) {
    const match = await ArenaMatch.findOneAndUpdate(
      {
        _id: attempt.matchId,
        status: { $in: ["READY", "IN_PROGRESS", "SUBMITTED"] },
      },
      {
        $set: {
          status: "HELD",
          integrityStatus: "SUSPICIOUS",
        },
      },
      { returnDocument: "after" }
    );
    if (!match) continue;
    await AdminTodo.findOneAndUpdate(
      { sourceType: "ArenaEvidenceDeadline", sourceId: attempt._id },
      {
        $setOnInsert: {
          category: "integrity",
          title: "GOAT Arena 풀이 증거 미제출",
          description: "마지막 문제 완료 후 1분 안에 풀이 증거가 제출되지 않았습니다.",
          href: `/admin/arena-matches#match-${match._id}`,
          targetUserId: attempt.userId,
          actorUserId: attempt.userId,
          sourceType: "ArenaEvidenceDeadline",
          sourceId: attempt._id,
          status: "pending",
          metadata: { matchId: String(match._id) },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    held += 1;
  }
  return { scanned: attempts.length, held };
}

async function holdExpiredMatchStarts({ now = new Date(), limit = 100 } = {}) {
  const matches = await ArenaMatch.find({
    matchType: { $ne: "REVENGE" },
    status: { $in: ["MATCHED", "READY", "IN_PROGRESS"] },
    startDeadlineAt: { $lt: now },
  })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let held = 0;
  for (const match of matches) {
    const attempts = await ArenaMatchAttempt.find({ matchId: match._id })
      .select("userId role status")
      .lean();
    const unstarted = attempts.filter((attempt) => attempt.status === "READY");
    if (!unstarted.length && attempts.length) continue;
    const noShowRole =
      unstarted.length !== 1 ? "BOTH" : unstarted[0].role;
    const updated = await ArenaMatch.findOneAndUpdate(
      {
        _id: match._id,
        status: { $in: ["MATCHED", "READY", "IN_PROGRESS"] },
      },
      { $set: { status: "HELD", noShowRole } },
      { returnDocument: "after" }
    );
    if (!updated) continue;
    const target = unstarted[0]?.userId || match.defender.userId;
    await AdminTodo.findOneAndUpdate(
      { sourceType: "ArenaMatchNoShow", sourceId: match._id },
      {
        $setOnInsert: {
          category: "integrity",
          title: "GOAT Arena 24시간 미시작 경기",
          description: `미시작 역할: ${noShowRole}. 경제적 불이익 확정 전까지 경기 정산을 보류합니다.`,
          href: `/admin/arena-matches#match-${match._id}`,
          targetUserId: target,
          actorUserId: target,
          sourceType: "ArenaMatchNoShow",
          sourceId: match._id,
          status: "pending",
          metadata: { noShowRole },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    await ArenaOutboxEvent.findOneAndUpdate(
      { idempotencyKey: `${match._id}:ArenaMatchNoShowDetected` },
      {
        $setOnInsert: {
          eventType: "ArenaMatchNoShowDetected",
          aggregateType: "ArenaMatch",
          aggregateId: match._id,
          idempotencyKey: `${match._id}:ArenaMatchNoShowDetected`,
          payload: { noShowRole },
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    held += 1;
  }
  return { scanned: matches.length, held };
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
  const evidence = await ArenaMatchEvidence.find()
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
  const file = evidence?.files?.find(
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

    await Promise.all(
      (evidence.files || []).map((file) =>
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
          "files.$[].storageProvider": "PURGED",
          "files.$[].cloudPublicId": "",
          "files.$[].cloudResourceType": "",
          "files.$[].cloudDeliveryType": "",
          "files.$[].cloudVersion": null,
          "files.$[].cloudFormat": "",
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
  holdExpiredEvidence,
  holdExpiredMatchStarts,
  holdSundayCutoffMatches,
  purgeExpiredArenaEvidence,
  startArenaEvidenceRetentionScheduler,
  submitArenaMatchEvidence,
  timingAnomalyFlags,
};
