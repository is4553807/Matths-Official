module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-02",
  "content": {
    "estimatedMinutes": 12,
    "summary": "이웃한 두 항의 차(공차)가 항상 일정한 수열입니다.",
    "keyTakeaway": "aₙ=a₁+(n−1)d 이고, 합은 Sₙ=n(2a₁+(n−1)d)/2 = n(a₁+aₙ)/2 입니다.",
    "steps": [
      {
        "order": 1,
        "title": "공차의 뜻",
        "description": "이웃한 항의 차 d가 일정합니다."
      },
      {
        "order": 2,
        "title": "일반항",
        "description": "aₙ=a₁+(n−1)d 로 임의의 항을 구합니다."
      },
      {
        "order": 3,
        "title": "등차중항",
        "description": "이웃한 세 항에서 가운데 항은 양옆의 평균입니다."
      },
      {
        "order": 4,
        "title": "합 공식",
        "description": "Sₙ=n(a₁+aₙ)/2 로 합을 구합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-02",
    "practice": {
      "generatorKey": "algebra-arithmetic-sequences",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "등차수열",
      "formula": "aₙ = a₁ + (n−1)d",
      "blocks": [
        {
          "label": "공차",
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
