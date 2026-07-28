const RANKING_DISPLAY_MODES = Object.freeze([
  "nickname",
  "realName",
]);

function normalizeRealName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function validateRealName(value) {
  const realName = normalizeRealName(value);

  if (realName.length < 2 || realName.length > 40) {
    return {
      valid: false,
      realName,
      message: "실명은 2자 이상 40자 이하로 입력해주세요.",
    };
  }

  if (
    !/^[\p{L}][\p{L}\p{M}\s.'’-]*$/u.test(realName)
  ) {
    return {
      valid: false,
      realName,
      message:
        "실명에는 한글·영문과 이름에 쓰이는 공백, 마침표, 작은따옴표, 하이픈만 사용할 수 있습니다.",
    };
  }

  return {
    valid: true,
    realName,
    message: null,
  };
}

function normalizeRankingDisplayMode(value) {
  const mode = String(value || "").trim();

  return RANKING_DISPLAY_MODES.includes(mode)
    ? mode
    : null;
}

function getRankingDisplayName(user) {
  const mode = normalizeRankingDisplayMode(
    user?.preferences?.rankingDisplayMode
  );

  if (mode === "realName" && user?.realName) {
    return String(user.realName);
  }

  return String(user?.name || "익명 학생");
}

module.exports = {
  RANKING_DISPLAY_MODES,
  getRankingDisplayName,
  normalizeRankingDisplayMode,
  normalizeRealName,
  validateRealName,
};
