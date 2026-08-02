const assert =
  require("node:assert/strict");
const fs = require("node:fs");
const path =
  require("node:path");
const {
  CommunityComment,
  CommunityPost,
  CommunityVote,
  ArchiveFolder,
  NicknameChangeRequest,
  PasswordResetCode,
  ProblemAttempt,
  User,
  UserNotification,
  PrivateMockExam,
  PrivateMockExamAttempt,
  PrivateMockIntegrityCase,
  PrivateMockUploadReminder,
} = require("../models/matthsModel");
const {
  formatAdminMath,
} = require("../services/mathTextService");
const {
  repairUploadFilename,
} = require("../services/archiveService");
const {
  BOARD_LABELS,
  COMMUNITY_PAGE_SIZE,
} = require("../services/communityService");
const {
  TODO_PAGE_SIZE,
} = require("../services/adminTodoService");
const {
  NOTIFICATIONS_PER_PAGE,
} = require("../services/notificationService");
const {
  normalizeAdminEmailSubject,
} = require("../services/emailService");
const {
  getKoreanWeekTitle,
  getSundayReleaseAt,
} = require("../services/privateMockExamService");

const root = path.join(
  __dirname,
  ".."
);

assert.ok(
  ArchiveFolder.schema.path(
    "parentFolderId"
  ),
  "ArchiveFolder.parentFolderId 필드가 없습니다."
);
const read = (file) =>
  fs.readFileSync(
    path.join(root, file),
    "utf8"
  );

assert.deepEqual(
  User.schema.path("role")
    .options.enum,
  [
    "student",
    "teacher",
    "admin",
    "test",
  ]
);

for (const field of [
  "accountStatus",
  "accountStatusReason",
  "suspendedUntil",
  "warningCount",
]) {
  assert.ok(
    User.schema.path(field),
    `User.${field} 필드가 없습니다.`
  );
}

for (const field of [
  "authorId",
  "boardType",
  "schoolCode",
  "status",
  "warningIssued",
  "moderationReason",
  "isAnonymous",
  "anonymousNumber",
  "upvoteCount",
  "downvoteCount",
  "voteScore",
  "authorRegion",
  "authorSchoolGrade",
]) {
  assert.ok(
    CommunityPost.schema.path(
      field
    ),
    `CommunityPost.${field} 필드가 없습니다.`
  );
}
for (const field of [
  "postId",
  "userId",
  "value",
]) {
  assert.ok(
    CommunityVote.schema.path(
      field
    ),
    `CommunityVote.${field} 필드가 없습니다.`
  );
}
for (const field of [
  "releaseAt",
  "closeAt",
  "aggregationStartsAt",
  "rankingPublishesAt",
  "archiveAt",
  "answerKey",
  "points",
  "archiveItemId",
  "answerSheetArchiveItemId",
  "notificationSentAt",
  "aggregationStartedAt",
  "aggregationCompletedAt",
  "rankingSummary.averageScore",
  "rankingFinalizedAt",
]) {
  assert.ok(
    PrivateMockExam.schema.path(
      field
    ),
    `PrivateMockExam.${field} 필드가 없습니다.`
  );
}
for (const field of [
  "releaseAt",
  "status",
  "attempts",
  "sentAt",
  "nextRetryAt",
]) {
  assert.ok(
    PrivateMockUploadReminder.schema.path(
      field
    ),
    `PrivateMockUploadReminder.${field} 필드가 없습니다.`
  );
}
for (const field of [
  "examId",
  "userId",
  "answers",
  "score",
  "elapsedMs",
  "rank",
  "status",
]) {
  assert.ok(
    PrivateMockExamAttempt.schema.path(
      field
    ),
    `PrivateMockExamAttempt.${field} 필드가 없습니다.`
  );
}

assert.ok(
  PasswordResetCode.schema.path(
    "mode"
  )
);
assert.ok(
  ProblemAttempt.schema.path(
    "submittedAt"
  )
);
assert.ok(
  UserNotification.schema.path(
    "readAt"
  )
);
assert.ok(
  User.schema.path(
    "nameNormalized"
  )
);
assert.ok(
  User.schema.path(
    "communityAnonymousNumber"
  )
);
for (const field of [
  "postId",
  "authorId",
  "content",
  "status",
  "warningIssued",
  "isAnonymous",
  "anonymousNumber",
]) {
  assert.ok(
    CommunityComment.schema.path(
      field
    ),
    `CommunityComment.${field} 필드가 없습니다.`
  );
}
for (const field of [
  "userId",
  "reason",
  "tokenHash",
  "expiresAt",
  "status",
]) {
  assert.ok(
    NicknameChangeRequest.schema.path(
      field
    ),
    `NicknameChangeRequest.${field} 필드가 없습니다.`
  );
}

