const fs = require("node:fs");
const path = require("node:path");

const {
  ARENA_MATCH_QUESTION_ROLLOUT,
} = require("../services/arenaMatchDifficultyPlan");
const {
  assertPreparedArenaQuestionPoolConnected,
} = require("../services/arenaPreparedQuestionPoolService");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertNoImports(relativePath, forbiddenFragments) {
  const source = read(relativePath);
  const hits = forbiddenFragments.filter((fragment) => source.includes(fragment));
  if (hits.length) {
    throw new Error(`${relativePath}에 금지된 의존성이 있습니다: ${hits.join(", ")}`);
  }
}

const assessmentOwnedFiles = [
  "services/assessmentService.js",
  "services/assessmentTemplates/index.js",
  "services/assessmentTemplates/shared.js",
  "services/assessmentReferences/mockExamCatalog.js",
];
for (const file of assessmentOwnedFiles) {
  assertNoImports(file, [
    "arenaMatchDifficultyPlan",
    "arenaPreparedQuestionPoolService",
    "arenaPdfPilotGenerators",
    "arenaPdfTranscriptionGenerators",
    "arenaOneOnOneProblemBank",
    "arenaOneOnOneProblemTypes",
  ]);
}

const activeArenaRuntimeFiles = [
  "services/arenaMatchDifficultyPlan.js",
  "services/arenaPreparedQuestionPoolService.js",
  "services/arenaProblemVisualizationPolicy.js",
  "services/arenaOneOnOneProblemTypes.js",
  "services/arenaOneOnOneProblemBank.js",
  "services/arenaPdfOneOnOneQuestionPool.js",
  "services/arenaProblemPackService.js",
];
for (const file of activeArenaRuntimeFiles) {
  assertNoImports(file, [
    "assessmentService",
    "assessmentTemplates",
    "assessmentReferences",
    'require("./problemTypeCatalogService")',
    'require("./problemGenerators")',
    'require("./examBankSource")',
  ]);
}

if (ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected !== true) {
  throw new Error("Arena PDF 문제 풀이 신규 1대1 런타임에 연결되어 있지 않습니다.");
}
assertPreparedArenaQuestionPoolConnected();

for (const file of [
  "services/arenaOneOnOneProblemBank.js",
  "services/arenaProblemPackService.js",
]) {
  assertNoImports(file, [
    'require("./arenaPdfPilotGenerators")',
    'require("./arenaPdfTranscriptionGenerators")',
  ]);
}

console.log("Arena/평가센터 분리 및 PDF 문제 풀 신규 경기 연결 상태 검증 완료");
