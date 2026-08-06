/*
 * Ranked는 소속과 무관한 하나의 통합 경쟁 풀이다. 아래의 과거 소속 코드는
 * 기존 문서의 안전한 읽기와 이력 표시를 위해서만 남겨두며, 매칭·티어 순위
 * 또는 정산의 필터로 사용하지 않는다.
 */
const MAIN_COMPETITIVE_POOLS = Object.freeze(["ALL"]);

const MAIN_COMPETITIVE_POOL_LABELS = Object.freeze({
  ALL: "통합 Ranked",
});

function resolveArenaAffiliationCategory(user = {}) {
  switch (Number(user.schoolGrade)) {
    case 13:
      return "RETAKER";
    case 14:
      return "UNIVERSITY";
    case 15:
      return "WORKER";
    case 10:
    case 11:
    case 12:
    default:
      /* 가입 이전의 레거시 계정도 기존 고등학생 기본값과 호환한다. */
      return "HIGH_SCHOOL";
  }
}

function resolveMainCompetitivePool() {
  return "ALL";
}

function normalizeMainCompetitivePool() {
  return "ALL";
}

function mainCompetitivePoolLabel() {
  return MAIN_COMPETITIVE_POOL_LABELS.ALL;
}

function arenaAffiliationLabel(user = {}) {
  const affiliation = resolveArenaAffiliationCategory(user);
  if (affiliation === "UNIVERSITY") {
    return String(user.university?.name || "대학교 미설정");
  }
  if (affiliation === "RETAKER") {
    return "N수생";
  }
  if (affiliation === "WORKER") {
    return "직장인";
  }
  return String(user.school?.name || "학교 미설정");
}

module.exports = {
  MAIN_COMPETITIVE_POOLS,
  MAIN_COMPETITIVE_POOL_LABELS,
  arenaAffiliationLabel,
  mainCompetitivePoolLabel,
  normalizeMainCompetitivePool,
  resolveArenaAffiliationCategory,
  resolveMainCompetitivePool,
};