const routes = read(
  "routes/matths-routes.js"
);
for (const route of [
  '"/community"',
  '"/community/new"',
  '"/community/:postId/comments"',
  '"/community/:postId/vote"',
  '"/admin/community"',
  '"/admin/community/comments/:commentId/warn"',
  '"/admin/coach-suggestions"',
  '"/notifications"',
  '"/notifications/:notificationId"',
  '"/account/private-mock-restriction"',
  '"/admin/todos/:todoId/reopen"',
  '"/nickname-change/check"',
  '"/archive/admin/upload"',
  '"/archive/admin/items/:itemId/delete"',
  '"/archive/admin/items/bulk-delete"',
  '"/forgot-password/link"',
  '"/admin/users/:userId/activity"',
  '"/admin/users/:userId/assessments/:attemptId"',
  '"/admin/users/:userId/role"',
  '"/admin/users/:userId/account-status"',
  '"/admin/users/:userId/warnings"',
  '"/private-mock-exams"',
  '"/private-mock-exams/:examId"',
  '"/community/operations/:announcementId"',
  '"/api/private-mock-exams/:examId/draft"',
  '"/api/private-mock-exams/:examId/submit"',
  '"/api/private-mock-exams/weeks/:weekKey/selection"',
  '"/admin/private-mock-exams"',
  '"/admin/private-mock-exams/:examId/delete"',
  '"/profile/coach-mode"',
]) {
  assert.ok(
    routes.includes(route),
    `${route} 경로가 없습니다.`
  );
}

const communityService = read(
  "services/communityService.js"
);
assert.deepEqual(
  Object.keys(BOARD_LABELS).sort(),
  [
    "high-school",
    "school",
    "retaker",
    "operations",
  ].sort(),
  "게시판은 통합 고등학교·학교별·N수생·운영 게시판을 제공해야 합니다."
);
assert.equal(
  COMMUNITY_PAGE_SIZE,
  20,
  "게시판은 페이지당 최대 20개를 제공해야 합니다."
);
assert.ok(
  !read("views/community.ejs").includes(
    "수학 게시판"
  ) &&
    !read(
      "views/community-new.ejs"
    ).includes("수학 게시판"),
  "수학 게시판 UI가 남아 있습니다."
);
assert.equal(
  TODO_PAGE_SIZE,
  20,
  "관리자 할 일은 페이지당 20개여야 합니다."
);
assert.equal(
  NOTIFICATIONS_PER_PAGE,
  20,
  "알림 우편함은 페이지당 20개여야 합니다."
);
assert.deepEqual(
  normalizeAdminEmailSubject(
    "[Matths] [Matths] 이용 제한 안내"
  ),
  {
    display:
      "이용 제한 안내",
    email:
      "[Matths] 이용 제한 안내",
  },
  "운영 이메일 제목의 Matths 접두사가 중복 제거되지 않습니다."
);
assert.ok(
  PrivateMockIntegrityCase.schema.path(
    "warningAppliedAt"
  ),
  "확정 제재 경고의 중복 적용 방지 필드가 없습니다."
);
const adminTodoView = read(
  "views/admin-todos.ejs"
);
for (const copy of [
  "admin-todo-status-tabs",
  "dateFrom",
  "dateTo",
  "nickname",
  "처리 완료 이력",
  "/reopen",
  "재검토",
]) {
  assert.ok(
    adminTodoView.includes(copy),
    `관리자 할 일 화면에 ${copy}가 없습니다.`
  );
}

const adminNavigation =
  read(
    "views/partials/admin-navigation.ejs"
  );
