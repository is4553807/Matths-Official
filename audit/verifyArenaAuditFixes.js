"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { wave2Batch2Definitions } = require("../services/arenaPdfTranscriptionGenerators/wave2Batch2");
const { rational } = require("../services/arenaPdfPilotGenerators/core");
const { buildNormalBaselineCaptureManifest, chooseAvailableBaselineCombination } = require("../services/arenaNormalBaselineQuestionService");
const { questionInstanceHash } = require("../services/arenaQuestionIdentityService");
const { ratingForArenaMode } = require("../services/arenaV2DifficultyService");
const { publicEvidenceResult, publicCompetitivePointChange } = require("../services/arenaPublicResponseService");
const { problemWithVerifiedVisualization } = require("../services/arenaProblemVisualizationPolicy");

const harmonic = wave2Batch2Definitions.find((item) => item.sourceReferenceId === "2024-09-KICE-CALCULUS-Q29");
assert.equal(harmonic.solve({ firstIndex: 11, secondIndex: 14 }), 23);
assert.equal(harmonic.crossCheck({ firstIndex: 11, secondIndex: 14 }), 23);
// Directly sum the original series, independently of either generator method.
const partial = (m) => {
  let sum = 0;
  for (let n = 1; n <= 100_000; n += 1) sum += (m + 1) / (n * (n + m + 1));
  return sum;
};
for (const m of [1, 2, 11, 14, 20]) assert.ok(Math.abs(partial(m) - partial(m - 1) - 1 / (m + 1)) < 0.000011);

const secant = wave2Batch2Definitions.find((item) => item.sourceReferenceId === "2020-06-KICE-NA-Q26");
const parameters = { selectedA: 4, derivativePoint: 3, quadraticCoefficient: rational(11, 2), linearCoefficient: 7 };
assert.match(secant.render(parameters, 4).prompt, /양의 정수/);
const roots = [];
for (let a = 1; a <= 999; a += 1) if (a * a - 5.5 * a + 7 === 27 - 33 + 7) roots.push(a);
assert.deepEqual(roots, [4]);
assert.equal(secant.solve(parameters), 4);
assert.equal(secant.crossCheck(parameters), 4);
assert.throws(() => secant.solve({ ...parameters, selectedA: 5, derivativePoint: 2, quadraticCoefficient: rational(13, 1) }));
for (let selectedA = 2; selectedA <= 12; selectedA += 1) {
  for (let derivativePoint = 1; derivativePoint <= 6; derivativePoint += 1) {
    if (selectedA === 2 * derivativePoint) continue;
    const quadraticCoefficient = rational(selectedA ** 2 - 3 * derivativePoint ** 2, selectedA - 2 * derivativePoint);
    const coefficient = Number(quadraticCoefficient.n) / Number(quadraticCoefficient.d);
    const fixture = { selectedA, derivativePoint, quadraticCoefficient, linearCoefficient: 7 };
    const roots = [];
    for (let candidate = 1; candidate <= 999; candidate += 1) {
      if (Math.abs(candidate ** 2 - coefficient * candidate + 2 * coefficient * derivativePoint - 3 * derivativePoint ** 2) < 1e-9) roots.push(candidate);
    }
    if (roots.length === 1) { assert.equal(secant.solve(fixture), roots[0]); assert.equal(secant.crossCheck(fixture), roots[0]); }
    else assert.throws(() => secant.solve(fixture));
  }
}


const tilingGenerator = require("../services/arenaPdfTranscriptionGenerators/wave3Batch1").wave3Batch1Definitions
  .find((item) => item.sourceReferenceId === "2019-10-EDUCATION_OFFICE-GA-Q28");
