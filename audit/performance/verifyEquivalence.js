const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { seed, id, NOW } = require("./benchmark");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
const root = path.resolve(__dirname, "../..");
const baseline = process.env.PERFORMANCE_BASELINE_REF || "bc2a2a26fe706ecc0371cff7830f011a6ed514cd";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW.getTime()])); }
  static now() { return NOW.getTime(); }
}
function load(file, original, privateNames = []) {
  const filename = path.join(root, file);
  const source = original
    ? execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
    : fs.readFileSync(filename, "utf8");
  const module = { exports: {} };
  // No production hooks: expose local helpers only inside this test module.
  const wrapper = vm.runInThisContext(`(function(require,module,exports,__filename,__dirname,Date){${source}\nmodule.exports.__private = {${privateNames.join(",")}};\n})`, { filename: `${filename}.${original ? "original" : "optimized"}` });
  wrapper(createRequire(filename), module, module.exports, filename, path.dirname(filename), FixedDate);
  return module.exports;
}
function plain(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Map ? [...item] : item));
}
async function same(label, original, optimized) {
  assert.deepEqual(plain(await optimized()), plain(await original()), label);
  console.log(`Equivalent: ${label}`);
}
async function main() {
  const originalMath = load("services/mathMapService.js", true, ["buildStudentMap", "buildGraph", "buildStudentRecommendation"]);
  const optimizedMath = load("services/mathMapService.js", false, ["buildStudentMap", "buildGraph", "buildStudentRecommendation"]);
  const originalWeekly = load("services/weeklyMockInsightService.js", true);
  const optimizedWeekly = load("services/weeklyMockInsightService.js", false, ["getScopeInsights"]);
  const originalLifecycle = load("services/userLifecycleService.js", true);
  const optimizedLifecycle = load("services/userLifecycleService.js", false);
  const originalWrong = load("services/wrongNoteService.js", true, ["formatKoreanDate", "isSameOrBeforeToday"]);
  const optimizedWrong = load("services/wrongNoteService.js", false, ["formatKoreanDate", "isSameOrBeforeToday"]);
  for (const value of [null, 0, "2024-02-29T14:59:59Z", "2024-02-29T15:00:00Z", "2025-12-31T15:00:00Z", "2026-03-01T00:00:00Z", "2026-09-04T15:00:00Z"]) {
    for (const key of ["getKoreanDateKey", "getAcademicYear"]) assert.equal(optimizedLifecycle[key](new Date(value)), originalLifecycle[key](new Date(value)));
    for (const key of ["formatKoreanDate", "isSameOrBeforeToday"]) assert.equal(optimizedWrong.__private[key](value), originalWrong.__private[key](value));
  }
  for (const service of [originalLifecycle, optimizedLifecycle]) {
    assert.throws(() => service.getKoreanDateKey(new Date(NaN)), RangeError);
  }
  for (const service of [originalWrong, optimizedWrong]) {
    assert.throws(() => service.__private.formatKoreanDate("invalid-date"), RangeError);
  }
  console.log("Equivalent: date boundaries, leap year, null values and invalid-date errors");
  let randomState = 741;
  const random = (maximum) => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState % maximum;
  };
  for (let run = 0; run < 200; run++) {
    const concepts = Array.from({ length: random(80) }, (_, index) => ({
      id: `concept-${index}`, title: `개념 ${index}`, status: ["WEAK", "DEVELOPING", "UNKNOWN", "MASTERED"][random(4)],
      confidence: ["UNKNOWN", "LOW", "MEDIUM", "HIGH"][random(4)], confidenceLabel: "신뢰도",
      mastery: random(5) * 20, unlocks: [],
      evidence: { attemptCount: random(21), incorrectCount: random(6), correctCount: random(6), retryAttemptedCount: random(3), retryRecoveredCount: random(3) },
    }));
    const bottlenecks = concepts.filter(() => random(3) === 0).map((concept) => ({ conceptId: concept.id }));
    assert.deepEqual(optimizedMath.__private.buildStudentRecommendation(concepts, bottlenecks), originalMath.__private.buildStudentRecommendation(concepts, bottlenecks));
  }
  console.log("Equivalent: 200 deterministic recommendation/tie-order datasets");
  const memory = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  try {
    await mongoose.connect(memory.getUri("performance_equivalence"));
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const fixture = await seed();
    const ids = fixture.students.map((student) => student._id);
    for (const values of [[], [ids[0]], [ids[0], ids[0], String(ids[1])], ids]) {
      await same(`Math Map: ${values.length} input IDs`, () => originalMath.getClassMathMap({ studentUserIds: values }), () => optimizedMath.getClassMathMap({ studentUserIds: values }));
    }
    require("../../services/curriculumService").clearCurriculumCache();
    await same("Math Map: curriculum cache reload", () => originalMath.getClassMathMap({ studentUserIds: ids.slice(0, 3) }), () => optimizedMath.getClassMathMap({ studentUserIds: ids.slice(0, 3) }));
    await assert.rejects(() => optimizedMath.getClassMathMap({ studentUserIds: ["invalid"] }), TypeError);
    const { Problem, ProblemAttempt, PrivateMockExamAttempt } = require("../../models/matthsModel");
    // Missing/oversized snapshots, type fallback, mismatched primary concept, retries,
    // >20 attempts and exactly tied timestamps exercise projection and window semantics.
    const student = ids[0];
    const concept = fixture.concepts[0];
    await ProblemAttempt.collection.insertMany(Array.from({ length: 25 }, (_, n) => ({
      _id: id(`edge-attempt-${n}`), userId: student, problemId: id(`edge-problem-${n}`),
      conceptId: concept.id, courseId: concept.courseId, unitId: concept.unitId,
      submittedAt: NOW, attemptNumber: 1, reviewSourceAttemptId: null,
      isCorrect: n % 2 === 0, responseTimeMs: n % 3 ? 1200 : null,
      ...(n % 3 ? { problemSnapshot: { difficulty: n % 6, typeId: n % 4 ? "" : "edge-type", stem: "수식 ".repeat(2000), solution: "풀이 ".repeat(2000) } } : {}),
    })));
    await Problem.collection.insertMany(Array.from({ length: 25 }, (_, n) => ({ _id: id(`edge-problem-${n}`), externalId: `edge-${n}`, difficulty: 4, primaryConceptId: n === 24 ? "different-concept" : concept.id, tags: ["fallback-type"] })));
    await ProblemAttempt.collection.insertMany([false, true].map((isCorrect, n) => ({ _id: id(`retry-${n}`), userId: ids[n + 1], problemId: id("edge-problem-1"), reviewSourceAttemptId: id("edge-attempt-1"), attemptNumber: n + 2, isCorrect, submittedAt: NOW })));
    await same("Math Map: recent window, retries and snapshot fallbacks", () => originalMath.getClassMathMap({ studentUserIds: ids.slice(0, 3) }), () => optimizedMath.getClassMathMap({ studentUserIds: ids.slice(0, 3) }));
    for (const query of [{}, { page: 2, sort: "oldest" }, { status: "completed" }, { status: "scheduled", sort: "difficulty" }]) {
      await same(`Wrong notes: ${JSON.stringify(query)}`, () => originalWrong.getWrongNoteData(student, query), () => optimizedWrong.getWrongNoteData(student, query));
    }
    const params = { academyId: fixture.academy._id, now: NOW };
    await same("Weekly academy: 12 classes and whole academy", () => originalWeekly.getAcademyWeeklyMockInsights(params), () => optimizedWeekly.getAcademyWeeklyMockInsights(params));
    // Preserve MongoDB truthiness/$avg behavior, not JavaScript approximations.
    await PrivateMockExamAttempt.collection.updateOne({ _id: id("exam-attempt-0-0") }, { $set: { score: null, correctByQuestion: [true, false, null, 0, 1, "", "x"] } });
    await PrivateMockExamAttempt.collection.updateOne({ _id: id("exam-attempt-1-0") }, { $set: { integrityStatus: "INVALIDATED" } });
    await PrivateMockExamAttempt.collection.updateOne({ _id: id("exam-attempt-2-0") }, { $set: { "submissionFinalization.status": "processing" } });
    await PrivateMockExamAttempt.collection.updateOne({ _id: id("exam-attempt-3-0") }, { $unset: { integrityStatus: "", score: "" } });
    await same("Weekly academy: excluded/pending/missing fields", () => originalWeekly.getAcademyWeeklyMockInsights(params), () => optimizedWeekly.getAcademyWeeklyMockInsights(params));
    const { AcademyClass, AcademyStudentMembership } = require("../../models/academyModel");
    await AcademyClass.create({ _id: id("empty-class"), academyId: fixture.academy._id, name: "빈반", nameNormalized: "빈반", createdByUserId: id("teacher"), isActive: false });
    await AcademyStudentMembership.updateOne({ studentUserId: ids[0] }, { $set: { classId: null } });
    await same("Weekly academy: archived empty class and unassigned student", () => originalWeekly.getAcademyWeeklyMockInsights(params), () => optimizedWeekly.getAcademyWeeklyMockInsights(params));
    const aggregate = PrivateMockExamAttempt.aggregate;
    let fallbacks = 0;
    try {
      PrivateMockExamAttempt.aggregate = function (pipeline, ...rest) {
        if (pipeline.some((stage) => stage.$facet)) {
          fallbacks++;
          return Promise.reject(Object.assign(new Error("simulated facet limit"), { code: 4031700 }));
        }
        return aggregate.call(this, pipeline, ...rest);
      };
      await same("Weekly academy: memory-limit fallback", () => originalWeekly.getAcademyWeeklyMockInsights(params), () => optimizedWeekly.getAcademyWeeklyMockInsights(params));
      assert.ok(fallbacks >= 2);
    } finally { PrivateMockExamAttempt.aggregate = aggregate; }
    const queryError = Object.assign(new Error("simulated query timeout"), { code: 50 });
    try {
      PrivateMockExamAttempt.aggregate = () => Promise.reject(queryError);
      await assert.rejects(() => optimizedWeekly.getAcademyWeeklyMockInsights(params), (error) => error === queryError);
    } finally { PrivateMockExamAttempt.aggregate = aggregate; }
    await same("Weekly academy: invalid ID", () => originalWeekly.getAcademyWeeklyMockInsights({ academyId: "bad" }), () => optimizedWeekly.getAcademyWeeklyMockInsights({ academyId: "bad" }));
    await same("Weekly academy: no academy data", () => originalWeekly.getAcademyWeeklyMockInsights({ academyId: id("missing-academy") }), () => optimizedWeekly.getAcademyWeeklyMockInsights({ academyId: id("missing-academy") }));
    console.log("All original/optimized equivalence checks passed.");
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
}
if (require.main === module) main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
module.exports = { load, plain, same };
