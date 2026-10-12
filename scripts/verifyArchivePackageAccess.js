"use strict";

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

const { AUTHENTICATED, MOCK_EXAM_PACKAGE, PRO } = ARCHIVE_ACCESS_LEVELS;

assert.equal(normalizeArchiveAccessLevel(""), AUTHENTICATED);
assert.equal(normalizeArchiveAccessLevel(MOCK_EXAM_PACKAGE), MOCK_EXAM_PACKAGE);
assert.equal(normalizeArchiveAccessLevel(PRO), PRO);
assert.equal(
  normalizeArchiveAccessLevel(AUTHENTICATED, {
    folderName: "2026 Matths 사설 모의고사",
  }),
  MOCK_EXAM_PACKAGE
);

const packageCases = [
  {
    label: "무료 플랜",
    access: { active: false, packageType: "FREE" },
    expected: [true, false, false],
  },
  {
    label: "학원 플랜",
    access: { active: true, packageType: "ACADEMY_PLAN" },
    expected: [true, true, false],
  },
  {
    label: "Pro 플랜",
    access: { active: true, packageType: "PRO" },
    expected: [true, true, true],
  },
  {
    label: "관리자",
    access: { active: true, packageType: "SUPER_ADMIN" },
    expected: [true, true, true],
  },
];
const requirements = [AUTHENTICATED, MOCK_EXAM_PACKAGE, PRO];
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
  archivePackageAccessAllows({ active: false, packageType: "PRO" }, PRO),
  false
);

const root = {
  _id: "root",
  name: "GOAT Arena 자료",
  accessLevel: PRO,
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
assert.equal(folderRequiredAccessLevel(child, folderById), PRO);
assert.equal(folderRequiredAccessLevel(grandchild, folderById), PRO);

assert.match(
  archiveAccessDeniedMessage(MOCK_EXAM_PACKAGE, "내려받을"),
  /학원 이용 혜택 또는 Pro 플랜/
);
assert.match(archiveAccessDeniedMessage(PRO, "내려받을"), /활성 Pro 플랜/);

assert.deepEqual(
  ArchiveFolder.schema.path("accessLevel").enumValues,
  [AUTHENTICATED, MOCK_EXAM_PACKAGE, PRO]
);

const adminView = fs.readFileSync(
  path.resolve(__dirname, "..", "views", "admin-archive.ejs"),
  "utf8"
);
assert.match(adminView, /value="MOCK_EXAM_PACKAGE"/);
assert.match(adminView, /value="PRO"/);
assert.doesNotMatch(adminView, /LEARNING_PACKAGE|PAID_PACKAGE/);
assert.match(adminView, /파일은 선택한 폴더와 상위 폴더의 접근 권한을 따릅니다/);

const publicView = fs.readFileSync(
  path.resolve(__dirname, "..", "views", "archive-public.ejs"),
  "utf8"
);
assert.match(publicView, /모의고사 이용 대상/);
assert.match(publicView, /Pro 전용/);

console.log(
  "Archive access verified: authenticated, academy mock-exam, Pro, nested inheritance, and current UI labels."
);
