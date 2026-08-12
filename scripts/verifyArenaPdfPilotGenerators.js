"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const {
  generateArenaPdfPilotProblem,
  listArenaPdfPilotDefinitions,
  normalizedPilotProblem,
} = require("../services/arenaPdfPilotGenerators");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(
  ROOT,
  "dataAnalysis/arenaPdfSkeletonImplementation/pilot-verification-v2.json"
);
const SAMPLE_COUNT = Math.max(1, Number(process.env.ARENA_PDF_PILOT_SAMPLES || 1000));
const IMPLEMENTED_CONTRACT_STATUSES = new Set([
  "PILOT_READY_MANUAL",
  "STRUCTURE_TEMPLATE_READY",
]);
const PRODUCTION_BOUNDARY_FILES = [
  "services/assessmentService.js",
  "services/arenaOneOnOneProblemBank.js",
  "services/arenaTierQuestionCatalogService.js",
  "services/arenaProblemPackService.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function main() {
  const definitions = listArenaPdfPilotDefinitions();
  assert(definitions.length === 32, `expected 32 definitions, got ${definitions.length}`);
  assert(new Set(definitions.map((item) => item.id)).size === 32, "duplicate pilot id");
  assert(
    new Set(definitions.map((item) => item.canonicalStructureId)).size === 32,
    "duplicate canonical structure id"
  );
  assert(new Set(definitions.map((item) => item.sourceReferenceId)).size === 32, "source coverage is incomplete");
  assert(definitions.every((item) => item.productionConnected === false), "pilot is production-connected");
  const contractCatalog = JSON.parse(
    fs.readFileSync(
      path.join(
        ROOT,
        "dataAnalysis/arenaPdfSkeletonImplementation/structure-contracts-v1.json"
      ),
      "utf8"
    )
  );
  const implementedContracts = new Map(
    contractCatalog.contracts
      .filter((contract) => IMPLEMENTED_CONTRACT_STATUSES.has(contract.status))
      .map((contract) => [contract.sourceCoverage.representativeSourceId, contract])
  );
  assert(
    implementedContracts.size === 32,
    `expected 32 implemented contracts, got ${implementedContracts.size}`
  );
  for (const definition of definitions) {
    const contract = implementedContracts.get(definition.sourceReferenceId);
    assert(Boolean(contract), `${definition.id} has no implemented contract`);
    assert(
      contract.canonicalStructureId === definition.canonicalStructureId,
      `${definition.id} canonical structure does not match its contract`
    );
  }
  for (const relativeFile of PRODUCTION_BOUNDARY_FILES) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), "utf8");
    assert(
      !source.includes("arenaPdfPilotGenerators"),
      `${relativeFile} imports the isolated pilot runtime`
    );
  }

  const startedAt = new Date();
  const results = [];
  for (const definition of definitions) {
    const parameterVariants = new Set();
    const answers = new Set();
    const hashes = [];
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const seed = `${definition.id}:verification:${sample}`;
      const generated = generateArenaPdfPilotProblem(definition.id, seed);
      const repeated = generateArenaPdfPilotProblem(definition.id, seed);
      const normalized = normalizedPilotProblem(generated);
      assert(normalized === normalizedPilotProblem(repeated), `${definition.id} is not deterministic`);
      assert(generated.validation?.passed === true, `${definition.id} validation failed`);
      assert(
        generated.validation?.independentCrossCheck === true,
        `${definition.id} independent cross-check missing`
      );
      assert(
        generated.validation?.productionConnected === false,
        `${definition.id} leaked into production state`
      );
      const answer = Number(generated.problem?.answer);
      assert(Number.isInteger(answer) && answer >= 1 && answer <= 999, `${definition.id} invalid answer`);
      const prompt = String(generated.problem?.prompt || "");
      const solution = String(generated.problem?.solution || "");
      assert(prompt.length >= 40, `${definition.id} prompt too short`);
      assert(solution.length >= 20, `${definition.id} solution too short`);
      const mathSource = `${prompt}\n${solution}`;
      const mathOpenCount = (mathSource.match(/\\\\\(/g) || []).length;
      const mathCloseCount = (mathSource.match(/\\\\\)/g) || []).length;
      assert(mathOpenCount === mathCloseCount, `${definition.id} has unbalanced MathJax delimiters`);
      const contract = implementedContracts.get(definition.sourceReferenceId);
      if (contract.renderContract.visualMode !== "NONE") {
        assert(Boolean(generated.problem?.visualization), `${definition.id} required visual is missing`);
      }
      parameterVariants.add(JSON.stringify(generated.parameters));
      answers.add(answer);
      hashes.push(sha256(normalized));
    }
    assert(parameterVariants.size >= 4, `${definition.id} has too few parameter variants`);
    assert(answers.size >= 2, `${definition.id} has too few answer variants`);
    results.push({
      typeId: definition.id,
      sourceReferenceId: definition.sourceReferenceId,
      canonicalStructureId: definition.canonicalStructureId,
      samples: SAMPLE_COUNT,
      parameterVariantCount: parameterVariants.size,
      answerVariantCount: answers.size,
      normalizedSampleSetHash: sha256(hashes.join("\n")),
      oracleDisagreements: 0,
      invalidAnswers: 0,
      deterministicFailures: 0,
    });
    console.log(
      `${definition.id}: ${SAMPLE_COUNT} samples, ${parameterVariants.size} parameter variants, ${answers.size} answers`
    );
  }

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt.getTime(),
    productionConnected: false,
    contractStatusMatched: true,
    implementedContractStatuses: [...IMPLEMENTED_CONTRACT_STATUSES],
    productionBoundaryChecked: PRODUCTION_BOUNDARY_FILES,
    definitionCount: definitions.length,
    totalSamples: definitions.length * SAMPLE_COUNT,
    acceptance: {
      oracleDisagreements: 0,
      invalidAnswers: 0,
      deterministicFailures: 0,
      passed: true,
    },
    results,
  };
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
}

main();
