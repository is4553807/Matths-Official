/*
 * GOAT Arena 1대1 전용 PDF 스켈레톤 풀 연결 계약.
 *
 * 신규 경기만 이 풀을 사용하고 이미 봉인된 문제 팩은 유지한다. Matths
 * 평가센터와는 어떠한 코드·카탈로그도 공유하지 않는다.
 */

const {
  ARENA_MATCH_DIFFICULTY_PLAN_VERSION,
  ARENA_MATCH_QUESTION_ROLLOUT,
  difficultyRowsForDivision,
} = require("./arenaMatchDifficultyPlan");

const PREPARED_ARENA_QUESTION_POOL = Object.freeze({
  poolId: ARENA_MATCH_QUESTION_ROLLOUT.preparedPoolId,
  ownerDomain: "GOAT_ARENA_ONE_ON_ONE",
  policyVersion: ARENA_MATCH_DIFFICULTY_PLAN_VERSION,
  generatorModulePath: "./arenaPdfTranscriptionGenerators",
  pilotModulePath: "./arenaPdfPilotGenerators",
  sourceCatalogPath:
    "../dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json",
  structureCatalogPath:
    "../dataAnalysis/arenaPdfSkeletonImplementation/canonical-structure-catalog-v1.json",
  runtimeConnected: ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected,
  activationMode: "NEWLY_CREATED_MATCHES_ONLY",
  immutableExistingPacks: true,
  requiredQuestionShape: Object.freeze([
    "typeId",
    "sourceTypeId",
    "problem.prompt",
    "problem.answer",
    "problem.solution",
    "design.sourceDifficultyCode",
    "courseId",
    "validation",
  ]),
});

function preparedArenaQuestionPoolStatus() {
  return Object.freeze({
    ...PREPARED_ARENA_QUESTION_POOL,
    unrankedPlan: difficultyRowsForDivision("SUB"),
    rankedPlan: difficultyRowsForDivision("MAIN"),
    activationChecklist: Object.freeze([
      "전체 스켈레톤의 수식·그래프·정답·풀이 렌더 검증 완료",
      "D1~D9 원문 정답률 근거와 변형 허용 범위 확정",
      "U1~U9와 R1~R9별 서로 다른 5문항 조합 검증",
      "기존 봉인 문제 팩 불변성 및 신규 경기 전용 전환 확인",
      "Arena 전용 PDF 문제 풀 신규 경기 활성화 완료",
    ]),
  });
}

function assertPreparedArenaQuestionPoolConnected() {
  if (
    ARENA_MATCH_QUESTION_ROLLOUT.runtimeConnected !== true ||
    PREPARED_ARENA_QUESTION_POOL.runtimeConnected !== true
  ) {
    throw new Error(
      "Arena PDF 문제 풀이 신규 1대1 경기 경로에 연결되어 있지 않습니다."
    );
  }
  return true;
}

module.exports = {
  PREPARED_ARENA_QUESTION_POOL,
  assertPreparedArenaQuestionPoolConnected,
  preparedArenaQuestionPoolStatus,
};
