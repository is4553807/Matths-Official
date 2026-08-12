#!/usr/bin/env node

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ledgerPath = path.join(
  root,
  "dataAnalysis/arenaPdfSkeletonImplementation/source-ledger-v1.json"
);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function main() {
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  assert.equal(
    ledger.schemaVersion,
    "ARENA_PDF_SKELETON_SOURCE_LEDGER_V1"
  );
  assert.equal(ledger.sourcePdf.auditedQuestionCount, 982);
  assert.equal(ledger.sourcePdf.pageCount, 994);
  assert.equal(
    ledger.sourcePdf.sha256,
    "ec4109c3fc5c3dfbdf347564d064570b259833894aa22a0d9b66c7f1831a7893"
  );
  assert.equal(ledger.records.length, 629);
  assert.equal(new Set(ledger.records.map((record) => record.sourceId)).size, 629);
  assert.deepEqual(ledger.summary.byDifficultyClass, {
    BASIC_GENERAL: 60,
    GENERAL: 92,
    KILLER: 241,
    SEMI_KILLER: 149,
    UPPER_GENERAL: 87,
  });
  assert.deepEqual(ledger.summary.byCourse, {
    algebra: 196,
    "calculus-1": 192,
    "common-math-1": 1,
    "common-math-2": 30,
    "probability-statistics": 210,
  });
  assert.deepEqual(ledger.summary.byImplementationWave, {
    WAVE_1_HIGH_DIFFICULTY: 390,
    WAVE_2_UPPER_GENERAL: 87,
    WAVE_3_GENERAL_FOUNDATION: 152,
  });
  for (const [index, record] of ledger.records.entries()) {
    assert.equal(record.ledgerIndex, index + 1);
    assert.ok(record.sourceId);
    assert.ok(record.source.problemUrl);
    assert.ok(record.source.solutionUrl);
    assert.ok(record.curriculum.courseId);
    assert.ok(record.curriculum.familyId);
    assert.notEqual(record.difficulty.difficultyClass, "UNRESOLVED");
    assert.ok(
      ["EXACT", "CENSORED_BOUND"].includes(
        record.difficulty.classificationConfidence
      )
    );
    assert.equal(record.implementation.status, "PENDING_STEP_2_DECOMPOSITION");
    assert.equal(record.implementation.canonicalStructureId, null);
    assert.equal(record.implementation.manualScreenshotReviewRequired, true);
  }
  const { contentHash, ...ledgerCore } = ledger;
  assert.equal(
    contentHash,
    sha256(JSON.stringify(canonicalize(ledgerCore)))
  );
  console.log(
    `Arena PDF skeleton source ledger verified: records=${ledger.records.length} hash=${contentHash}`
  );
}

main();
