const GRAPH_VERSION = "kr-2022-math-graph-v1.0";
const MASTERY_MODEL_NAME = "rule-based-mastery";
const MASTERY_MODEL_VERSION = "v1.0";

const NATIONAL_CURRICULUM_SOURCE = {
  sourceType: "national-curriculum",
  title: "교육부 고시 제2022-33호 [별책 8] 수학과 교육과정",
};

function verifiedEdge(from, to, type, weight, rationale, standardCodes) {
  return Object.freeze({
    from,
    to,
    type,
    weight,
    rationale,
    evidence: standardCodes.map((standardCode) => ({
      ...NATIONAL_CURRICULUM_SOURCE,
      standardCode,
    })),
    reviewStatus: "verified",
    reviewedBy: "matths-math-editorial-v1",
    reviewedAt: "2026-08-29T00:00:00.000Z",
  });
}

const CALCULUS_1_EDGES = Object.freeze([
  verifiedEdge("calculus-1-01-01", "calculus-1-01-02", "hard-prerequisite", 1, "극한의 성질을 적용하려면 함수의 극한의 뜻을 먼저 이해해야 한다.", ["12미적Ⅰ-01-01", "12미적Ⅰ-01-02"]),
  verifiedEdge("calculus-1-01-01", "calculus-1-01-03", "hard-prerequisite", 1, "함수의 연속은 극한을 이용하여 정의하고 탐구한다.", ["12미적Ⅰ-01-01", "12미적Ⅰ-01-03"]),
  verifiedEdge("calculus-1-01-03", "calculus-1-01-04", "hard-prerequisite", 1, "연속함수의 성질을 활용하려면 함수의 연속을 이해해야 한다.", ["12미적Ⅰ-01-03", "12미적Ⅰ-01-04"]),
  verifiedEdge("calculus-1-01-02", "calculus-1-01-04", "supporting-prerequisite", 0.7, "연속함수의 성질을 다룰 때 극한의 성질과 계산이 중요한 계산 기반이 된다.", ["12미적Ⅰ-01-02", "12미적Ⅰ-01-04"]),
  verifiedEdge("calculus-1-01-01", "calculus-1-02-01", "hard-prerequisite", 1, "미분계수는 평균변화율의 극한으로 정의된다.", ["12미적Ⅰ-01-01", "12미적Ⅰ-02-01"]),
  verifiedEdge("calculus-1-02-01", "calculus-1-02-02", "hard-prerequisite", 1, "미분가능성과 연속성의 관계를 설명하려면 미분계수의 뜻이 필요하다.", ["12미적Ⅰ-02-01", "12미적Ⅰ-02-02"]),
  verifiedEdge("calculus-1-02-01", "calculus-1-02-03", "supporting-prerequisite", 0.7, "거듭제곱함수의 도함수는 미분계수에서 출발한다.", ["12미적Ⅰ-02-01", "12미적Ⅰ-02-03"]),
  verifiedEdge("calculus-1-02-03", "calculus-1-02-04", "hard-prerequisite", 1, "다항함수의 미분법은 거듭제곱함수의 도함수를 결합하여 계산한다.", ["12미적Ⅰ-02-03", "12미적Ⅰ-02-04"]),
  verifiedEdge("calculus-1-02-01", "calculus-1-02-05", "hard-prerequisite", 1, "접선의 기울기는 미분계수로 구한다.", ["12미적Ⅰ-02-01", "12미적Ⅰ-02-05"]),
  verifiedEdge("calculus-1-02-04", "calculus-1-02-05", "supporting-prerequisite", 0.7, "다항함수의 접선 방정식을 구할 때 도함수 계산이 필요하다.", ["12미적Ⅰ-02-04", "12미적Ⅰ-02-05"]),
  verifiedEdge("calculus-1-01-04", "calculus-1-02-06", "hard-prerequisite", 1, "평균값 정리의 조건을 판단하려면 연속함수의 성질을 이해해야 한다.", ["12미적Ⅰ-01-04", "12미적Ⅰ-02-06"]),
  verifiedEdge("calculus-1-02-02", "calculus-1-02-06", "hard-prerequisite", 1, "평균값 정리의 조건에는 구간에서의 미분가능성이 포함된다.", ["12미적Ⅰ-02-02", "12미적Ⅰ-02-06"]),
  verifiedEdge("calculus-1-02-04", "calculus-1-02-07", "hard-prerequisite", 1, "증가·감소와 극값을 판정하려면 도함수를 계산할 수 있어야 한다.", ["12미적Ⅰ-02-04", "12미적Ⅰ-02-07"]),
  verifiedEdge("calculus-1-02-06", "calculus-1-02-07", "supporting-prerequisite", 0.7, "평균값 정리는 도함수와 함수 변화의 관계를 설명하는 기반이 된다.", ["12미적Ⅰ-02-06", "12미적Ⅰ-02-07"]),
  verifiedEdge("calculus-1-02-07", "calculus-1-02-08", "hard-prerequisite", 1, "함수 그래프의 개형을 그릴 때 증가·감소와 극값 정보를 사용한다.", ["12미적Ⅰ-02-07", "12미적Ⅰ-02-08"]),
  verifiedEdge("calculus-1-02-07", "calculus-1-02-09", "hard-prerequisite", 1, "미분을 이용한 방정식·부등식 해결에는 함수의 증감과 극값 판단이 필요하다.", ["12미적Ⅰ-02-07", "12미적Ⅰ-02-09"]),
  verifiedEdge("calculus-1-02-04", "calculus-1-02-10", "hard-prerequisite", 1, "속도와 가속도를 구하려면 위치함수를 미분할 수 있어야 한다.", ["12미적Ⅰ-02-04", "12미적Ⅰ-02-10"]),
  verifiedEdge("calculus-1-02-04", "calculus-1-03-01", "supporting-prerequisite", 0.7, "부정적분은 미분의 역과정으로 이해한다.", ["12미적Ⅰ-02-04", "12미적Ⅰ-03-01"]),
  verifiedEdge("calculus-1-03-01", "calculus-1-03-02", "hard-prerequisite", 1, "다항함수의 부정적분 계산은 부정적분의 뜻을 바탕으로 한다.", ["12미적Ⅰ-03-01", "12미적Ⅰ-03-02"]),
  verifiedEdge("calculus-1-03-01", "calculus-1-03-04", "hard-prerequisite", 1, "부정적분과 정적분의 관계를 이해하려면 부정적분의 뜻이 필요하다.", ["12미적Ⅰ-03-01", "12미적Ⅰ-03-04"]),
  verifiedEdge("calculus-1-03-03", "calculus-1-03-04", "hard-prerequisite", 1, "부정적분과 정적분의 관계를 적용하려면 정적분의 개념과 성질을 이해해야 한다.", ["12미적Ⅰ-03-03", "12미적Ⅰ-03-04"]),
  verifiedEdge("calculus-1-03-04", "calculus-1-03-05", "hard-prerequisite", 1, "정적분으로 넓이를 구하려면 정적분 계산과 부정적분의 관계가 필요하다.", ["12미적Ⅰ-03-04", "12미적Ⅰ-03-05"]),
  verifiedEdge("calculus-1-03-04", "calculus-1-03-06", "hard-prerequisite", 1, "속도에서 거리와 변위를 구할 때 정적분 계산을 사용한다.", ["12미적Ⅰ-03-04", "12미적Ⅰ-03-06"]),
  verifiedEdge("calculus-1-02-10", "calculus-1-03-06", "supporting-prerequisite", 0.7, "미분에서 다룬 속도·가속도 맥락이 적분의 속도·거리 활용을 지원한다.", ["12미적Ⅰ-02-10", "12미적Ⅰ-03-06"]),
]);

module.exports = {
  CALCULUS_1_EDGES,
  GRAPH_VERSION,
  MASTERY_MODEL_NAME,
  MASTERY_MODEL_VERSION,
};
