module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-04",
  "content": {
    "estimatedMinutes": 13,
    "summary": "여러 항의 합을 Σ 기호로 간단히 나타내고 성질을 이용해 계산합니다.",
    "keyTakeaway": "Σ는 선형성을 가지며, Σk=n(n+1)/2, Σk²=n(n+1)(2n+1)/6 등 기본 공식을 사용합니다.",
    "steps": [
      {
        "order": 1,
        "title": "Σ 표기",
        "description": "Σₖ₌₁ⁿ aₖ 로 여러 항의 합을 나타냅니다."
      },
      {
        "order": 2,
        "title": "선형성",
        "description": "Σ(c·aₖ)=cΣaₖ, Σ(aₖ+bₖ)=Σaₖ+Σbₖ."
      },
      {
        "order": 3,
        "title": "거듭제곱의 합",
        "description": "Σk, Σk², Σk³ 의 기본 공식을 씁니다."
      },
      {
        "order": 4,
        "title": "식을 나눠 계산",
        "description": "복잡한 식을 성질로 쪼개 합을 구합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-04",
    "practice": {
      "generatorKey": "algebra-sigma-definition-and-properties",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "시그마(Σ)의 뜻과 성질",
      "formula": "Σₖ₌₁ⁿ k = n(n+1)/2",
      "blocks": [
        {
          "label": "시그마 표기",
          "tone": "secondary"
        },
        {
          "label": "선형성",
          "tone": "primary"
        },
        {
          "label": "합 공식",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
