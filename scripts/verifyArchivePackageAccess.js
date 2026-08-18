const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { ArchiveFolder } = require("../models/matthsModel");
const {
  ARCHIVE_ACCESS_LEVELS,
  archiveAccessDeniedMessage,
  archivePackageAccessAllows,
  folderRequiredAccessLevel,
  normalizeArchiveAccessLevel,
} = require("../services/archiveService");

const {
  AUTHENTICATED,
  MOCK_EXAM_PACKAGE,
  LEARNING_PACKAGE,
} = ARCHIVE_ACCESS_LEVELS;

assert.equal(normalizeArchiveAccessLevel(""), AUTHENTICATED);
assert.equal(normalizeArchiveAccessLevel("MOCK_EXAM_PACKAGE"), MOCK_EXAM_PACKAGE);
assert.equal(normalizeArchiveAccessLevel("LEARNING_PACKAGE"), LEARNING_PACKAGE);
assert.equal(
  normalizeArchiveAccessLevel("PAID_PACKAGE"),
  LEARNING_PACKAGE,
  "기존 PAID_PACKAGE 폴더는 29일 학습권 전용으로 유지해야 합니다."
);
assert.equal(
  normalizeArchiveAccessLevel(AUTHENTICATED, {
    folderName: "2026 Matths 사설 모의고사",
  }),
  MOCK_EXAM_PACKAGE,
  "자동 모의고사 아카이브는 모의고사 이용권 이상으로 보호해야 합니다."
);

const packageCases = [
  {
    label: "기본학습",
    access: { active: false, packageType: null },
    expected: [true, false, false],
  },
  {
    label: "모의고사 전용",
    access: { active: true, packageType: "MOCK_EXAM_ONLY" },
    expected: [true, true, false],
  },
  {
    label: "29일 학습권",
    access: { active: true, packageType: "LEARNING_PACKAGE" },
    expected: [true, true, true],
  },
  {
    label: "최고 관리자",
    access: { active: true, packageType: "SUPER_ADMIN" },
    expected: [true, true, true],
  },
];
const requirements = [AUTHENTICATED, MOCK_EXAM_PACKAGE, LEARNING_PACKAGE];
for (const testCase of packageCases) {
  requirements.forEach((requirement, index) => {
    assert.equal(
      archivePackageAccessAllows(testCase.access, requirement),
      testCase.expected[index],
      `${testCase.label} → ${requirement} 권한 행렬이 올바르지 않습니다.`
    );
  });
}

assert.equal(
  archivePackageAccessAllows(
    { active: false, packageType: "LEARNING_PACKAGE" },
    LEARNING_PACKAGE
  ),
  false,
  "만료된 29일 학습권은 접근을 허용하면 안 됩니다."
);

const root = {
  _id: "root",
  name: "GOAT Arena 자료",
  accessLevel: LEARNING_PACKAGE,
  parentFolderId: null,
};
const child = {
  _id: "child",
  name: "하위 자료",
  accessLevel: AUTHENTICATED,
  parentFolderId: "root",
};
const grandchild = {
  _id: "grandchild",
  name: "더 강한 하위 자료",
  accessLevel: MOCK_EXAM_PACKAGE,
  parentFolderId: "child",
};
const folderById = new Map([
  ["root", root],
  ["child", child],
  ["grandchild", grandchild],
]);
assert.equal(
  folderRequiredAccessLevel(child, folderById),
  LEARNING_PACKAGE,
  "하위 폴더가 상위 폴더보다 넓게 공개되면 안 됩니다."
);
assert.equal(
  folderRequiredAccessLevel(grandchild, folderById),
  LEARNING_PACKAGE,
  "중첩 폴더는 경로 중 가장 강한 접근 권한을 상속해야 합니다."
);

assert.match(
  archiveAccessDeniedMessage(MOCK_EXAM_PACKAGE, "내려받을"),
  /모의고사 이용권 또는 29일 학습권 패키지/
);
assert.match(
  archiveAccessDeniedMessage(LEARNING_PACKAGE, "내려받을"),
  /29일 학습권 패키지\(GOAT Arena 포함\)/
);

const enumValues = ArchiveFolder.schema.path("accessLevel").enumValues;
for (const accessLevel of [
  AUTHENTICATED,
  MOCK_EXAM_PACKAGE,
  LEARNING_PACKAGE,
  "PAID_PACKAGE",
]) {
  assert.ok(enumValues.includes(accessLevel), `ArchiveFolder enum 누락: ${accessLevel}`);
}

const adminView = fs.readFileSync(
  path.resolve(__dirname, "..", "views", "admin-archive.ejs"),
  "utf8"
);
assert.match(adminView, /value="MOCK_EXAM_PACKAGE"/);
assert.match(adminView, /value="LEARNING_PACKAGE"/);
assert.match(adminView, /GOAT Arena 포함/);
assert.match(adminView, /파일은 선택한 폴더와 상위 폴더의 접근 권한을 따릅니다/);

const publicView = fs.readFileSync(
  path.resolve(__dirname, "..", "views", "archive-public.ejs"),
  "utf8"
);
assert.match(publicView, /모의고사 이용권 전용/);
assert.match(publicView, /29일 학습권 전용/);

const operationsGuide = fs.readFileSync(
  path.resolve(__dirname, "..", "services", "adminOperationsGuideService.js"),
  "utf8"
);
assert.match(operationsGuide, /모의고사 이용권 이상/);
assert.match(operationsGuide, /경로상 가장 강한 접근 권한/);

console.log(
  "Archive package access verified: authenticated, mock-exam, learning-package, legacy compatibility, nested inheritance, and UI labels."
);