assert.ok(
  adminNavigation.includes(
    "admin-alert-dock"
  ) &&
    adminNavigation.indexOf(
      "admin-alert-dock"
    ) >
      adminNavigation.indexOf(
        "</header>"
      ),
  "관리 알림 버튼은 관리자 navbar 아래에 별도 배치되어야 합니다."
);
const adminCss = read(
  "public/css/admin.css"
);
for (const copy of [
  ".admin-alert-dock",
  ".admin-todo-reopen",
  ".admin-todo-review-actions",
]) {
  assert.ok(
    adminCss.includes(copy),
    `관리자 화면 CSS에 ${copy}가 없습니다.`
  );
}

for (const file of [
  "views/war-of-masters.ejs",
  "views/war-of-masters-rankings.ejs",
  "views/partials/dashboard-navigation.ejs",
]) {
  const source = read(file);
  assert.ok(
    source.includes(
      "War of GOAT"
    ),
    `${file}의 랭킹전 이름이 War of GOAT으로 통일되지 않았습니다.`
  );
  assert.ok(
    !/실수들의 전쟁|war of masters/i.test(
      source
    ),
    `${file}에 이전 랭킹전 이름이 남아 있습니다.`
  );
}
assert.ok(
  communityService.includes(
    "warningCount >= 3"
  ) ||
    communityService.includes(
      "warnedUser.warningCount"
    )
);

const privateMockAdminView =
  read(
    "views/admin-private-mock-exams.ejs"
  );
for (const copy of [
  'name="examDates"',
  'name="formCodes"',
  'name="answerSheetFiles"',
  "고정 응시 시간",
]) {
  assert.ok(
    privateMockAdminView.includes(
      copy
    ),
    `Matths 주간 공식 모의고사 등록 화면에 ${copy}가 없습니다.`
  );
}

const archiveAdminView =
  read(
    "views/admin-archive.ejs"
  );
for (const copy of [
  "data-archive-selection-toggle",
  'name="parentFolderId"',
  "/archive/admin/items/bulk-delete",
]) {
  assert.ok(
    archiveAdminView.includes(
      copy
    ),
    `아카이브 관리 화면에 ${copy}가 없습니다.`
  );
}
assert.ok(
  communityService.includes(
    "POPULAR_POST_UPVOTES"
  ) &&
    communityService.includes(
      "CommunityVote.aggregate"
    ) &&
    communityService.includes(
      "작성한 게시글이 삭제되었습니다."
    ),
  "추천·비추천, 인기글 또는 게시글 삭제 우편함 알림이 연결되지 않았습니다."
);
assert.ok(
  communityService.includes(
    'status: "hidden"'
  )
);
assert.ok(
  communityService.includes(
    "CommunityPost.deleteOne"
  ) &&
    communityService.includes(
      "CommunityComment.deleteMany"
    ),
  "관리자 게시글 삭제가 DB 실제 삭제로 연결되지 않았습니다."
);

const adminService = read(
  "services/adminService.js"
);
const accountEmailCopy = read(
  "content/email/account.js"
);
const adminNoticeSources =
  `${adminService}\n${accountEmailCopy}`;
for (const copy of [
  "deliverModerationNotice",
  "계정 역할이 변경되었습니다.",
  "계정 상태가",
  "경고 누적으로 계정이 정지되었습니다.",
]) {
  assert.ok(
    adminNoticeSources.includes(copy),
    `관리자 제재 알림 처리에 ${copy}가 없습니다.`
  );
}

assert.ok(
  routes.includes(
    "adminArchiveUpload.array("
  ) &&
    routes.includes(
      '"archiveFiles"'
    ),
  "아카이브 다중 파일 업로드 경로가 없습니다."
);

for (const file of [
  "views/index.ejs",
  "views/intro.ejs",
  "views/visual-learning.ejs",
  "views/learning-flow.ejs",
  "views/curriculum.ejs",
  "views/faq.ejs",
  "views/community.ejs",
  "views/terms.ejs",
  "views/privacy.ejs",
  "views/contact.ejs",
  "views/archive-public.ejs",
]) {
  assert.ok(
    read(file).includes(
      'partials/public-navigation'
    ),
    `${file}에 공용 메인 메뉴가 연결되지 않았습니다.`
  );
}

const dollarMath =
  formatAdminMath(
    "$\\log 2=0.3010$일 때 $\\log 8$"
  );
assert.ok(
  !dollarMath.includes("$") &&
    dollarMath.includes(
      "\\(\\log 2=0.3010\\)"
    ),
  "관리자 수식의 $ 구분자 변환이 올바르지 않습니다."
);

