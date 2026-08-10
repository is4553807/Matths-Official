const path = require("node:path");
const {
  SUB_TIER_PAIR_CONFIG,
} = require("./arenaOneOnOneProblemBank");
const {
  PLACEMENT_ADVANCED_TYPES,
} = require("./placementAdvancedTypes");
const {
  ARENA_ONE_ON_ONE_PROBLEM_TYPES,
} = require("./arenaOneOnOneProblemTypes");
const {
  ARENA_ONE_ON_ONE_TYPE_SKELETONS,
} = require("./arenaOneOnOneTypeSkeletons");
const {
  getOfficialMockResearchSummary,
} = require("./arenaOfficialMockResearchCatalog");
const {
  getPrivateMockResearchSummary,
} = require("./arenaPrivateMockResearchCatalog");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function relativeFile(file) {
  return path.relative(PROJECT_ROOT, path.resolve(PROJECT_ROOT, file));
}

function getAdminProblemBankCatalog() {
  const officialResearch = getOfficialMockResearchSummary();
  const privateResearch = getPrivateMockResearchSummary();
  const configuredArenaPacks = SUB_TIER_PAIR_CONFIG.reduce(
    (sum, pair) =>
      sum +
      pair.packSlots.filter((pack) =>
        pack.questionSlots.every(
          (slot) => slot.typeKey && typeof slot.generator === "function"
        )
      ).length,
    0
  );
  const totalArenaPacks = SUB_TIER_PAIR_CONFIG.reduce(
    (sum, pair) => sum + pair.packSlots.length,
    0
  );
  return {
    editableInBrowser: false,
    safetyReason:
      "문제 생성기는 서버에서 실행되는 코드이므로 관리자 화면에서 임의 JavaScript를 저장·실행하게 하면 서버 보안과 자동 검산을 우회할 수 있습니다.",
    officialResearch,
    privateResearch,
    items: [
      {
        name: "배치고사 문제 은행",
        file: relativeFile("services/placementExamBank.js"),
        purpose: "30문항 배치고사 구성·배점·문항 생성",
        status: "코드 수정 필요",
      },
      {
        name: "배치고사 심화 유형 은행",
        file: relativeFile("services/placementAdvancedTypes.js"),
        purpose: `준킬러·킬러 심화 유형 ${Object.keys(PLACEMENT_ADVANCED_TYPES).length}개와 자동 검산`,
        status: "코드 수정 필요",
      },
      {
        name: "GOAT Arena 1대1 난이도·유형 설계표",
        file: relativeFile("services/arenaOneOnOneDifficultyPolicy.js"),
        purpose: "Division·방어자 기준 U1~U9·R1~R9와 난이도 곡선을 관리합니다. U1~U6은 5문항 준킬러, R1~R6은 1~4번 준킬러·5번 킬러, U7~U9·R7~R9은 5문항 전부 29·30번형 킬러입니다.",
        status: "정책 골격 연결 완료",
      },
      {
        name: "GOAT Arena 1대1 5과목 유형 골격",
        file: relativeFile("services/arenaOneOnOneTypeSkeletons.js"),
        purpose: `공통수학Ⅰ·Ⅱ·대수·확률과 통계·미적분Ⅰ의 U/R 일반·최종 유형 ${Object.keys(ARENA_ONE_ON_ONE_TYPE_SKELETONS).length}개`,
        status: "2016~2026 고3 3·5·6·7·9·10·11월 모의고사 유형 분류 연결 완료 · 숫자 생성기는 승인된 유형만 활성화",
      },
      {
        name: "GOAT Arena 공식 모의평가 유형 조사",
        file: relativeFile("dataAnalysis/arenaOfficialMockTypeCatalog2016_2026.json"),
        purpose: `고3 3·5·6·7·9·10·11월 전국연합학력평가·모의평가 ${officialResearch.sourceForms}개 형식의 대상 문항 ${officialResearch.targetQuestionReferences}건을 ${officialResearch.familyStats.length}개 사고 유형과 U/R 설계 난이도로 분류`,
        status: `${officialResearch.activeReferences}건 사용 · ${officialResearch.excludedReferences}건 교육과정 제외 · 검토 보류 ${officialResearch.reviewRequired}건`,
      },
      {
        name: "GOAT Arena 공개 사설 모의고사 난이도 조사",
        file: relativeFile("dataAnalysis/arenaPrivateMockResearchCatalog.json"),
        purpose: `공식 무료 배포 사설 모의고사 ${privateResearch.reviewedSources}개를 문제지·정답·해설·문항별 정답률·표본·이용조건 기준으로 검토`,
        status: `실제 보정 ${privateResearch.activeCalibrationSources}개 · 연구 전용 ${privateResearch.researchOnlySources}개 · 과거 검증 ${privateResearch.historicalOnlySources}개 · 제외 ${privateResearch.excludedSources}개`,
      },
      {
        name: "GOAT Arena 사설 구조 기반 자체 생성·정답 JSON",
        file: relativeFile("services/arenaPrivateMockProblemTypes.js"),
        purpose: `사설 원문을 복제하지 않은 추상 구조 생성기 ${privateResearch.integratedAbstractGenerators}개와 숫자·정답·단계별 풀이 동시 생성`,
        status: "독립 검산·구조화 정답 JSON 자동채점 연결 완료",
      },
      {
        name: "GOAT Arena 생성형 정답 JSON 규격",
        file: relativeFile("dataAnalysis/arenaGeneratedAnswerKey.schema.json"),
        purpose: "정답·생성 매개변수·단계별 풀이·검산 결과·무결성 해시 저장 규격",
        status: "신규 자동 생성 경기 문항에 적용",
      },
      {
        name: "GOAT Arena 2028 수학 출제 정합성",
        file: relativeFile("dataAnalysis/arena2028MathAlignment.json"),
        purpose: "2028 수능 수학의 직접 출제 과목·기초 연계 과목·행동 영역·그래프와 표 해석 기준",
        status: "공식 예시문항 수학 영역 검토 완료",
      },
      {
        name: "GOAT Arena U1~U9·R1~R9 DB 카탈로그",
        file: relativeFile("services/arenaTierQuestionCatalogService.js"),
        purpose: "승인 생성기 검산, 참고 문항 270개 버전, 관리자 유형 추가와 신규 경기 무중단 반영",
        status: "관리자 화면에서 안전한 유형 추가 가능",
      },
      {
        name: "GOAT Arena 1대1 문제 유형",
        file: relativeFile("services/arenaOneOnOneProblemTypes.js"),
        purpose: `배치고사와 분리된 Arena 전용 준킬러 ${Object.values(ARENA_ONE_ON_ONE_PROBLEM_TYPES).filter((definition) => definition.category === "semi-killer").length}개 중 3자리 이하 자연수 답 조건을 충족하는 ${Object.values(ARENA_ONE_ON_ONE_PROBLEM_TYPES).filter((definition) => definition.arenaNaturalAnswerEligible === true).length}개 생성 유형과 자동 검산`,
        status: "수학 생성 로직 배포용 · 유형 배정은 관리자 DB 버전으로 변경 가능",
      },
      {
        name: "GOAT Arena 1대1 티어 조합",
        file: relativeFile("services/arenaOneOnOneProblemBank.js"),
        purpose: `티어 조합별 30묶음·묶음당 서로 다른 5유형·U1~U6 전 문항 준킬러·R1~R6 5번 킬러·U7~U9와 R7~R9 전 문항 킬러 배정 (${configuredArenaPacks}/${totalArenaPacks}묶음 연결)`,
        status:
          configuredArenaPacks === totalArenaPacks
            ? "연결 완료"
            : "유형 연결 대기",
      },
      {
        name: "학습·평가 문제 생성기",
        file: relativeFile("services/problemGenerators/index.js"),
        purpose: "대수·미적분Ⅰ·확률과 통계의 단원별 숫자 생성 문제",
        status: "코드 수정 필요",
      },
      {
        name: "평가지 구성 템플릿",
        file: relativeFile("services/assessmentTemplates/index.js"),
        purpose: "단원·과목·통합 평가의 문항 조합",
        status: "코드 수정 필요",
      },
      {
        name: "Matths 주간 공식 모의고사",
        file: null,
        sourceType: "ADMIN_UPLOAD",
        purpose: "운영자가 올린 PDF·정답·배점으로 응시하고 내부 실력 지표를 정산",
        status: "관리자 업로드 가능",
      },
      {
        name: "기출 유형 참고 목록",
        file: relativeFile("services/assessmentReferences/mockExamCatalog.js"),
        purpose: "최근 모의고사 유형 분석에 사용하는 참고 메타데이터",
        status: "코드 수정 필요",
      },
    ],
  };
}

module.exports = {
  getAdminProblemBankCatalog,
};
