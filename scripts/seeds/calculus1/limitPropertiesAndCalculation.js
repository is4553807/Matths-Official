module.exports = {
  curriculumId: "kr-2022",
  courseId: "calculus-1",
  unitId: "limits-and-continuity",
  conceptId: "calculus-1-01-02",

  content: {
    estimatedMinutes: 20,

    summary:
      "함수의 극한에 대한 덧셈·뺄셈·곱셈·나눗셈의 성질을 " +
      "이용하면 복잡한 식의 극한도 익숙한 계산으로 바꿀 수 있습니다.",

    keyTakeaway:
      "먼저 대입하여 식의 형태를 확인합니다. " +
      "\\(0/0\\) 꼴이면 답이 0이라는 뜻이 아니라, " +
      "인수분해나 유리화로 숨은 공통 구조를 찾아야 한다는 신호입니다.",

    steps: [
      {
        order: 1,
        title: "먼저 직접 대입합니다",
        description:
          "극한점 \\(x=a\\)를 대입해 바로 계산되는지, " +
          "아니면 \\(0/0\\)과 같은 부정형이 나타나는지 확인합니다.",
      },
      {
        order: 2,
        title: "극한의 성질로 식을 나눕니다",
        description:
          "합·차·곱의 극한은 각각의 극한으로 나누어 계산하고, " +
          "몫은 분모의 극한이 0이 아닐 때 적용합니다.",
      },
      {
        order: 3,
        title: "부정형의 원인을 없앱니다",
        description:
          "인수분해, 약분, 유리화를 이용해 극한점 근처에서 " +
          "같은 값을 갖는 더 단순한 식으로 바꿉니다.",
      },
      {
        order: 4,
        title: "변형한 식에 다시 대입합니다",
        description:
          "문제를 막고 있던 공통 인자가 사라졌다면 변형된 식에 " +
          "\\(x=a\\)를 대입하여 극한값을 결정합니다.",
      },
    ],

    motion: {
      assetUrl: null,
      posterUrl: null,
      durationSeconds: 12,
    },

    playgroundKey: "limit-calculation",

    practice: {
      generatorKey:
        "calculus-limit-properties-calculation",
      requiredDistinctTypes: 5,
    },

    dashboardPreview: {
      type: "formula",
      title: "극한의 성질과 계산",
      formula: "0/0 → 식 변형 → 대입",
      blocks: [
        {
          label: "직접 대입",
          tone: "secondary",
        },
        {
          label: "인수분해·유리화",
          tone: "primary",
        },
        {
          label: "극한값 계산",
          tone: "accent",
        },
      ],
    },

    isPublished: true,
  },
};