const mojibakeFilename =
  Buffer.from(
    "2025년 3월 고3 수학 문제.pdf",
    "utf8"
  ).toString("latin1");
assert.equal(
  repairUploadFilename(
    mojibakeFilename
  ),
  "2025년 3월 고3 수학 문제.pdf"
);
assert.equal(
  getKoreanWeekTitle(
    new Date(
      "2026-07-12T06:00:00.000Z"
    )
  ),
  "2026년 7월 둘째주 Matths 주간 공식 모의고사"
);

const privateMockService =
  read(
    "services/privateMockExamService.js"
  );
assert.ok(
  privateMockService.includes(
    "? \"INVALIDATED\""
  ) &&
    privateMockService.includes(
      ': "CLEAR"'
    ) &&
    !privateMockService.includes(
      "AdminActionLog,\n  randomUUID"
    ),
  "소명 검토 결과의 응시 기록 상태 또는 관리자 로그 모델 연결이 올바르지 않습니다."
);
assert.deepEqual(
  PrivateMockExamAttempt.schema.path(
    "integrityStatus"
  ).options.enum,
  [
    "NOT_REVIEWED",
    "PENDING_INTEGRITY_REVIEW",
    "CLEAR",
    "INVALIDATED",
  ],
  "Matths 주간 공식 모의고사 응시 무결성 상태가 예상과 다릅니다."
);
const moderationNoticeService =
  read(
    "services/moderationNoticeService.js"
  );
const moderationEmailCopy =
  read(
    "content/email/moderation.js"
  );
for (const copy of [
  "공식 안내",
  "최대 3영업일",
  "Matths 운영팀 드림",
]) {
  assert.ok(
    (
      moderationNoticeService +
      moderationEmailCopy
    ).includes(copy),
    `운영 이메일 템플릿에 ${copy} 문구가 없습니다.`
  );
}
for (const copy of [
  "응시하고 최종 종합 랭킹에 반영할 성적을 만들어보세요.",
  "PRIVATE_MOCK_FOLDER_NAME",
  "status: \"ranked\"",
  "aggregationStartsAt",
  "rankingPublishesAt",
  "UPLOAD_REMINDER_LEAD_MS",
  "답안지는 JSON 파일로 올려주세요.",
  "setInterval",
]) {
  assert.ok(
    privateMockService.includes(
      copy
    ),
    `Matths 주간 공식 모의고사 자동 처리에 ${copy}가 없습니다.`
  );
}

const dashboardService =
  read(
    "services/dashboardService.js"
  );
assert.ok(
  !dashboardService.includes(
    "복습할 오답이 ${pendingReviewCount}개 있어요."
  ) &&
    !dashboardService.includes(
      'title: "이어서 학습할 개념이 있어요."'
    ),
  "학습 관련 합성 알림이 알림 패널에 남아 있습니다."
);

assert.equal(
  getSundayReleaseAt(
    new Date(
      "2026-08-02T05:00:00.000Z"
    )
  ).toISOString(),
  "2026-08-02T06:00:00.000Z"
);

const mainStyles = read(
  "public/css/main.css"
);
assert.ok(
  mainStyles.includes(
    ".notification-button.urgent"
  ) &&
    mainStyles.includes(
      "notification-shake"
    ),
  "긴급 알림의 빨간색·흔들림 스타일이 없습니다."
);

for (const file of [
  "views/community.ejs",
  "views/community-new.ejs",
  "views/community-post.ejs",
  "views/community-announcement.ejs",
  "views/admin-community.ejs",
  "views/notifications.ejs",
  "views/admin-assessment-detail.ejs",
  "views/admin-user-activity.ejs",
  "views/admin-archive.ejs",
  "views/admin-coach-suggestions.ejs",
  "views/notification-detail.ejs",
  "views/nickname-change.ejs",
  "views/private-mock-exams.ejs",
  "views/private-mock-exam.ejs",
  "views/admin-private-mock-exams.ejs",
]) {
  assert.ok(
    fs.existsSync(
      path.join(root, file)
    ),
    `${file} 화면이 없습니다.`
  );
}

console.log(
  "게시판 투표·인기글·삭제 알림, Matths 주간 공식 모의고사 자동 공개·최종 종합 랭킹·아카이브, 관리자 자료 관리와 알림 정책 검증 완료"
);
