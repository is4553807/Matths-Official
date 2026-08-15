"use strict";

const LEGACY_IPAD_WEB_PREFIX = "web-";

/**
 * 개념 진도의 문제 유형 ID 정본.
 *
 * 구 iPad는 웹 생성기 유형을 `web-<typeId>`로 저장했지만 웹은 `<typeId>`를
 * 그대로 저장했다. 둘을 별도 유형으로 세면 같은 문제를 두 번 맞힌 것만으로
 * 완료 게이트가 열릴 수 있으므로 진도 경계에서만 옛 접두사를 제거한다.
 */
function canonicalProgressTypeId(value) {
  const typeId = String(value ?? "").trim();
  if (!typeId) return "";
  return typeId.startsWith(LEGACY_IPAD_WEB_PREFIX)
    ? typeId.slice(LEGACY_IPAD_WEB_PREFIX.length)
    : typeId;
}

function canonicalProgressTypeIds(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(canonicalProgressTypeId)
        .filter(Boolean)
    ),
  ];
}

function canonicalProgressView(progress) {
  const gate = progress?.masteryGate || {};
  const requiredDistinctTypes = Math.max(
    1,
    Number(gate.requiredDistinctTypes) || 5
  );
  const correctTypeIds = canonicalProgressTypeIds(gate.correctTypeIds);
  const topicCount = Math.max(0, Number(progress?.topicCount) || 0);
  const completedTopicIndexes = [
    ...new Set(
      (progress?.completedTopicIndexes || [])
        .map(Number)
        .filter(
          (index) =>
            Number.isInteger(index) &&
            index >= 0 &&
            (topicCount === 0 || index < topicCount)
        )
    ),
  ].sort((left, right) => left - right);
  const masteryUnlocked = correctTypeIds.length >= requiredDistinctTypes;
  const userCompleted = masteryUnlocked && gate.userCompleted === true;
  const topicProgress = topicCount
    ? Math.round((completedTopicIndexes.length / topicCount) * 30)
    : 0;
  const problemProgress = Math.round(
    Math.min(correctTypeIds.length / requiredDistinctTypes, 1) * 60
  );
  const completionPercent = userCompleted
    ? 100
    : Math.min(90, topicProgress + problemProgress);

  return {
    requiredDistinctTypes,
    correctTypeIds,
    completedTopicIndexes,
    completedTopics: completedTopicIndexes.length,
    masteryUnlocked,
    userCompleted,
    completionPercent,
    status:
      completionPercent >= 100
        ? "completed"
        : completionPercent > 0
          ? "in-progress"
          : "not-started",
  };
}

module.exports = {
  LEGACY_IPAD_WEB_PREFIX,
  canonicalProgressTypeId,
  canonicalProgressTypeIds,
  canonicalProgressView,
};
