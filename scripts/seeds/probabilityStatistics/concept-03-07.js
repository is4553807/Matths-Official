module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-07",
  "content": {
    "estimatedMinutes": 18,
    "summary": "표본에서 얻은 정보로 모평균이 있을 법한 구간을 만들고, 신뢰도의 의미를 올바르게 해석합니다.",
    "keyTakeaway": "95% 신뢰구간은 \\(\\bar{x} \\pm 1.96\\,\\sigma/\\sqrt{n}\\)이며, 95%는 구간이 아니라 이 방법의 적중률을 뜻합니다.",
    "steps": [
      {
        "order": 1,
        "title": "점 대신 구간",
        "description": "표본평균 하나로 단정하는 대신, 모평균을 포함할 법한 구간으로 답합니다."
      },
      {
        "order": 2,
        "title": "반폭 계산",
        "description": "신뢰도 95%면 반폭은 \\(1.96 \\times \\sigma/\\sqrt{n}\\)로 계산합니다."
      },
      {
        "order": 3,
        "title": "신뢰도의 해석",
        "description": "같은 방법으로 구간을 100번 만들면 약 95번은 진짜 모평균을 포함한다는 뜻입니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 13
    },
    "playgroundKey": "confidence-interval",
    "practice": {
      "generatorKey": "confidence-interval",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "모평균과 모비율의 추정",
      "formula": "x̄ ± 1.96·σ/√n",
      "blocks": [
        {
          "label": "표본평균 x̄",
          "tone": "secondary"
        },
        {
          "label": "반폭 1.96σ/√n",
          "tone": "primary"
        },
        {
          "label": "신뢰구간",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
