const {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} = require("node:crypto");
const mongoose = require("mongoose");
const { AdminActionLog, User, UserNotification } = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaPackagePayment,
} = require("../models/goatArenaModel");
const { PaybackPayoutRecord } = require("../models/paybackModel");
const { getActiveAdminSender } = require("./adminIdentityService");
const { sendAdminUserEmail } = require("./emailService");

const PAGE_SIZE = 20;

function statusError(status, message, code = "") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function encryptionKey() {
  const secret =
    process.env.PAYBACK_ACCOUNT_ENCRYPTION_KEY || process.env.SECRET || "";
  if (!secret) {
    throw statusError(
      503,
      "페이백 계좌 암호화 설정이 준비되지 않았습니다.",
      "PAYBACK_ACCOUNT_ENCRYPTION_KEY_REQUIRED"
    );
  }
  return createHash("sha256").update(String(secret)).digest();
}

function cleanAccountNumber(value) {
  const number = String(value || "").replace(/[^0-9]/g, "");
  if (number.length < 8 || number.length > 20) {
    throw statusError(400, "계좌번호를 숫자 8~20자리로 정확히 입력해주세요.");
  }
  return number;
}

function cleanSingleLine(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function paybackCompletionEmailMessage({ user, payoutRecord }) {
  const amountLabel = new Intl.NumberFormat("ko-KR").format(Number(payoutRecord.amount));
  return [
    `${String(user?.realName || user?.name || "회원")}님, 페이백 지급이 완료되었습니다.`,
    `지급액: ${amountLabel}원 (${Number(payoutRecord.paybackRate)}%)`,
    `지급 계좌: ${String(payoutRecord.bankName)} 계좌 (끝 ${String(payoutRecord.accountNumberLast4)})`,
    `처리 시각: ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" }).format(new Date(payoutRecord.completedAt))}`,
    "Matths와 GOAT Arena 우편함에서도 같은 내용을 확인할 수 있습니다.",
  ].join("\n");
}

async function attemptPaybackCompletionEmail({
  payoutRecord,
  user,
  actor,
  now = new Date(),
  sendEmailFn = sendAdminUserEmail,
}) {
  let delivered = false;
  let errorMessage = "";
  let providerMessageId = "";
  try {
    const delivery = await sendEmailFn({
      to: user.email,
      fromAddress: actor.email,
      subject: "페이백 지급 완료",
      message: paybackCompletionEmailMessage({ user, payoutRecord }),
      idempotencyKey: `payback-payout:${payoutRecord._id}`,
    });
    delivered = delivery?.delivered === true;
    providerMessageId = String(delivery?.providerMessageId || "");
  } catch (error) {
    errorMessage = String(error?.message || "이메일 발송 실패").slice(0, 1000);
  }
  try {
    await PaybackPayoutRecord.updateOne(
      { _id: payoutRecord._id },
      {
        $set: {
          emailStatus: delivered ? "SENT" : "FAILED",
          emailAttemptedAt: now,
          emailDeliveredAt: delivered ? now : null,
          emailProviderMessageId: providerMessageId,
          emailLastError: errorMessage,
        },
      }
    );
  } catch (statusError) {
    console.error("[payback] 지급 완료 이메일 상태 저장 실패", {
      payoutRecordId: String(payoutRecord._id),
      message: statusError?.message || "",
    });
  }
  return { delivered, errorMessage, providerMessageId };
}

function validatePaybackAccountInput(input = {}) {
  const bankName = cleanSingleLine(input.bankName, 40);
  const accountHolderName = cleanSingleLine(input.accountHolderName, 40);
  const accountNumber = cleanAccountNumber(input.accountNumber);
  if (!bankName) throw statusError(400, "은행을 선택하거나 입력해주세요.");
  if (accountHolderName.length < 2) {
    throw statusError(400, "예금주 이름을 정확히 입력해주세요.");
  }
  return { bankName, accountHolderName, accountNumber };
}

function encryptAccountNumber(accountNumber) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
  ]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptAccountNumber(account = {}) {
  if (
    !account.accountNumberEncrypted ||
    !account.accountNumberIv ||
    !account.accountNumberTag
  ) {
    return "";
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(account.accountNumberIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(account.accountNumberTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(account.accountNumberEncrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function getPaybackAccountSummary(userId) {
  const user = await User.findById(userId)
    .select("paybackAccount.status paybackAccount.bankName paybackAccount.accountNumberLast4 paybackAccount.confirmedAt")
    .lean();
  if (!user) throw statusError(404, "사용자 계정을 찾을 수 없습니다.");
  const account = user.paybackAccount || {};
  return {
    confirmed: account.status === "CONFIRMED",
    bankName: String(account.bankName || ""),
    last4: String(account.accountNumberLast4 || ""),
    confirmedAt: account.confirmedAt || null,
  };
}

async function saveConfirmedPaybackAccount(userId, input) {
  const value = validatePaybackAccountInput(input);
  const ciphertext = encryptAccountNumber(value.accountNumber);
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "paybackAccount.status": "CONFIRMED",
        "paybackAccount.bankName": value.bankName,
        "paybackAccount.accountHolderName": value.accountHolderName,
        "paybackAccount.accountNumberEncrypted": ciphertext.encrypted,
        "paybackAccount.accountNumberIv": ciphertext.iv,
        "paybackAccount.accountNumberTag": ciphertext.tag,
        "paybackAccount.accountNumberLast4": value.accountNumber.slice(-4),
        "paybackAccount.confirmedAt": new Date(),
        "paybackAccount.updatedAt": new Date(),
      },
    },
    { returnDocument: "after" }
  ).lean();
  if (!user) throw statusError(404, "사용자 계정을 찾을 수 없습니다.");
  return getPaybackAccountSummary(userId);
}

function monthBounds(periodKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || ""));
  const nowParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const parts = Object.fromEntries(
    nowParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const year = match ? Number(match[1]) : Number(parts.year);
  const month = match ? Number(match[2]) : Number(parts.month);
  const safeMonth = Math.max(1, Math.min(12, month));
  const start = new Date(Date.UTC(year, safeMonth - 1, 1, -9));
  const end = new Date(Date.UTC(year, safeMonth, 1, -9));
  return {
    periodKey: `${year}-${String(safeMonth).padStart(2, "0")}`,
    start,
    end,
  };
}

async function getAdminPaybackDashboard({ page = 1, periodKey } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const range = monthBounds(periodKey);
  const eligibleQuery = {
    paybackPayoutStatus: "PENDING",
    paybackAmount: { $gt: 0 },
  };
  const [totalEligible, cycles, eligibleUserIds, pendingTotals, monthlySales, monthlyPayouts, history] =
    await Promise.all([
      AccessCycle.countDocuments(eligibleQuery),
      AccessCycle.find(eligibleQuery)
        .sort({ evaluatedAt: 1, _id: 1 })
        .skip((safePage - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate({
          path: "userId",
          select:
            "name realName email paybackAccount.status paybackAccount.bankName +paybackAccount.accountHolderName +paybackAccount.accountNumberEncrypted +paybackAccount.accountNumberIv +paybackAccount.accountNumberTag paybackAccount.accountNumberLast4 paybackAccount.confirmedAt",
        })
        .lean(),
      AccessCycle.distinct("userId", eligibleQuery),
      AccessCycle.aggregate([
        { $match: eligibleQuery },
        { $group: { _id: null, amount: { $sum: "$paybackAmount" } } },
      ]),
      ArenaPackagePayment.aggregate([
        {
          $match: {
            approvedAt: { $gte: range.start, $lt: range.end },
            status: { $in: ["APPROVED", "APPLIED"] },
          },
        },
        { $group: { _id: null, amount: { $sum: "$approvedAmount" }, count: { $sum: 1 } } },
      ]),
      PaybackPayoutRecord.aggregate([
        {
          $match: {
            completedAt: { $gte: range.start, $lt: range.end },
            status: "COMPLETED",
          },
        },
        { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PaybackPayoutRecord.find({
        completedAt: { $gte: range.start, $lt: range.end },
      })
        .sort({ completedAt: -1 })
        .limit(100)
        .populate("userId", "name realName email")
        .populate("completedBy", "name realName email")
        .lean(),
    ]);

  const rows = cycles.map((cycle) => {
    const user = cycle.userId || {};
    const account = user.paybackAccount || {};
    let accountNumber = "";
    let decryptError = false;
    if (account.status === "CONFIRMED") {
      try {
        accountNumber = decryptAccountNumber(account);
      } catch (_error) {
        decryptError = true;
      }
    }
    return {
      cycleId: String(cycle._id),
      userId: String(user._id || ""),
      userName: String(user.realName || user.name || "사용자"),
      email: String(user.email || ""),
      paybackRate: Number(cycle.paybackRate || 0),
      paybackAmount: Number(cycle.paybackAmount || 0),
      evaluatedAt: cycle.evaluatedAt || cycle.updatedAt,
      accountConfirmed: account.status === "CONFIRMED" && Boolean(accountNumber),
      bankName: String(account.bankName || ""),
      accountHolderName: String(account.accountHolderName || ""),
      accountNumber,
      accountNumberLast4: String(account.accountNumberLast4 || ""),
      decryptError,
    };
  });
  const linkedCount = await User.countDocuments({
    _id: { $in: eligibleUserIds },
    "paybackAccount.status": "CONFIRMED",
  });
  const sale = monthlySales[0] || {};
  const payout = monthlyPayouts[0] || {};
  return {
    periodKey: range.periodKey,
    rows,
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total: totalEligible,
      totalPages: Math.max(1, Math.ceil(totalEligible / PAGE_SIZE)),
    },
    eligible: {
      total: totalEligible,
      linkedTotal: linkedCount,
      payoutRate: totalEligible
        ? Math.round((linkedCount / totalEligible) * 1000) / 10
        : 0,
      pendingAmount: Number(pendingTotals[0]?.amount || 0),
    },
    monthly: {
      salesAmount: Number(sale.amount || 0),
      salesCount: Number(sale.count || 0),
      payoutAmount: Number(payout.amount || 0),
      payoutCount: Number(payout.count || 0),
      payoutToSalesRate: Number(sale.amount || 0)
        ? Math.round((Number(payout.amount || 0) / Number(sale.amount)) * 1000) / 10
        : 0,
    },
    history,
  };
}

async function completePaybackPayout({
  cycleId,
  adminUserId,
  operatorNote = "",
  now = new Date(),
  sendEmailFn = sendAdminUserEmail,
}) {
  const note = cleanSingleLine(operatorNote, 500);
  if (note.length < 2) {
    throw statusError(400, "실제 송금 확인 메모 또는 거래 기록을 2자 이상 입력해주세요.");
  }
  const actor = await getActiveAdminSender(adminUserId);
  const session = await mongoose.startSession();
  let cycle;
  let user;
  let payoutRecord;
  try {
    await session.withTransaction(async () => {
      cycle = await AccessCycle.findOne({
        _id: cycleId,
        paybackPayoutStatus: "PENDING",
        paybackAmount: { $gt: 0 },
      })
        .session(session)
        .lean();
      if (!cycle) {
        throw statusError(409, "이미 처리했거나 지급 대상이 아닌 페이백입니다.");
      }
      user = await User.findById(cycle.userId)
        .select(
          "name realName email paybackAccount.status paybackAccount.bankName +paybackAccount.accountHolderName +paybackAccount.accountNumberEncrypted +paybackAccount.accountNumberIv +paybackAccount.accountNumberTag paybackAccount.accountNumberLast4"
        )
        .session(session)
        .lean();
      const account = user?.paybackAccount || {};
      if (account.status !== "CONFIRMED" || !decryptAccountNumber(account)) {
        throw statusError(409, "사용자가 확인한 페이백 계좌가 없어 지급 완료로 처리할 수 없습니다.");
      }

      const notificationId = new mongoose.Types.ObjectId();
      [payoutRecord] = await PaybackPayoutRecord.create(
        [{
          cycleId: cycle._id,
          userId: cycle.userId,
          amount: Number(cycle.paybackAmount),
          paybackRate: Number(cycle.paybackRate),
          bankName: account.bankName,
          accountNumberLast4: account.accountNumberLast4,
          completedAt: now,
          completedBy: adminUserId,
          completedBySnapshot: { name: actor.name, email: actor.email },
          siteNotificationId: notificationId,
          emailStatus: "PENDING",
          operatorNote: note,
        }],
        { session }
      );
      const update = await AccessCycle.updateOne(
        { _id: cycle._id, paybackPayoutStatus: "PENDING" },
        {
          $set: {
            paybackPayoutStatus: "COMPLETED",
            paybackPayoutCompletedAt: now,
          },
        },
        { session }
      );
      if (update.modifiedCount !== 1) {
        throw statusError(409, "다른 운영자가 먼저 처리했습니다. 목록을 새로고침해주세요.");
      }

      const amountLabel = new Intl.NumberFormat("ko-KR").format(Number(cycle.paybackAmount));
      await UserNotification.create(
        [{
          _id: notificationId,
          userId: cycle.userId,
          title: "페이백 지급이 완료되었습니다.",
          message: `운영자가 실제 송금을 확인했습니다. 페이백 ${amountLabel}원(${Number(cycle.paybackRate)}%)이 등록하신 ${account.bankName} 계좌(끝 ${account.accountNumberLast4})로 지급 완료되었습니다.`,
          href: "/goat-arena/profile",
          dedupeKey: `payback-payout:${payoutRecord._id}`,
          sourceType: "PaybackPayoutRecord",
          sourceId: payoutRecord._id,
          metadata: {
            amount: Number(cycle.paybackAmount),
            paybackRate: Number(cycle.paybackRate),
            bankName: String(account.bankName || ""),
            accountNumberLast4: String(account.accountNumberLast4 || ""),
            completedAt: now,
          },
          kind: "admin",
          tone: "success",
          createdBy: adminUserId,
        }],
        { session }
      );
      await AdminActionLog.create(
        [{
          adminUserId,
          targetUserId: cycle.userId,
          action: "finance.payback-completed",
          detail: note,
          metadata: {
            cycleId: String(cycle._id),
            payoutRecordId: String(payoutRecord._id),
            siteNotificationId: String(notificationId),
            amount: Number(cycle.paybackAmount),
            emailStatus: "PENDING",
            actorSnapshot: actor,
          },
        }],
        { session }
      );
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      throw statusError(409, "다른 운영자가 먼저 처리했습니다. 목록을 새로고침해주세요.");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const email = await attemptPaybackCompletionEmail({
    payoutRecord,
    user,
    actor,
    now,
    sendEmailFn,
  });
  try {
    await AdminActionLog.updateOne(
      { action: "finance.payback-completed", "metadata.payoutRecordId": String(payoutRecord._id) },
      {
        $set: {
          "metadata.emailStatus": email.delivered ? "SENT" : "FAILED",
          "metadata.emailProviderMessageId": email.providerMessageId,
          "metadata.emailLastError": email.errorMessage,
        },
      }
    );
  } catch (auditStatusError) {
    console.error("[payback] 지급 완료 이메일 감사 상태 저장 실패", {
      payoutRecordId: String(payoutRecord._id),
      message: auditStatusError?.message || "",
    });
  }

  return {
    cycleId: String(cycle._id),
    payoutRecordId: String(payoutRecord._id),
    siteNotificationCreated: true,
    emailDelivered: email.delivered,
  };
}

async function resendPaybackPayoutEmail({
  payoutRecordId,
  adminUserId,
  now = new Date(),
  sendEmailFn = sendAdminUserEmail,
}) {
  const actor = await getActiveAdminSender(adminUserId);
  const payoutRecord = await PaybackPayoutRecord.findOne({
    _id: payoutRecordId,
    status: "COMPLETED",
  })
    .populate("userId", "name realName email")
    .lean();
  if (!payoutRecord || !payoutRecord.userId?.email) {
    throw statusError(404, "재발송할 페이백 지급 기록 또는 사용자 이메일을 찾을 수 없습니다.");
  }
  const amountLabel = new Intl.NumberFormat("ko-KR").format(Number(payoutRecord.amount));
  const siteNotification = await UserNotification.findOneAndUpdate(
    { dedupeKey: `payback-payout:${payoutRecord._id}` },
    {
      $setOnInsert: {
        userId: payoutRecord.userId._id,
        title: "페이백 지급이 완료되었습니다.",
        message: `운영자가 실제 송금을 확인했습니다. 페이백 ${amountLabel}원(${Number(payoutRecord.paybackRate)}%)이 등록하신 ${payoutRecord.bankName} 계좌(끝 ${payoutRecord.accountNumberLast4})로 지급 완료되었습니다.`,
        href: "/goat-arena/profile",
        sourceType: "PaybackPayoutRecord",
        sourceId: payoutRecord._id,
        metadata: {
          amount: Number(payoutRecord.amount),
          paybackRate: Number(payoutRecord.paybackRate),
          bankName: String(payoutRecord.bankName || ""),
          accountNumberLast4: String(payoutRecord.accountNumberLast4 || ""),
          completedAt: payoutRecord.completedAt,
        },
        kind: "admin",
        tone: "success",
        createdBy: adminUserId,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();
  if (!payoutRecord.siteNotificationId) {
    await PaybackPayoutRecord.updateOne(
      { _id: payoutRecord._id },
      { $set: { siteNotificationId: siteNotification._id } }
    );
  }
  const email = await attemptPaybackCompletionEmail({
    payoutRecord,
    user: payoutRecord.userId,
    actor,
    now,
    sendEmailFn,
  });
  await AdminActionLog.create({
    adminUserId,
    targetUserId: payoutRecord.userId._id,
    action: "finance.payback-email-resent",
    detail: email.delivered ? "페이백 지급 완료 이메일 재발송 성공" : "페이백 지급 완료 이메일 재발송 실패",
    metadata: {
      payoutRecordId: String(payoutRecord._id),
      siteNotificationId: String(siteNotification._id),
      emailStatus: email.delivered ? "SENT" : "FAILED",
      emailProviderMessageId: email.providerMessageId,
      emailLastError: email.errorMessage,
      actorSnapshot: actor,
    },
  });
  return { emailDelivered: email.delivered };
}

module.exports = {
  completePaybackPayout,
  getAdminPaybackDashboard,
  getPaybackAccountSummary,
  paybackCompletionEmailMessage,
  resendPaybackPayoutEmail,
  saveConfirmedPaybackAccount,
  validatePaybackAccountInput,
};
