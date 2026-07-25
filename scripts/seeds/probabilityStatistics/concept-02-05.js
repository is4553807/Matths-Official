module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-05",
  "content": {
    "estimatedMinutes": 15,
    "summary": "한 사건의 발생 정보가 다른 사건의 확률을 바꾸는지로 독립과 종속을 판정하는 방법을 다룹니다.",
    "keyTakeaway": "두 사건이 독립일 필요충분조건은 \\(P(A\\cap B) = P(A)P(B)\\)이며, 판정은 느낌이 아니라 이 곱셈 검산으로 합니다.",
    "steps": [
      {
        "order": 1,
        "title": "독립의 뜻",
        "description": "\\(A\\)의 발생 정보가 \\(B\\)의 확률을 바꾸지 못하면, 즉 \\(P(B\\mid A) = P(B)\\)이면 독립입니다."
      },
      {
        "order": 2,
        "title": "곱셈 검산",
        "description": "실제 판정은 \\(P(A\\cap B)\\)와 \\(P(A)P(B)\\)를 계산해 비교하는 것으로 합니다."
      },
      {
        "order": 3,
        "title": "배반과 구별",
        "description": "배반은 함께 일어나지 않는 것이고, 독립은 서로 영향을 주지 않는 것으로 전혀 다른 개념입니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 12
    },
    "playgroundKey": "independence-checker",
    "practice": {
      "generatorKey": "independence-check",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "사건의 독립과 종속",
      "formula": "P(A∩B) = P(A)P(B)",
      "blocks": [
        {
          "label": "P(A)·P(B) 계산",
          "tone": "secondary"
        },
        {
          "label": "P(A∩B)와 비교",
          "tone": "primary"
        },
        {
          "label": "일치하면 독립",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
