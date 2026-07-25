function createLesson({
  unitId,
  conceptId,
  title,
  summary,
  keyTakeaway,
  steps,
  formula,
  blocks,
  estimatedMinutes = 20,
}) {
  return {
    curriculumId: "kr-2022",
    courseId: "calculus-1",
    unitId,
    conceptId,
    content: {
      estimatedMinutes,
      summary,
      keyTakeaway,
      steps: steps.map(
        ([stepTitle, description], index) => ({
          order: index + 1,
          title: stepTitle,
          description,
        })
      ),
      motion: {
        assetUrl: null,
        posterUrl: null,
        durationSeconds: 12,
      },
      playgroundKey: conceptId,
      practice: {
        generatorKey: conceptId,
        requiredDistinctTypes: 5,
      },
      dashboardPreview: {
        type: "graph",
        title,
        formula,
        blocks: (
          blocks || [
            "조건 읽기",
            "관계 계산",
            "결과 해석",
          ]
        ).map((label, index) => ({
          label,
          tone: [
            "secondary",
            "primary",
            "accent",
          ][index] || "secondary",
        })),
      },
      isPublished: true,
    },
  };
}

module.exports = createLesson;
