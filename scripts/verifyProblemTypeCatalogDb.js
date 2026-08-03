const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const { ProblemTypeVersion } = require("../models/problemTypeModel");
const {
  buildProblemEngineRegistry,
  cachedProblemTypeControl,
  reloadActiveProblemTypeControls,
} = require("../services/problemTypeCatalogService");
const { buildAssessmentPaper } = require("../services/assessmentService");
const { buildPlacementPaper } = require("../services/placementExamBank");
const {
  generateVerifiedProblem,
  templates: quickPracticeTemplates,
} = require("../services/quickPracticeService");

async function main() {
  assert.ok(process.env.DB, "config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB);

  const registry = buildProblemEngineRegistry();
  const [active, duplicateActive] = await Promise.all([
    ProblemTypeVersion.find({ status: "ACTIVE" })
      .select("category engineKey sourceHash enabled validationReport sourceSnapshot")
      .lean(),
    ProblemTypeVersion.aggregate([
      { $match: { status: "ACTIVE" } },
      { $group: { _id: { category: "$category", engineKey: "$engineKey" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]),
  ]);

  assert.equal(active.length, registry.size, "서버 레지스트리와 DB 활성 유형 수가 다릅니다.");
  assert.deepEqual(duplicateActive, [], "동일 유형의 활성 리비전이 두 개 이상입니다.");

  const activeByKey = new Map(
    active.map((entry) => [`${entry.category}:${entry.engineKey}`, entry])
  );
  for (const [key, engine] of registry) {
    const entry = activeByKey.get(key);
    assert.ok(entry, `${key}: DB 활성 유형이 없습니다.`);
    assert.equal(entry.sourceHash, engine.sourceHash, `${key}: 서버와 DB 소스 해시가 다릅니다.`);
    assert.equal(entry.validationReport?.passed, true, `${key}: 자동 검산 미통과 상태입니다.`);
    assert.equal(entry.validationReport?.calculatorFree, true, `${key}: 계산기 불필요 검증 미통과 상태입니다.`);
    assert.equal(entry.validationReport?.answerVerified, true, `${key}: 정답 검산 미통과 상태입니다.`);
    assert.ok(entry.sourceSnapshot, `${key}: DB 소스 스냅샷이 없습니다.`);
  }

  await reloadActiveProblemTypeControls();
  for (const [key, engine] of registry) {
    const [category, ...engineKeyParts] = key.split(":");
    const control = cachedProblemTypeControl(category, engineKeyParts.join(":"));
    assert.ok(control, `${key}: 실행 중 제어 캐시에 없습니다.`);
    assert.equal(control.sourceMatchesServer, true, `${key}: DB 승인 소스와 서버 소스가 다릅니다.`);
    assert.equal(control.sourceHash, engine.sourceHash, `${key}: 실행 중 제어 해시가 다릅니다.`);
  }
  const assessmentPaper = buildAssessmentPaper({
    scopeType: "subunit",
    courseId: "algebra",
    unitId: "exponential-logarithmic-functions",
    subunitId: "radical",
  });
  const placementPaper = buildPlacementPaper();
  const quickPractice = generateVerifiedProblem(quickPracticeTemplates[0]);
  assert.equal(assessmentPaper.questions.length, 10);
  assert.equal(placementPaper.questions.length, 30);
  assert.ok(quickPractice.prompt && quickPractice.answer !== undefined);
  const counts = active.reduce((result, entry) => {
    result[entry.category] = (result[entry.category] || 0) + 1;
    return result;
  }, {});
  console.log(`Problem type DB verification passed: ${JSON.stringify(counts)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
