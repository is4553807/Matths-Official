const {
  AdminTodo,
  User,
} = require("../models/matthsModel");
const {
  Academy,
  AcademyAttendanceSession,
  AcademyInvite,
  AcademyStaff,
} = require("../models/academyModel");
const {
  createAdminTodo,
} = require("./adminTodoService");
const {
  sendAdminUserEmail,
} = require("./emailService");
const {
  withSchedulerLease,
} = require("./schedulerLeaseService");

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTRACT_REMINDER_DAYS = 14;
const DEFAULT_SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

let schedulerTimer = null;
let schedulerRunning = false;

function formatKstDay(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function contractTodoSourceType(contractEndsAt) {
  return `AcademyContractExpiry-${new Date(contractEndsAt).getTime()}`;
}

function publicBaseUrl() {
  const candidate = String(
    process.env.PUBLIC_BASE_URL ||
      process.env.APP_BASE_URL ||
      "https://www.matths.kr"
  ).trim();
  try {
    return new URL(candidate).origin;
  } catch (_error) {
    return "https://www.matths.kr";
  }
}

async function archiveAcademyForContractEnd({
  academyId,
  now = new Date(),
  reason = "CONTRACT_EXPIRED",
}) {
  const academy = await Academy.findOneAndUpdate(
    {
      _id: academyId,
      status: { $in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    [
      {
        $set: {
          statusBeforeArchive: "$status",
          status: "ARCHIVED",
          archivedAt: now,
          archiveReason: reason,
          contractExpiredAt:
            reason === "CONTRACT_EXPIRED" ? now : "$contractExpiredAt",
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true }
  ).lean();
  if (!academy) return null;

  await Promise.all([
    AcademyAttendanceSession.updateMany(
      {
        academyId: academy._id,
        startsAt: { $gt: now },
        status: { $in: ["SCHEDULED", "OPEN"] },
      },
      {
        $set: {
          status: "CANCELED",
          canceledAt: now,
          closedAt: now,
          cancellationReason: reason,
        },
      }
    ),
    AcademyInvite.updateMany(
      { academyId: academy._id, status: "ACTIVE" },
      { $set: { status: "REVOKED" } }
    ),
    AdminTodo.updateMany(
      {
        sourceId: academy._id,
        sourceType: /^AcademyContractExpiry-/,
        status: "pending",
      },
      {
        $set: {
          status: "completed",
          completedAt: now,
          completedBy: null,
        },
      }
    ),
  ]);
  return academy;
}

async function synchronizeOwnedAcademyContract({
  teacherUserId,
  role,
  contractEndsAt = null,
  now = new Date(),
}) {
  const owner = await AcademyStaff.findOne({
    userId: teacherUserId,
    role: "OWNER",
    status: "ACTIVE",
  })
    .select("academyId")
    .lean();
  if (!owner?.academyId) return null;

  if (role !== "teacher") {
    return archiveAcademyForContractEnd({
      academyId: owner.academyId,
      now,
      reason: "TEACHER_ACCESS_REVOKED",
    });
  }

  const endsAt = new Date(contractEndsAt);
  const academy = await Academy.findById(owner.academyId).lean();
  if (!academy) return null;
  const restoreStatus =
    academy.status === "ARCHIVED" &&
    ["CONTRACT_EXPIRED", "TEACHER_ACCESS_REVOKED"].includes(academy.archiveReason)
      ? academy.statusBeforeArchive === "PAUSED"
        ? "PAUSED"
        : academy.statusBeforeArchive === "PENDING"
          ? "PENDING"
          : "ACTIVE"
      : academy.status;

  return Academy.findByIdAndUpdate(
    academy._id,
    {
      $set: {
        status: restoreStatus,
        contractStartsAt: academy.contractStartsAt || now,
        contractEndsAt: endsAt,
        contractReminderSentAt: null,
        contractReminderForEndsAt: null,
        contractExpiredAt: null,
        archivedAt: null,
        archiveReason: null,
        statusBeforeArchive: null,
        planCode: "ACADEMY_MOCK_INCLUDED",
        includesMockExam: true,
      },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
}

async function ensureContractReminder(
  academy,
  now = new Date(),
  { sendEmail = sendAdminUserEmail } = {}
) {
  const ownerStaff = await AcademyStaff.findOne({
    academyId: academy._id,
    role: "OWNER",
    status: "ACTIVE",
  })
    .select("userId")
    .lean();
  const owner = ownerStaff
    ? await User.findById(ownerStaff.userId)
        .select("email name realName")
        .lean()
    : null;
  const expiryLabel = formatKstDay(academy.contractEndsAt);
  const sourceType = contractTodoSourceType(academy.contractEndsAt);

  await createAdminTodo({
    category: "other",
    title: `${academy.name} 계약 만료 2주 전 확인`,
    description: `${academy.name} 학원 계약이 ${expiryLabel}에 만료됩니다. 갱신 여부를 확인해주세요.`,
    href: `/admin/academies/${academy._id}#academy-contract`,
    targetUserId: ownerStaff?.userId || academy.createdByUserId,
    actorUserId: null,
    sourceType,
    sourceId: academy._id,
    metadata: {
      academyId: String(academy._id),
      academyName: academy.name,
      contractEndsAt: academy.contractEndsAt,
    },
    createdAt: now,
    refreshExisting: true,
  });

  if (!owner?.email) return { emailed: false, reason: "OWNER_EMAIL_MISSING" };
  const alreadySent =
    academy.contractReminderForEndsAt &&
    new Date(academy.contractReminderForEndsAt).getTime() ===
      new Date(academy.contractEndsAt).getTime();
  if (alreadySent) return { emailed: false, reason: "ALREADY_SENT" };

  await sendEmail({
    to: owner.email,
    subject: `${academy.name} Matths 학원 계약 만료 예정 안내`,
    message: [
      `${owner.realName || owner.name || "원장"}님, ${academy.name}의 Matths 학원 계약이 2주 이내에 만료됩니다.`,
      `계약 만료일: ${expiryLabel}`,
      "만료 뒤에는 교사·학생의 학원 기능이 중단되고 기존 학원 데이터는 운영자 전용 보관 상태로 전환됩니다.",
      "계속 이용하려면 만료 전에 Matths 운영팀과 갱신을 진행해주세요.",
    ].join("\n"),
    idempotencyKey: `academy-contract:${academy._id}:${new Date(academy.contractEndsAt).getTime()}`,
    actionLabel: "학원 계약 정보 확인",
    actionUrl: `${publicBaseUrl()}/academy`,
  });
  await Academy.updateOne(
    { _id: academy._id, contractEndsAt: academy.contractEndsAt },
    {
      $set: {
        contractReminderSentAt: now,
        contractReminderForEndsAt: academy.contractEndsAt,
      },
    }
  );
  return { emailed: true, reason: null };
}

async function processAcademyContracts({
  now = new Date(),
  sendReminders = true,
} = {}) {
  const expired = await Academy.find({
    status: { $in: ["PENDING", "ACTIVE", "PAUSED"] },
    contractEndsAt: { $ne: null, $lte: now },
  })
    .select("_id")
    .lean();
  let archived = 0;
  for (const academy of expired) {
    if (
      await archiveAcademyForContractEnd({
        academyId: academy._id,
        now,
      })
    ) {
      archived += 1;
    }
  }

  const summary = { archived, reminded: 0, reminderFailed: 0 };
  if (!sendReminders) return summary;
  const reminderLimit = new Date(now.getTime() + CONTRACT_REMINDER_DAYS * DAY_MS);
  const due = await Academy.find({
    status: { $in: ["PENDING", "ACTIVE", "PAUSED"] },
    contractEndsAt: { $gt: now, $lte: reminderLimit },
  }).lean();
  for (const academy of due) {
    try {
      const result = await ensureContractReminder(academy, now);
      if (result.emailed) summary.reminded += 1;
    } catch (error) {
      summary.reminderFailed += 1;
      console.error(`학원 ${academy._id} 계약 만료 예정 알림 실패:`, error);
    }
  }
  return summary;
}

async function runAcademyContractSchedule() {
  if (schedulerRunning) return null;
  schedulerRunning = true;
  try {
    return await processAcademyContracts();
  } finally {
    schedulerRunning = false;
  }
}

function startAcademyContractScheduler({
  intervalMs = DEFAULT_SCHEDULER_INTERVAL_MS,
} = {}) {
  if (schedulerTimer) return schedulerTimer;
  const run = () =>
    withSchedulerLease(
      {
        name: "ACADEMY_CONTRACT_LIFECYCLE",
        leaseMs: 10 * 60 * 1000,
      },
      runAcademyContractSchedule
    );
  run().catch((error) => {
    console.error("학원 계약 수명주기 초기 실행 실패:", error);
  });
  schedulerTimer = setInterval(() => {
    run().catch((error) => {
      console.error("학원 계약 수명주기 스케줄 실패:", error);
    });
  }, Math.max(Number(intervalMs) || 0, 60 * 1000));
  schedulerTimer.unref?.();
  return schedulerTimer;
}

function stopAcademyContractScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

module.exports = {
  CONTRACT_REMINDER_DAYS,
  DEFAULT_SCHEDULER_INTERVAL_MS,
  archiveAcademyForContractEnd,
  contractTodoSourceType,
  ensureContractReminder,
  processAcademyContracts,
  runAcademyContractSchedule,
  startAcademyContractScheduler,
  stopAcademyContractScheduler,
  synchronizeOwnedAcademyContract,
};
