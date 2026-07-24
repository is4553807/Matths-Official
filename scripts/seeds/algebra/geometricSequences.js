module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-03",
  "content": {
    "estimatedMinutes": 12,
    "summary": "이웃한 두 항의 비(공비)가 항상 일정한 수열입니다.",
    "keyTakeaway": "aₙ=a₁r^(n−1) 이고, 합은 Sₙ=a₁(rⁿ−1)/(r−1) (r≠1) 입니다.",
    "steps": [
      {
        "order": 1,
        "title": "공비의 뜻",
        "description": "이웃한 항의 비 r이 일정합니다."
      },
      {
        "order": 2,
        "title": "일반항",
        "description": "aₙ=a₁r^(n−1) 로 임의의 항을 구합니다."
      },
      {
        "order": 3,
        "title": "등비중항",
        "description": "이웃한 세 항에서 가운데 항의 제곱은 양옆의 곱입니다."
      },
      {
        "order": 4,
        "title": "합 공식",
        "description": "Sₙ=a₁(rⁿ−1)/(r−1) 로 합을 구합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-03",
    "practice": {
      "generatorKey": "algebra-geometric-sequences",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "등비수열",
      "formula": "aₙ = a₁ · r^(n−1)",
      "blocks": [
        {
          "label": "공비",
          "tone": "secondary"
        },
        {
          "label": "일반항",
          "tone": "primary"
        },
        {
          "label": "합",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
