const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const root = path.resolve(__dirname, "..");
const views = path.join(root, "views");
const admin = {
  id: "507f1f77bcf86cd799439011",
  name: "admin-login-name",
  realName: "홍길동",
  email: "account1@matths.kr",
  role: "admin",
};

async function render(name, locals) {
  return ejs.renderFile(path.join(views, name), {
    adminTodoSummary: { pendingCount: 0, items: [] },
    publicContactEmail: "admin@lsbproduction.com",
    ...locals,
  });
}

async function main() {
  const dashboard = await render("admin-dashboard.ejs", {
    user: admin,
    feedback: null,
    error: null,
    oldInput: null,
    adminData: {
      stats: { activeUsers: 1, activeParents: 0, pendingInquiries: 0, publishedAnnouncements: 0, archiveItems: 0, archiveFolders: 0 },
      inquiries: [],
      announcements: [],
      revenue: {
        grossPayments: 29000,
        cumulativePaybackPaid: 0,
        paybackReserve: 29000,
        confirmedUnpaidPayback: 0,
        pgFeeReserve: 0,
        otherUnpaidCosts: 0,
        actualCashBalance: 29000,
        cumulativeConfirmedProfit: 0,
        cumulativeWithdrawals: 0,
        withdrawableAmount: 0,
        pgFeeReserveBps: 0,
        withdrawalsEnabled: false,
        recentWithdrawals: [],
        updatedAt: new Date(),
      },
    },
  });
  assert.match(dashboard, /현재 출금가능액/);
  assert.match(dashboard, /미확정 페이백 금액은 이익에서 제외/);
  assert.match(dashboard, /홍길동 관리자/);
  assert.doesNotMatch(dashboard, /admin-login-name 관리자/);

  const sanctions = await render("admin-user-sanctions.ejs", {
    user: admin,
    sanctions: {
      rows: [{
        _id: "log-1",
        action: "user.account-status",
        actionLabel: "계정 상태 변경",
        detail: "운영 규정 위반",
        createdAt: new Date(),
        actor: admin,
        target: { _id: "507f1f77bcf86cd799439012", name: "사용자", email: "user@matths.kr" },
      }],
      pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 },
    },
  });
  assert.match(sanctions, /account1@matths\.kr/);
  assert.match(sanctions, /페이지당 20건/);

  const auditLog = await render("admin-audit-log.ejs", {
    user: admin,
    audit: {
      rows: [{
        _id: "audit-1",
        action: "finance.payback-completed",
        actionLabel: "페이백 지급 완료",
        detail: "실제 송금 확인",
        createdAt: new Date(),
        actor: admin,
        target: { _id: "507f1f77bcf86cd799439012", name: "사용자", email: "user@matths.kr" },
        metadata: {
          actorSnapshot: {
            name: "홍길동",
            email: "account1@matths.kr",
            loginAt: new Date("2026-08-12T09:00:00+09:00"),
          },
        },
      }],
      admins: [admin],
      filters: { adminUserId: "", query: "" },
      pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 },
    },
  });
  assert.match(auditLog, /운영 감사 로그/);
  assert.match(auditLog, /관리자 로그인/);
  assert.match(auditLog, /account1@matths\.kr/);
  assert.doesNotMatch(auditLog, /finance\.payback-completed|HTTP 200|12ms/);
  assert.match(auditLog, /페이지당 20건/);

  const paybacks = await render("admin-paybacks.ejs", {
    user: admin,
    feedback: "페이백 지급 완료, 우편함 알림 생성과 이메일 발송을 모두 처리했습니다.",
    feedbackTone: "success",
    paybacks: {
      periodKey: "2026-08",
      rows: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      eligible: { total: 0, linkedTotal: 0, payoutRate: 0, pendingAmount: 0 },
      monthly: { salesAmount: 29000, salesCount: 1, payoutAmount: 14500, payoutCount: 1, payoutToSalesRate: 50 },
      history: [{
        _id: "507f1f77bcf86cd799439099",
        completedAt: new Date(),
        userId: { name: "사용자", email: "user@matths.kr" },
        completedBy: admin,
        paybackRate: 50,
        amount: 14500,
        bankName: "은행",
        accountNumberLast4: "1234",
        siteNotificationId: "507f1f77bcf86cd799439098",
        emailStatus: "SENT",
        operatorNote: "실제 송금 확인",
      }],
    },
  });
  assert.match(paybacks, /송금 확인 및 지급 완료|현재 지급 대기 중인 페이백/);
  assert.match(paybacks, /우편함 완료/);
  assert.match(paybacks, /이메일 발송 완료/);

  const parentRequest = await render("parent-payment-request.ejs", {
    user: { name: "학생", role: "student" },
    product: { name: "GOAT Arena" },
    feedback: "이메일을 보냈습니다.",
    feedbackTone: "success",
    oldInput: { parentEmail: "" },
  });
  assert.doesNotMatch(parentRequest, /로컬 개발|확인용 링크|preview/i);

  const reset = await render("password-reset.ejs", {
    step: "verify",
    error: null,
    email: "user@matths.kr",
  });
  assert.doesNotMatch(reset, /로컬 개발|인증코드:\s*<strong>/);

  for (const legalView of ["terms.ejs", "privacy.ejs"]) {
    const html = await render(legalView, { user: null });
    assert.match(html, /admin@lsbproduction\.com/);
    assert.doesNotMatch(html, /support@matths\.kr|운영 전 확인 사항/);
  }

  console.log("Launch view rendering verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
