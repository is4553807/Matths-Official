const { randomUUID } = require("crypto");
const {
  ConceptProgress,
  LearningEvent,
} = require("../models/matthsModel");
const {
  loadCurriculum,
  conceptKey,
  buildLearningViewModel,
  findCurriculumConcept,
} = require("./curriculumService");

function progressDocumentsToInput(progressDocuments) {
  const concepts = {};

  for (const progress of progressDocuments) {
    const key = conceptKey(
      progress.courseId,
      progress.unitId,
      progress.conceptId
    );

    concepts[key] = {
      percent: progress.completionPercent || 0,
      completedTopics: progress.completedTopics || 0,
      completedTopicIndexes: progress.completedTopicIndexes || [],
    };
  }

  return { concepts };
}

async function getUserLearningData(userId) {
  const curriculumData = loadCurriculum();
  const curriculumId = curriculumData.curriculum?.id || "kr-2022";

  const progressDocuments = await ConceptProgress.find({
    userId,
    curriculumId,
  }).lean();

  const learningProgress = progressDocumentsToInput(progressDocuments);
  const learningData = buildLearningViewModel(
    curriculumData,
    learningProgress
  );

  return {
    curriculumData,
    learningData,
  };
}

async function updateTopicCompletion({
  userId,
  courseId,
  unitId,
  conceptId,
  topicIndex,
  completed,
  sessionId,
}) {
  const curriculumData = loadCurriculum();
  const curriculumId = curriculumData.curriculum?.id || "kr-2022";
  const curriculumItem = findCurriculumConcept(
    curriculumData,
    courseId,
    unitId,
    conceptId
  );

  if (!curriculumItem) {
    const error = new Error("교육과정에서 해당 개념을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const topics = Array.isArray(curriculumItem.concept.topics)
    ? curriculumItem.concept.topics
    : [];
  const normalizedTopicIndex = Number(topicIndex);

  if (
    !Number.isInteger(normalizedTopicIndex) ||
    normalizedTopicIndex < 0 ||
    normalizedTopicIndex >= topics.length
  ) {
    const error = new Error("올바른 학습 항목을 선택해주세요.");
    error.status = 400;
    throw error;
  }

  if (typeof completed !== "boolean") {
    const error = new Error("완료 상태는 boolean 값이어야 합니다.");
    error.status = 400;
    throw error;
  }

  let progress = await ConceptProgress.findOne({
    userId,
    curriculumId,
    courseId,
    unitId,
    conceptId,
  });

  if (!progress) {
    progress = new ConceptProgress({
      userId,
      curriculumId,
      courseId,
      unitId,
      conceptId,
      topicCount: topics.length,
      completedTopicIndexes: [],
    });
  }

  const completedIndexes = new Set(
    (progress.completedTopicIndexes || []).map(Number)
  );

  if (completed) {
    completedIndexes.add(normalizedTopicIndex);
  } else {
    completedIndexes.delete(normalizedTopicIndex);
  }

  progress.topicCount = topics.length;
  progress.completedTopicIndexes = [...completedIndexes].sort(
    (left, right) => left - right
  );
  progress.lastStudiedAt = new Date();

  await progress.save();

  try {
    await LearningEvent.create({
      userId,
      clientEventId: randomUUID(),
      sessionId: sessionId || `server-${randomUUID()}`,
      eventType: completed ? "topic-completed" : "topic-uncompleted",
      curriculumId,
      courseId,
      unitId,
      conceptId,
      topicIndex: normalizedTopicIndex,
      metadata: {
        topicTitle: topics[normalizedTopicIndex],
        completionPercent: progress.completionPercent,
      },
      occurredAt: new Date(),
    });
  } catch (eventError) {
    // 진도 저장은 성공했으므로 행동 로그 실패 때문에 화면을 롤백시키지 않습니다.
    console.error("LearningEvent 저장 실패:", eventError);
  }

  const { learningData } = await getUserLearningData(userId);
  const courseView = learningData.courses.find(
    (course) => course.id === courseId
  );
  const unitView = courseView?.units.find((unit) => unit.id === unitId);
  const conceptView = unitView?.concepts.find(
    (concept) => concept.id === conceptId
  );

  return {
    concept: conceptView
      ? {
          id: conceptView.id,
          progress: conceptView.progress,
          status: conceptView.status,
          completedTopics: conceptView.completedTopics,
          topicCount: conceptView.topics.length,
          completedTopicIndexes: conceptView.completedTopicIndexes,
        }
      : null,
    unit: unitView
      ? {
          id: unitView.id,
          progress: unitView.progress,
          completedConcepts: unitView.completedConcepts,
          totalConcepts: unitView.concepts.length,
        }
      : null,
    course: courseView
      ? {
          id: courseView.id,
          progress: courseView.progress,
          completedConcepts: courseView.completedConcepts,
          totalConcepts: courseView.totalConcepts,
        }
      : null,
    overall: {
      progress: learningData.overallProgress,
      completedConcepts: learningData.completedConcepts,
      totalConcepts: learningData.totalConcepts,
    },
  };
}

module.exports = {
  getUserLearningData,
  updateTopicCompletion,
};
