"use strict";

/*
 * GOAT Arena 1대1 전용 PDF 스켈레톤 런타임. Matths 평가센터와 분리되어
 * 있으며 신규 경기의 전용 어댑터를 통해서만 운영 문제 팩에 들어간다.
 */
const path = require("node:path");
const fs = require("node:fs");
const { generateFromDefinition, stableStringify } = require("../arenaPdfPilotGenerators/core");
const { wave1Batch1Definitions } = require("./wave1Batch1");
const { wave1Batch2Definitions } = require("./wave1Batch2");
const { wave1Batch3Definitions } = require("./wave1Batch3");
const { wave2Batch1Definitions } = require("./wave2Batch1");
const { wave2Batch2Definitions } = require("./wave2Batch2");
const { wave2Batch3Definitions } = require("./wave2Batch3");
const { wave2Batch4Definitions } = require("./wave2Batch4");
const { wave3Batch1Definitions } = require("./wave3Batch1");
const {
  ARENA_MATCH_QUESTION_ROLLOUT,
} = require("../arenaMatchDifficultyPlan");
const {
  assessmentSurfaceIssues,
  extractMathFragments,
  normalizeRenderedAssessmentProblem,
} = require("./surfaceQuality");

const ROOT = path.resolve(__dirname, "../..");
const blueprints = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "dataAnalysis/arenaPdfSkeletonImplementation/generator-blueprints-v1.json"),
    "utf8"
  )
);
const blueprintBySource = new Map(
  blueprints.blueprints.map((blueprint) => [blueprint.sourceId, blueprint])
);

const DEFINITIONS = Object.freeze(
  [
    ...wave1Batch1Definitions.map((definition) => ({ ...definition, implementationBatch: "wave1-batch1" })),
    ...wave1Batch2Definitions.map((definition) => ({ ...definition, implementationBatch: "wave1-batch2" })),
    ...wave1Batch3Definitions.map((definition) => ({ ...definition, implementationBatch: "wave1-batch3" })),
    ...wave2Batch1Definitions.map((definition) => ({ ...definition, implementationBatch: "wave2-batch1" })),
    ...wave2Batch2Definitions.map((definition) => ({ ...definition, implementationBatch: "wave2-batch2" })),
    ...wave2Batch3Definitions.map((definition) => ({ ...definition, implementationBatch: "wave2-batch3" })),
    ...wave2Batch4Definitions.map((definition) => ({ ...definition, implementationBatch: "wave2-batch4" })),
    ...wave3Batch1Definitions.map((definition) => ({ ...definition, implementationBatch: "wave3-batch1" })),
  ].map((definition) => {
    const blueprint = blueprintBySource.get(definition.sourceReferenceId);
    if (!blueprint) throw new Error(`Missing generator blueprint: ${definition.sourceReferenceId}`);
    const rawRender = definition.render;
    return Object.freeze({
      ...definition,
      render(parameters, answer) {
        return normalizeRenderedAssessmentProblem(rawRender(parameters, answer));
      },
      canonicalStructureId: blueprint.canonicalStructureId,
      generatorContractId: blueprint.generatorContractId,
      familyId: blueprint.semanticContract.familyId,
      targetContract: blueprint.semanticContract.targetContract,
      visualContract: blueprint.semanticContract.visualContract,
      productionConnected: ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected,
      implementationBatch: definition.implementationBatch,
    });
  })
);
const DEFINITION_BY_ID = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));

function listArenaPdfTranscriptionDefinitions() {
  return DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    sourceReferenceId: definition.sourceReferenceId,
    canonicalStructureId: definition.canonicalStructureId,
    generatorContractId: definition.generatorContractId,
    familyId: definition.familyId,
    targetContract: definition.targetContract,
    visualContract: definition.visualContract,
    productionConnected: ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected,
    implementationBatch: definition.implementationBatch,
  }));
}

function generateArenaPdfTranscriptionProblem(typeId, seed) {
  const definition = DEFINITION_BY_ID.get(String(typeId));
  if (!definition) throw new Error(`Unknown transcription generator: ${typeId}`);
  const generated = generateFromDefinition(definition, seed);
  const surfaceIssues = assessmentSurfaceIssues(generated.problem);
  if (surfaceIssues.length > 0) {
    throw new Error(`${typeId} failed assessment surface quality: ${JSON.stringify(surfaceIssues.slice(0, 5))}`);
  }
  return {
    ...generated,
    validation: {
      ...generated.validation,
      assessmentSurfaceQuality: true,
      productionConnected: ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected,
    },
  };
}

function normalizedTranscriptionProblem(problem) {
  return stableStringify(problem);
}

module.exports = {
  assessmentSurfaceIssues,
  DEFINITIONS,
  extractMathFragments,
  generateArenaPdfTranscriptionProblem,
  listArenaPdfTranscriptionDefinitions,
  normalizedTranscriptionProblem,
};
