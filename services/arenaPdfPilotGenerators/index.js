"use strict";

/*
 * PDF 원문 구조를 재현하는 GOAT Arena 전용 파일럿 생성기다.
 *
 * 이 모듈은 평가센터와 운영 1대1 문제은행 어디에서도 import하지 않는다.
 * 대량 검산과 렌더링을 통과한 뒤 별도 연결 단계에서만 운영 후보가 된다.
 */
const { generateFromDefinition, stableStringify } = require("./core");
const { countingDefinitions } = require("./counting");
const { calculusDefinitions } = require("./calculus");
const { discreteDefinitions } = require("./discrete");
const { probabilityExpansionDefinitions } = require("./expansionProbability");
const { algebraExpansionDefinitions } = require("./expansionAlgebra");
const { calculusExpansionDefinitions } = require("./expansionCalculus");

const PILOT_DEFINITIONS = Object.freeze(
  [
    ...countingDefinitions,
    ...calculusDefinitions,
    ...discreteDefinitions,
    ...probabilityExpansionDefinitions,
    ...algebraExpansionDefinitions,
    ...calculusExpansionDefinitions,
  ].map((definition) => Object.freeze(definition))
);

const PILOT_DEFINITION_BY_ID = new Map(
  PILOT_DEFINITIONS.map((definition) => [definition.id, definition])
);

function listArenaPdfPilotDefinitions() {
  return PILOT_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    courseId: definition.courseId,
    sourceReferenceId: definition.sourceReferenceId,
    canonicalStructureId: definition.canonicalStructureId,
    productionConnected: false,
  }));
}

function generateArenaPdfPilotProblem(typeId, seed) {
  const definition = PILOT_DEFINITION_BY_ID.get(String(typeId));
  if (!definition) throw new Error(`Unknown Arena PDF pilot type: ${typeId}`);
  return generateFromDefinition(definition, seed);
}

function generateAllArenaPdfPilotProblems(seedPrefix = "pilot") {
  return PILOT_DEFINITIONS.map((definition, index) =>
    generateArenaPdfPilotProblem(definition.id, `${seedPrefix}:${index + 1}`)
  );
}

function normalizedPilotProblem(problem) {
  return stableStringify(problem);
}

module.exports = {
  PILOT_DEFINITIONS,
  generateAllArenaPdfPilotProblems,
  generateArenaPdfPilotProblem,
  listArenaPdfPilotDefinitions,
  normalizedPilotProblem,
};
