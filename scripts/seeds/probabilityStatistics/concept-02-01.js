module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-01",
  "content": {
    "estimatedMinutes": 15,
    "summary": "시행을 반복할 때 상대도수가 다가가는 값으로 확률을 도입하고, 같은 가능성일 때의 수학적 확률과 연결합니다.",
    "keyTakeaway": "확률은 \\(0 \\le P(A) \\le 1\\)을 만족하며, 근원사건의 가능성이 같으면 \\(P(A) = n(A)/n(S)\\)로 계산합니다.",
    "steps": [
      {
        "order": 1,
        "title": "상대도수의 안정",
        "description": "시행 횟수를 늘리면 사건이 일어난 비율(상대도수)이 일정한 값에 가까워집니다."
      },
      {
        "order": 2,
        "title": "수학적 확률",
        "description": "근원사건들의 가능성이 모두 같으면, 사건의 경우의 수를 전체 경우의 수로 나누어 확률을 구합니다."
      },
      {
        "order": 3,
        "title": "기본 성질",
        "description": "어떤 사건이든 \\(0 \\le P \\le 1\\)이고, 전체 사건의 확률은 1, 공사건의 확률은 0입니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 12
    },
    "playgroundKey": "relative-frequency-simulation",
    "practice": {
      "generatorKey": "probability-basic",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "확률의 개념과 기본 성질",
      "formula": "P(A) = n(A)/n(S)",
      "blocks": [
        {
          "label": "반복 시행",
          "tone": "secondary"
        },
        {
          "label": "상대도수의 수렴",
          "tone": "primary"
        },
        {
          "label": "0 ≤ P ≤ 1",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
