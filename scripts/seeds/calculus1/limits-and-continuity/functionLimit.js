module.exports = {
  curriculumId: "kr-2022",
  courseId: "calculus-1",
  unitId: "limits-and-continuity",
  conceptId: "calculus-1-01-01",

  content: {
    estimatedMinutes: 18,

    summary:
      "함수의 극한은 \\(x\\)가 어떤 값에 가까워질 때 " +
      "함수값 \\(f(x)\\)가 어디에 가까워지는지를 설명합니다.",

    keyTakeaway:
      "극한은 그 점에서의 함수값 \\(f(a)\\)가 아니라, " +
      "그 점 주변에서 함수값이 향하는 값을 관찰합니다.",

    steps: [
      {
        order: 1,
        title: "가까이 간다는 것",
        description:
          "\\(x\\)를 \\(a\\)에 바로 대입하지 않고, " +
          "\\(a\\)의 왼쪽과 오른쪽에서 점점 가까이 이동시킵니다.",
      },
      {
        order: 2,
        title: "양쪽의 움직임 비교",
        description:
          "왼쪽에서 접근한 함수값과 오른쪽에서 접근한 " +
          "함수값이 같은 값을 향하는지 확인합니다.",
      },
      {
        order: 3,
        title: "그 점의 값과 분리",
        description:
          "\\(f(a)\\)가 없거나 다른 값이어도 주변의 함수값이 " +
          "같은 곳을 향하면 극한은 존재할 수 있습니다.",
      },
    ],

    motion: {
      assetUrl: null,
      posterUrl: null,
      durationSeconds: 9,
    },

    playgroundKey: "limit-intuition",

    practice: {
      generatorKey: "calculus-limit-meaning",
      requiredDistinctTypes: 5,
    },

    dashboardPreview: {
      type: "graph",
      title: "함수의 극한",
      formula: "lim x→a f(x) = L",
      blocks: [
        {
          label: "왼쪽에서 접근",
          tone: "secondary",
        },
        {
          label: "오른쪽에서 접근",
          tone: "primary",
        },
        {
          label: "같은 값 L",
          tone: "accent",
        },
      ],
    },

    isPublished: true,
  },
};
