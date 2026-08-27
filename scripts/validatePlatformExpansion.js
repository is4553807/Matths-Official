const assert = require("assert");
const fs = require("fs");
const path = require("path");
require("dotenv").config({
  path: path.join(
    __dirname,
    "..",
    "config.env"
  ),
});

// This verifier must also run from a clean checkout where deployment secrets
// are intentionally absent. Runtime readiness validates the real environment;
// this process-local key only exercises the mobile token contract below.
if (!process.env.API_TOKEN_SECRET && !process.env.SECRET) {
  process.env.API_TOKEN_SECRET =
    "matths-platform-expansion-contract-test-secret";
}

const {
  createAccessToken,
  verifyAccessToken,
} = require("../services/mobileAuthService");
const {
  generateVerifiedProblem,
  getQuickPracticeCatalogSummary,
  templates,
  QUICK_PRACTICE_LIMIT_MS,
} = require("../services/quickPracticeService");
const {
  getAcademicYear,
  getGradeLabel,
} = require("../services/userLifecycleService");
const {
  getRankingDisplayName,
  RANKING_DISPLAY_MODES,
  validateRealName,
} = require("../services/userIdentityService");
const {
  normalizeContent,
  normalizeSubject,
} = require("../services/supportInquiryService");
const {
  User,
  PasswordResetCode,
  QuickPracticeAttempt,
  CoachMessageSuggestion,
  SupportInquiry,
} = require("../models/matthsModel");

const token = createAccessToken({
  _id: "507f1f77bcf86cd799439011",
  email: "student@example.com",
  role: "student",
  tokenVersion: 3,
});
const payload =
  verifyAccessToken(token);

assert.strictEqual(
  payload.sub,
  "507f1f77bcf86cd799439011"
);
assert.strictEqual(payload.ver, 3);
assert.strictEqual(
  verifyAccessToken(`${token}x`),
  null
);

assert.strictEqual(
  QUICK_PRACTICE_LIMIT_MS,
  40000
);
assert.ok(
  templates.length >= 8,
  "평가원 첫 페이지 핵심 유형은 8개 이상이어야 합니다."
);

const pointCounts = {
  2: 0,
  3: 0,
};
const catalogSummary =
  getQuickPracticeCatalogSummary();

assert.ok(
  catalogSummary.variantCount >= 20,
  "눈풀이 세부 변형은 20개 이상이어야 합니다."
);

for (const template of templates) {
  assert.ok(
    [2, 3].includes(
      template.points
    )
  );
  pointCounts[template.points] += 1;

  for (
    let index = 0;
    index < 100;
    index += 1
  ) {
    const generated =
      generateVerifiedProblem(
        template
      );
    assert.ok(
      generated.prompt
    );
    assert.notStrictEqual(
      generated.answer,
      undefined
    );
    assert.ok(
      generated.solution
    );
    assert.ok(
      generated.variantKey
    );
    assert.ok(
      template.verify(generated),
      `${template.key}/${generated.variantKey} 자동 검산 실패`
    );
  }
}

assert.ok(pointCounts[2] >= 3);
assert.ok(pointCounts[3] >= 5);

assert.strictEqual(
  getAcademicYear(
    new Date(
      "2027-02-28T14:59:59Z"
    )
  ),
  2026
);
assert.strictEqual(
  getAcademicYear(
    new Date(
      "2027-02-28T15:00:00Z"
    )
  ),
  2027
);
assert.strictEqual(
  getGradeLabel(13),
  "N수생"
);

assert.ok(
  validateRealName("홍길동").valid
);
assert.ok(
  validateRealName("Jean-Luc Picard")
    .valid
);
assert.ok(
  !validateRealName("가123").valid
);
assert.deepStrictEqual(
  [...RANKING_DISPLAY_MODES],
  ["nickname"]
);
assert.strictEqual(
  getRankingDisplayName({
    name: "익명수학러",
    realName: "홍길동",
    preferences: {
      rankingDisplayMode: "nickname",
    },
  }),
  "익명수학러"
);
assert.strictEqual(
  getRankingDisplayName({
    name: "익명수학러",
    realName: "홍길동",
    preferences: {
      rankingDisplayMode: "realName",
    },
  }),
  "익명수학러"
);
assert.strictEqual(
  normalizeSubject(
    "  수식   오류\n문의  "
  ),
  "수식 오류 문의"
);
assert.strictEqual(
  normalizeContent(
    "  첫 줄\r\n둘째 줄  "
  ),
  "첫 줄\n둘째 줄"
);

