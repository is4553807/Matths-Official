module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-04",
  "content": {
    "estimatedMinutes": 18,
    "summary": "조건이 주어지면 표본공간이 그 조건으로 축소되고, 분모가 바뀐 비율로 확률을 다시 재는 개념입니다.",
    "keyTakeaway": "\\(P(B\\mid A) = P(A\\cap B)/P(A)\\)이며, 시간의 순서가 아니라 표본공간(분모)의 교체로 이해해야 합니다.",
    "steps": [
      {
        "order": 1,
        "title": "표본공간의 축소",
        "description": "사건 \\(A\\)가 일어났다는 정보가 주어지면 생각의 범위가 \\(A\\)로 줄어듭니다."
      },
      {
        "order": 2,
        "title": "새 분모로 다시 재기",
        "description": "축소된 표본공간 \\(A\\) 안에서 \\(B\\)가 차지하는 비율이 조건부확률입니다."
      },
      {
        "order": 3,
        "title": "분할표로 확인",
        "description": "표에서 조건에 해당하는 행만 남기고 그 행의 합을 분모로 쓰면 실수가 없습니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 14
    },
    "playgroundKey": "two-way-table",
    "practice": {
      "generatorKey": "conditional-probability-table",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "조건부확률",
      "formula": "P(B|A) = P(A∩B)/P(A)",
      "blocks": [
        {
          "label": "조건 행만 남기기",
          "tone": "secondary"
        },
        {
          "label": "분모 교체",
          "tone": "primary"
        },
        {
          "label": "P(B|A)",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