for (const restrictionLevel of [0, 1, 2]) {
  let count = 0;
  for (let diamond = 0; diamond < 4; diamond += 1) {
    if (restrictionLevel >= 1 && diamond !== 1) continue;
    const cells = [0, 1, 2, 3].filter((cell) => cell !== diamond);
    for (let orientation = 0; orientation < 8; orientation += 1) {
      for (let circle = 0; circle < 6; circle += 1) {
        if (restrictionLevel >= 2 && cells[Math.floor(circle / 2)] !== 0) continue;
        for (let star = 0; star < 6; star += 1) if (star !== circle) count += 1;
      }
    }
  }
  assert.equal(tilingGenerator.solve({ restrictionLevel }), count);
  assert.doesNotMatch(tilingGenerator.render({ restrictionLevel }, count).prompt, /○ 조각 두 개/);
}
const manifest = buildNormalBaselineCaptureManifest();
const { arenaQuestionReleaseIssue } = require("../services/arenaQuestionReleaseService");
assert.ok(manifest.questions.every((entry) => !arenaQuestionReleaseIssue(entry.question)));
const harmonicItem = manifest.questions.find((entry) => entry.baselineKey === "NORMAL-U9-Q05");
assert.equal(arenaQuestionReleaseIssue({ ...harmonicItem.question, answer: "179" }), "HARMONIC_ANSWER_REVIEW");
const tiling = manifest.questions.find((item) => item.baselineKey === "NORMAL-U9-Q03");
assert.ok(tiling.question.visualization.rectangles.length);
assert.equal(tiling.question.visualization.presentedInProblem, true);
assert.throws(() => problemWithVerifiedVisualization({ prompt: "다음 그림처럼 도형을 채운다.", visualization: null }), { code: "ARENA_REQUIRED_VISUALIZATION_INVALID" });

const a = { prompt: "same", visualization: { kind: "geometry", nested: { x: 1, y: 2 } }, choices: ["1", "2"] };
const b = { ...a, visualization: { nested: { y: 2, x: 1 }, kind: "geometry" } };
assert.equal(questionInstanceHash(a), questionInstanceHash(b));
assert.equal(questionInstanceHash({ ...a, visualization: { when: new Date("2026-10-11T00:00:00Z") } }), questionInstanceHash({ ...a, visualization: { when: "2026-10-11T00:00:00.000Z" } }));
assert.notEqual(questionInstanceHash(a), questionInstanceHash({ ...a, choices: ["2", "1"] }));
assert.equal(ratingForArenaMode({ rating: null, provisionalRating: 1500, normalMatchmakingRating: 1000 }, "FRIENDLY"), 1000);
assert.equal(ratingForArenaMode({ rating: 1600, placementFinalizedAt: new Date(), normalMatchmakingRating: 1000 }, "FRIENDLY"), 1600);
assert.equal(ratingForArenaMode({}, "FRIENDLY"), 1000);
assert.deepEqual(publicEvidenceResult({ evidenceId: "x", status: "ANOMALY_FLAGGED", anomalyFlags: ["internal"] }), { evidenceId: "x", status: "RECEIVED" });
assert.equal(publicCompetitivePointChange({ before: 1000, after: 1016, delta: 16, tierBefore: "GOLD", tierAfter: "GOLD" }).tierAfterLabel, "골드");

const records = Array.from({ length: 1000 }, (_, index) => ({ _id: String(index), baselineKey: `q${index}`, questionInstanceHash: String(index) }));
const start = Date.now();
assert.equal(chooseAvailableBaselineCombination({ records, challengerUserId: "user", sequence: 1 }).questions.length, 5);
assert.ok(Date.now() - start < 3000);
const invalidConfig = spawnSync(process.execPath, ["-e", "require('./services/goatArenaV2Config')"], { cwd: require("node:path").resolve(__dirname, ".."), env: { ...process.env, ARENA_GLICKO_INITIAL_RD: "invalid" }, encoding: "utf8" });
assert.notEqual(invalidConfig.status, 0);
assert.match(invalidConfig.stderr, /Invalid Arena numeric setting/);
console.log("Arena audit regressions passed: independent math, required geometry, canonical hashes, friendly priority, public response fields, bounded selection and invalid configuration.");
