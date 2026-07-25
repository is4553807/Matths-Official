module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-03",
  "content": {
    "estimatedMinutes": 14,
    "summary": "사건이 일어나지 않을 확률을 이용해, '적어도 하나' 유형을 빠르게 계산하는 방법을 다룹니다.",
    "keyTakeaway": "\\(P(A^{c}) = 1 - P(A)\\)이며, '적어도 하나'는 반대편인 '하나도 없음'을 계산해 1에서 빼는 것이 빠릅니다.",
    "steps": [
      {
        "order": 1,
        "title": "여사건의 뜻",
        "description": "사건 \\(A\\)가 일어나지 않는 사건이 여사건 \\(A^{c}\\)이고, 두 확률의 합은 항상 1입니다."
      },
      {
        "order": 2,
        "title": "'적어도'의 반대편",
        "description": "'적어도 하나'의 여사건은 '하나도 일어나지 않음' 단 한 가지 경우입니다."
      },
      {
        "order": 3,
        "title": "1에서 빼기",
        "description": "여사건의 확률을 구한 뒤 1에서 빼면 복잡한 경우를 나누어 세지 않아도 됩니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "complement-at-least",
    "practice": {
      "generatorKey": "complement-at-least",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "여사건의 확률",
      "formula": "P(Aᶜ) = 1 − P(A)",
      "blocks": [
        {
          "label": "전체 = 1",
          "tone": "secondary"
        },
        {
          "label": "모두 아님 계산",
          "tone": "primary"
        },
        {
          "label": "적어도 하나",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
