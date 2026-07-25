module.exports = {
  curriculumId: "kr-2022",
  courseId: "calculus-1",
  unitId: "limits-and-continuity",
  conceptId: "calculus-1-01-04",

  content: {
    estimatedMinutes: 20,

    summary:
      "연속함수는 사칙연산을 해도 연속성이 유지되며, " +
      "닫힌구간에서는 최댓값·최솟값과 중간값에 관한 중요한 성질을 가집니다.",

    keyTakeaway:
      "\\(f\\)가 \\([a,b]\\)에서 연속이고 \\(k\\)가 " +
      "\\(f(a)\\)와 \\(f(b)\\) 사이의 값이면, " +
      "\\(f(c)=k\\)를 만족하는 \\(c\\in(a,b)\\)가 적어도 하나 존재합니다.",

    steps: [
      {
        order: 1,
        title: "연속인 함수들을 결합합니다",
        description:
          "연속함수의 합·차·곱은 연속이고, 분모가 0이 아닌 곳에서는 " +
          "몫도 연속이라는 성질을 확인합니다.",
      },
      {
        order: 2,
        title: "닫힌구간의 양 끝을 고정합니다",
        description:
          "\\([a,b]\\)에서 그래프가 끊기지 않는다면 " +
          "함수는 그 구간에서 최댓값과 최솟값을 가집니다.",
      },
      {
        order: 3,
        title: "두 함수값 사이에 수평선을 긋습니다",
        description:
          "\\(f(a)\\)와 \\(f(b)\\) 사이의 높이 \\(k\\)를 선택하고 " +
          "그래프와 수평선 \\(y=k\\)의 교점을 관찰합니다.",
      },
      {
        order: 4,
        title: "교점의 존재를 결론 냅니다",
        description:
          "연속인 그래프는 중간 높이를 건너뛸 수 없으므로 " +
          "\\(f(c)=k\\)인 점이 적어도 하나 존재합니다.",
      },
    ],

    motion: {
      assetUrl: null,
      posterUrl: null,
      durationSeconds: 12,
    },

    playgroundKey: "continuous-properties",

    practice: {
      generatorKey:
        "calculus-continuous-function-properties",
      requiredDistinctTypes: 5,
    },

    dashboardPreview: {
      type: "graph",
      title: "연속함수의 성질",
      formula: "f(a) < k < f(b) ⇒ f(c) = k",
      blocks: [
        {
          label: "닫힌구간에서 연속",
          tone: "secondary",
        },
        {
          label: "중간 높이 k",
          tone: "primary",
        },
        {
          label: "교점 c 존재",
          tone: "accent",
        },
      ],
    },

    isPublished: true,
  },
};
