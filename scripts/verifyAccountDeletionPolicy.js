const assert =
  require("node:assert/strict");
const fs = require("node:fs");
const path =
  require("node:path");
const {
  RankingProfile,
  User,
} = require("../models/matthsModel");
const {
  buildAnonymousAccountUpdate,
  normalizeRetentionChoice,
} = require("../services/accountDeletionService");

const root = path.join(
  __dirname,
  ".."
);
const read = (file) =>
  fs.readFileSync(
    path.join(root, file),
    "utf8"
  );

assert.ok(
  User.schema.path(
    "withdrawal.anonymizedAt"
  )
);
assert.ok(
  User.schema.path(
    "withdrawal.initiatedBy"
  )
);
assert.ok(
  User.schema.path(
    "withdrawal.dataRetention"
  )
);
assert.ok(
  RankingProfile.schema.path(
    "datasetOnly"
  )
);

for (const value of [
  true,
  "true",
  "1",
  "on",
  "anonymous",
]) {
  assert.equal(
    normalizeRetentionChoice(
      value
    ),
    true
  );
}
for (const value of [
  false,
  undefined,
  "",
  "false",
  "purged",
]) {
  assert.equal(
    normalizeRetentionChoice(
      value
    ),
    false
  );
}

const originalUser = {
  _id:
    "64b000000000000000000001",
  name: "기존닉네임",
  realName: "홍길동",
  email: "student@example.com",
  tokenVersion: 7,
  school: {
    region: "서울특별시",
    code: "SCHOOL-001",
    name: "기존고등학교",
    roadAddress: "기존 주소",
  },
};

const anonymousUpdate =
  buildAnonymousAccountUpdate({
    user: originalUser,
    initiatedBy: "self",
    retainAnonymousData: true,
    now: new Date(
      "2026-07-29T00:00:00.000Z"
    ),
  });

assert.equal(
  anonymousUpdate.$set.email,
  "withdrawn.64b000000000000000000001@anonymous.invalid"
);
assert.equal(
  anonymousUpdate.$set.realName,
  ""
);
assert.equal(
  anonymousUpdate.$set.name,
  "탈퇴회원"
);
assert.equal(
  anonymousUpdate.$set.school.name,
  "익명 처리"
);
assert.equal(
  anonymousUpdate.$set.school.code,
  "ANONYMIZED"
);
assert.equal(
  anonymousUpdate.$set.tokenVersion,
  8
);
assert.equal(
  anonymousUpdate.$set.accountStatus,
  "withdrawn"
);
assert.equal(
  anonymousUpdate.$set[
    "withdrawal.dataRetention"
  ],
  "anonymous"
);
assert.equal(
  anonymousUpdate.$unset
    .communityAnonymousNumber,
  1
);
assert.ok(
  !JSON.stringify(
    anonymousUpdate
  ).includes(
    originalUser.email
  )
);
assert.ok(
  !JSON.stringify(
    anonymousUpdate
  ).includes(
    originalUser.realName
  )
);

const purgeUpdate =
  buildAnonymousAccountUpdate({
    user: originalUser,
    initiatedBy: "admin",
    retainAnonymousData: false,
  });
assert.equal(
  purgeUpdate.$set[
    "withdrawal.initiatedBy"
  ],
  "admin"
);
assert.equal(
  purgeUpdate.$set[
    "withdrawal.dataRetention"
  ],
  "purged"
);

const accountService = read(
  "services/accountDeletionService.js"
);
for (const expected of [
  "PasswordResetCode.deleteMany",
  "SupportInquiry.deleteMany",
  "AdminActionLog.updateMany",
  "ConceptProgress.deleteMany",
  "ProblemAttempt.deleteMany",
  "AssessmentAttempt.deleteMany",
  "QuickPracticeAttempt.deleteMany",
  "PrivateMockExamAttempt.deleteMany",
  "PrivateMockWeeklyResult.deleteMany",
  "RankingProfile.deleteMany",
  'status: "hidden"',
  'schoolCode: ""',
  "retainAnonymousData: true",
]) {
  assert.ok(
    accountService.includes(
      expected
    ),
    `탈퇴 서비스에 ${expected} 처리가 없습니다.`
  );
}

const routes = read(
  "routes/matths-routes.js"
);
assert.ok(
  routes.includes(
    '"/profile/withdraw"'
  )
);
const apiRoutes = read(
  "routes/api-routes.js"
);
assert.ok(
  apiRoutes.includes(
    '"/me"'
  ) &&
    apiRoutes.includes(
      "apiController.withdrawMe"
    )
);

const profileView = read(
  "views/profile.ejs"
);
assert.ok(
  profileView.includes(
    'action="/profile/withdraw"'
  ) &&
    profileView.includes(
      'name="acknowledgeAnonymousRetention"'
    ) &&
    !profileView.includes(
      'name="retainAnonymousData"'
    ),
  "사용자 직접 탈퇴는 익명 보존 고정이어야 합니다."
);

const adminView = read(
  "views/admin-user-detail.ejs"
);
assert.ok(
  adminView.includes(
    'name="retainAnonymousData"'
  ) &&
    adminView.includes(
      "학습·평가 데이터를 익명으로 보존"
    ),
  "관리자 탈퇴 화면에 데이터 보존 선택지가 없습니다."
);

const mmrService = read(
  "services/mmrService.js"
);
assert.ok(
  mmrService.includes(
    "datasetOnly"
  ),
  "탈퇴 데이터가 실시간 랭킹에서 제외되지 않습니다."
);

console.log(
  "사용자 익명 보존 탈퇴와 관리자 보존·삭제 선택 정책 검증 완료"
);
