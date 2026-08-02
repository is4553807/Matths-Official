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

const PROJECT_ROOT = path.resolve(__dirname, "..");

function relativeFile(file) {
  return path.relative(PROJECT_ROOT, path.resolve(PROJECT_ROOT, file));
}

function getAdminProblemBankCatalog() {
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
        name: "GOAT Arena 1대1 문제 유형",
        file: relativeFile("services/arenaOneOnOneProblemTypes.js"),
        purpose: `배치고사와 분리된 Arena 전용 준킬러 유형 ${Object.values(ARENA_ONE_ON_ONE_PROBLEM_TYPES).filter((definition) => definition.category === "semi-killer").length}개와 자동 검산`,
        status: "Arena 전용 독립 파일",
      },
      {
        name: "GOAT Arena 1대1 티어 조합",
        file: relativeFile("services/arenaOneOnOneProblemBank.js"),
        purpose: `티어 조합별 30묶음·묶음당 5유형 (${configuredArenaPacks}/${totalArenaPacks}묶음 연결)`,
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
