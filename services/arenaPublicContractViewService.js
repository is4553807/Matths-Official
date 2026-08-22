const {
  learningPackagePolicyView,
} = require("./arenaPolicyService");

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function paybackRates(policy) {
  return Array.isArray(policy?.payback?.bands)
    ? policy.payback.bands
        .map((band) => Number(band?.ratePercent))
        .filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)
    : [];
}

/**
 * 공개 화면이 이미 활성화된 학습권 정책을 설명할 때 쓰는 표시 전용 모델이다.
 * 경기·정산 규칙을 계산하지 않고, 정책 정본에 저장된 기간·출석·페이백 비율만
 * 읽는다. 활성 정책이 없을 때는 arenaPolicyService의 공식 기본 정책을 사용한다.
 */
function arenaPublicContractView(activePolicy) {
  const fallback = learningPackagePolicyView(null);
  const policy = learningPackagePolicyView(activePolicy);
  const rates = paybackRates(policy);
  const fallbackRates = paybackRates(fallback);

  return Object.freeze({
    learningCycleDays: positiveInteger(
      policy.initialLearningDays,
      fallback.initialLearningDays
    ),
    minimumAttackParticipationDays: positiveInteger(
      policy.payback?.minimumAttackParticipationDays,
      fallback.payback.minimumAttackParticipationDays
    ),
    maximumPaybackRatePercent: Math.max(
      ...(rates.length ? rates : fallbackRates)
    ),
  });
}

module.exports = {
  arenaPublicContractView,
};
