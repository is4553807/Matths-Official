module.exports = {
  curriculumId: "kr-2022",
  courseId: "calculus-1",
  unitId: "limits-and-continuity",
  conceptId: "calculus-1-01-03",

  content: {
    estimatedMinutes: 18,

    summary:
      "함수 \\(f(x)\\)가 \\(x=a\\)에서 연속이라는 것은 " +
      "그래프가 그 점에서 끊기지 않고 자연스럽게 이어진다는 뜻입니다.",

    keyTakeaway:
      "\\(f(a)\\)가 정의되고, \\(\\lim_{x\\to a}f(x)\\)가 존재하며, " +
      "두 값이 같을 때에만 함수는 \\(x=a\\)에서 연속입니다.",

    steps: [
      {
        order: 1,
        title: "함수값이 있는지 확인합니다",
        description:
          "그래프 위에 \\(x=a\\)인 실제 점이 존재하는지, " +
          "즉 \\(f(a)\\)가 정의되어 있는지 확인합니다.",
      },
      {
        order: 2,
        title: "양쪽 극한을 비교합니다",
        description:
          "왼쪽과 오른쪽에서 함수값이 같은 값으로 접근해야 " +
          "\\(\\lim_{x\\to a}f(x)\\)가 존재합니다.",
      },
      {
        order: 3,
        title: "극한값과 함수값을 겹칩니다",
        description:
          "주변에서 향하는 극한값과 실제 점의 함수값이 같아야 " +
          "그래프의 구멍이나 점프가 사라집니다.",
      },
      {
        order: 4,
        title: "구간 전체로 확장합니다",
        description:
          "구간 안의 모든 점에서 같은 조건이 성립하면 " +
          "그 함수를 해당 구간에서 연속이라고 합니다.",
      },
    ],

    motion: {
      assetUrl: null,
      posterUrl: null,
      durationSeconds: 11,
    },

    playgroundKey: "continuity-builder",

    practice: {
      generatorKey:
        "calculus-function-continuity",
      requiredDistinctTypes: 5,
    },

    dashboardPreview: {
      type: "graph",
      title: "함수의 연속",
      formula: "lim x→a f(x) = f(a)",
      blocks: [
        {
          label: "함수값 존재",
          tone: "secondary",
        },
        {
          label: "극한값 존재",
          tone: "primary",
        },
        {
          label: "두 값이 같음",
          tone: "accent",
        },
      ],
    },

    isPublished: true,
  },
};
