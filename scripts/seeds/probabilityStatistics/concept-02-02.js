module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-02",
  "content": {
    "estimatedMinutes": 15,
    "summary": "합사건의 확률을 구할 때 두 번 세어진 교집합을 한 번 빼는 덧셈정리를 벤다이어그램으로 이해합니다.",
    "keyTakeaway": "\\(P(A\\cup B) = P(A) + P(B) - P(A\\cap B)\\)이며, 배반사건이면 교집합이 0이라 그대로 더합니다.",
    "steps": [
      {
        "order": 1,
        "title": "그냥 더하면 생기는 문제",
        "description": "두 확률을 더하면 겹치는 부분이 두 번 포함되어 실제보다 커집니다."
      },
      {
        "order": 2,
        "title": "겹침을 한 번 빼기",
        "description": "두 번 세어진 \\(P(A\\cap B)\\)를 한 번 빼면 합사건의 확률이 됩니다."
      },
      {
        "order": 3,
        "title": "배반사건의 경우",
        "description": "함께 일어날 수 없는 두 사건은 교집합이 공사건이므로 확률을 그대로 더합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 12
    },
    "playgroundKey": "venn-addition-rule",
    "practice": {
      "generatorKey": "addition-rule",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "확률의 덧셈정리",
      "formula": "P(A∪B) = P(A)+P(B)−P(A∩B)",
      "blocks": [
        {
          "label": "P(A)+P(B)",
          "tone": "secondary"
        },
        {
          "label": "겹침 빼기",
          "tone": "primary"
        },
        {
          "label": "P(A∪B)",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
