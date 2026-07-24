module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-06",
  "content": {
    "estimatedMinutes": 11,
    "summary": "첫째항과 ‘앞 항으로 다음 항을 정하는 규칙(점화식)’으로 수열을 정의합니다.",
    "keyTakeaway": "a₁과 aₙ₊₁=f(aₙ) 같은 점화식이 주어지면 첫째항부터 차례대로 항을 구합니다.",
    "steps": [
      {
        "order": 1,
        "title": "점화식의 뜻",
        "description": "앞 항으로 다음 항을 정하는 규칙입니다."
      },
      {
        "order": 2,
        "title": "차례로 계산",
        "description": "첫째항부터 순서대로 대입해 항을 구합니다."
      },
      {
        "order": 3,
        "title": "등차·등비형",
        "description": "aₙ₊₁=aₙ+d, aₙ₊₁=r·aₙ 꼴을 알아봅니다."
      },
      {
        "order": 4,
        "title": "값을 구합니다",
        "description": "원하는 항까지 반복해 값을 계산합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-06",
    "practice": {
      "generatorKey": "algebra-recursive-sequences",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "수열의 귀납적 정의",
      "formula": "a₁ 주어짐, aₙ₊₁ = f(aₙ)",
      "blocks": [
        {
          "label": "점화식",
          "tone": "secondary"
        },
        {
          "label": "순차 계산",
          "tone": "primary"
        },
        {
          "label": "등차·등비형",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
