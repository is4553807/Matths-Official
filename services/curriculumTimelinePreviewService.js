"use strict";

const {
  buildLearningViewModel,
} = require("./curriculumService");
const {
  resolveStudentCurriculumStory,
} = require("./curriculumStoryService");

function findConceptContext(learningData, target) {
  if (!target) return null;

  for (const course of learningData?.courses || []) {
    for (const unit of course.units || []) {
      const concept = (unit.concepts || []).find((item) =>
        target.href
          ? item.href === target.href
          : item.id === target.id
      );
      if (concept) return { course, unit, concept };
    }
  }

  return null;
}

function statusOnly(state, overrides = {}) {
  return {
    state,
    target: null,
    story: null,
    storyStatus: "unavailable",
    ...overrides,
  };
}

function compactStudentStory(story) {
  if (!story || !Array.isArray(story.scenes) || story.scenes.length !== 5) {
    return null;
  }

  // 상단 지도에는 5장면을 다시 펼치지 않는다. 현재 개념과 시작 질문만 남겨
  // 주 행동을 하나로 수렴시키고, 전체 장면은 개념 상세에서만 렌더한다.
  return {
    id: story.id,
    title: story.title,
    openingQuestion: story.openingQuestion,
    estimatedSeconds: story.estimatedSeconds,
  };
}

/**
 * 공개 교육과정 상단에 표시할 단 하나의 기억선을 만든다.
 * 진도 우선순위는 buildLearningViewModel의 continueConcept를 그대로 소비하며,
 * 여기서 해금·완료·과목 범위를 다시 계산하지 않는다.
 */
function buildCurriculumTimelinePreview({
  curriculumData,
  learningData = null,
  loggedIn = false,
  progressUnavailable = false,
  storyResolver = resolveStudentCurriculumStory,
}) {
  if (progressUnavailable) {
    return statusOnly("empty", {
      statusLabel: "진도 연결 안 됨",
      message: "학습 진도를 불러오지 못했습니다. 저장된 진도는 변경되지 않았습니다.",
      ctaHref: "/curriculum",
      ctaLabel: "다시 불러오기",
    });
  }

  const projection = learningData || buildLearningViewModel(curriculumData);
  const target = projection?.continueConcept || null;
  const context = findConceptContext(projection, target);

  if (!target || !context) {
    const catalogHasConcepts = (curriculumData?.courses || []).some((course) =>
      (course.units || []).some((unit) => (unit.concepts || []).length > 0)
    );
    if (loggedIn && catalogHasConcepts && !target) {
      return statusOnly("completed", {
        statusLabel: "학습 완료",
        message: "현재 학습 범위의 모든 개념을 완료했습니다.",
        ctaHref: "/log-curriculum",
        ctaLabel: "완료한 개념 다시 보기",
      });
    }
    return statusOnly("empty", {
      statusLabel: "프리뷰 없음",
      message: "지금 보여드릴 학습 기억선이 없습니다.",
      ctaHref: loggedIn ? "/log-curriculum" : "/login",
      ctaLabel: loggedIn ? "내 교육과정 보기" : "로그인하기",
    });
  }

  const { course, unit, concept } = context;
  const storyResolution = storyResolver({
    courseId: course.id,
    unitId: unit.id,
    conceptId: concept.id,
  });
  const story = compactStudentStory(storyResolution?.story);
  const progress = Number(concept.progress) || 0;
  const targetView = {
    courseId: course.id,
    courseTitle: course.officialTitle || course.title || "",
    unitId: unit.id,
    unitTitle: unit.title || "",
    conceptId: concept.id,
    conceptTitle: concept.title,
    progress,
    href: concept.href,
    estimatedMinutes: Number(concept.lesson?.estimatedMinutes) || 15,
  };

  if (!loggedIn) {
    return {
      state: "locked",
      statusLabel: "로그인 필요",
      lockReason: "로그인하면 이 개념부터 진도를 저장하며 학습할 수 있습니다.",
      message: story
        ? undefined
        : "5개 기억선 노드는 로그인 후 개념 상세에서 확인할 수 있습니다.",
      target: targetView,
      story,
      storyStatus: storyResolution?.status || "unavailable",
      ctaHref: concept.href,
      ctaLabel: "로그인하고 첫 개념 보기",
    };
  }

  if (!story) {
    const editoriallyLocked = ["draft", "invalid"].includes(
      storyResolution?.status
    );
    return {
      state: editoriallyLocked ? "locked" : "empty",
      statusLabel: editoriallyLocked ? "5분 해설 검수 중" : "프리뷰 없음",
      lockReason: editoriallyLocked
        ? "5분 해설을 검수하고 있습니다. 개념 학습은 바로 시작할 수 있습니다."
        : undefined,
      message: editoriallyLocked
        ? "5개 기억선 노드는 원고 검수를 마친 뒤 표시됩니다."
        : "검수된 5분 해설 프리뷰가 아직 없습니다. 개념 학습은 바로 시작할 수 있습니다.",
      target: targetView,
      story: null,
      storyStatus: storyResolution?.status || "unavailable",
      ctaHref: concept.href,
      ctaLabel: progress > 0 ? "이어서 학습" : "개념 시작",
    };
  }

  return {
    state: progress > 0 ? "current" : "next",
    statusLabel: progress > 0 ? "현재 학습" : "다음 학습",
    target: targetView,
    story,
    storyStatus: storyResolution.status,
    ctaHref: concept.href,
    ctaLabel: progress > 0 ? "이어서 학습" : "개념 시작",
  };
}

module.exports = {
  buildCurriculumTimelinePreview,
  compactStudentStory,
  findConceptContext,
};