for (const [model, fields] of [
  [
    User,
    [
      "realName",
      "preferences.rankingDisplayMode",
      "schoolGrade",
      "lastGradePromotionYear",
      "tokenVersion",
      "termsAcceptedAt",
    ],
  ],
  [
    PasswordResetCode,
    [
      "codeHash",
      "expiresAt",
      "failedAttempts",
    ],
  ],
  [
    QuickPracticeAttempt,
    [
      "deadlineAt",
      "pointValue",
      "answer",
      "variantKey",
      "sourceScope",
    ],
  ],
  [
    CoachMessageSuggestion,
    [
      "mode",
      "situation",
      "status",
    ],
  ],
  [
    SupportInquiry,
    [
      "contactEmail",
      "subject",
      "content",
      "status",
      "emailNotification.status",
      "adminReply.repliedAt",
    ],
  ],
]) {
  for (const field of fields) {
    assert.ok(
      model.schema.path(field),
      `${model.modelName}.${field} 필드가 없습니다.`
    );
  }
}

const projectRoot = path.join(
  __dirname,
  ".."
);
const apiRoutes =
  fs.readFileSync(
    path.join(
      projectRoot,
      "routes",
      "api-routes.js"
    ),
    "utf8"
  );

for (const route of [
  "/auth/login",
  "/auth/password-reset/request",
  "/learning",
  "/quick-practice/start",
  "/coach-suggestions",
]) {
  assert.ok(
    apiRoutes.includes(route),
    `${route} API가 없습니다.`
  );
}
assert.ok(
  apiRoutes.includes(
    "/me/ranking-identity"
  ),
  "iPad와 웹이 같은 닉네임 전용 공개 랭킹 정책을 사용해야 합니다."
);
const apiControllerSource =
  fs.readFileSync(
    path.join(
      projectRoot,
      "controllers",
      "apiController.js"
    ),
    "utf8"
  );
assert.ok(
  apiControllerSource.includes(
    "normalizeRankingDisplayMode"
  ) &&
    apiControllerSource.includes(
      '"preferences.rankingDisplayMode"'
    ),
  "랭킹 표시 API는 닉네임 전용 정규화 경계를 거쳐야 합니다."
);

const webRoutes =
  fs.readFileSync(
    path.join(
      projectRoot,
      "routes",
      "matths-routes.js"
    ),
    "utf8"
  );

assert.ok(
  !webRoutes.includes(
    "/profile/ranking-identity"
  ),
  "공개 랭킹은 닉네임 전용이므로 실명 표시 변경 웹 경로를 다시 노출하면 안 됩니다."
);
assert.ok(
  webRoutes.includes(
    '"/contact"'
  ) &&
    webRoutes.includes(
      "submitContactInquiry"
    ),
  "로그인 사용자 문의 경로가 없습니다."
);

const registerView =
  fs.readFileSync(
    path.join(
      projectRoot,
      "views",
      "register.ejs"
    ),
    "utf8"
  );
assert.ok(
  registerView.includes(
    'name="realName"'
  ),
  "회원가입 실명 입력란이 없습니다."
);
assert.ok(
  registerView.includes(
    'name="name"'
  ),
  "회원가입 닉네임 입력란이 없습니다."
);

const introView =
  fs.readFileSync(
    path.join(
      projectRoot,
      "views",
      "intro.ejs"
    ),
    "utf8"
  );
assert.ok(
  introView.includes("GOAT ARENA"),
  "서비스 소개에 GOAT Arena 안내가 없습니다."
);

const warOfMastersView =
  fs.readFileSync(
    path.join(
      projectRoot,
      "views",
      "war-of-masters.ejs"
    ),
    "utf8"
  );
assert.ok(
  warOfMastersView.includes(
    "placement.ctaLabel"
  ) &&
    warOfMastersView.includes(
      "/war-of-masters/placement/start"
    ) &&
    warOfMastersView.includes(
      "arenaUser.nickname"
    ) &&
    warOfMastersView.includes(
      "arenaUser.gradeLabel"
    ),
  "GOAT Arena 입단 화면 또는 로그인 사용자 정보 연결이 없습니다."
);

for (const file of [
  "views/terms.ejs",
  "views/privacy.ejs",
  "views/password-reset.ejs",
  "views/quick-practice.ejs",
  "views/coach-suggestions.ejs",
  "views/contact.ejs",
]) {
  assert.ok(
    fs.existsSync(
      path.join(projectRoot, file)
    ),
    `${file} 화면이 없습니다.`
  );
}

const cssFiles = fs
  .readdirSync(
    path.join(projectRoot, "public/css")
  )
  .filter((file) =>
    file.endsWith(".css")
  );

for (const file of cssFiles) {
  const source =
    fs.readFileSync(
      path.join(
        projectRoot,
        "public/css",
        file
      ),
      "utf8"
    );

  assert.ok(
    !/Times New Roman|Georgia/.test(
      source
    ),
    `${file}에 오래된 세리프 폰트가 남아 있습니다.`
  );
}

console.log(
  `실명 입력·닉네임 전용 공개 랭킹, iPad 토큰 API, 평가원 첫 페이지 눈풀이 ${templates.length}유형·${catalogSummary.variantCount}변형, 학년 승급, 비밀번호·게시판·문의 모델, 법적 화면과 전역 폰트 검증 완료`
);
