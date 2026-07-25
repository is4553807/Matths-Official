module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-01",
  "content": {
    "estimatedMinutes": 15,
    "summary": "시행의 결과를 숫자로 대응시킨 확률변수와, 각 값이 가지는 확률을 정리한 확률분포를 도입합니다.",
    "keyTakeaway": "확률분포는 각 확률이 0 이상이고 총합이 정확히 1이라는 조건 \\(\\sum P(X=x) = 1\\)을 반드시 만족합니다.",
    "steps": [
      {
        "order": 1,
        "title": "결과에 숫자 붙이기",
        "description": "동전의 앞면 개수처럼, 시행 결과를 숫자로 바꾼 것이 확률변수 \\(X\\)입니다."
      },
      {
        "order": 2,
        "title": "분포표 만들기",
        "description": "\\(X\\)가 가질 수 있는 값마다 그 확률을 대응시켜 표로 정리한 것이 확률분포입니다."
      },
      {
        "order": 3,
        "title": "합은 반드시 1",
        "description": "분포표의 확률을 모두 더하면 1이 되어야 하며, 이 조건으로 미지의 확률을 구할 수 있습니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 12
    },
    "playgroundKey": "pmf-table",
    "practice": {
      "generatorKey": "probability-distribution-table",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "확률변수와 확률분포",
      "formula": "ΣP(X=x) = 1",
      "blocks": [
        {
          "label": "결과 → 숫자",
          "tone": "secondary"
        },
        {
          "label": "값마다 확률",
          "tone": "primary"
        },
        {
          "label": "총합 = 1",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
