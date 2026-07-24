module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "exponential-logarithmic-functions",
  "conceptId": "algebra-01-02",
  "content": {
    "estimatedMinutes": 11,
    "summary": "지수를 정수에서 유리수·실수까지 넓혀도 계산 규칙이 그대로 성립합니다(밑>0).",
    "keyTakeaway": "a>0일 때 a^(m/n)=ⁿ√(aᵐ)로 정의하며, 0·음의·실수 지수까지 확장해도 지수법칙이 유지됩니다.",
    "steps": [
      {
        "order": 1,
        "title": "정수 지수를 복습합니다",
        "description": "a⁰=1, a⁻ⁿ=1/aⁿ 를 확인합니다."
      },
      {
        "order": 2,
        "title": "유리수 지수를 정의합니다",
        "description": "a^(m/n)=ⁿ√(aᵐ) 로 근호와 연결합니다."
      },
      {
        "order": 3,
        "title": "실수 지수로 넓힙니다",
        "description": "무리수 지수도 유리수로 근사해 자연스럽게 확장됩니다."
      },
      {
        "order": 4,
        "title": "법칙이 유지됨을 확인합니다",
        "description": "확장된 지수에서도 지수법칙이 그대로 성립합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-01-02",
    "practice": {
      "generatorKey": "algebra-rational-and-real-exponents",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "유리수·실수 지수로의 확장",
      "formula": "a^(m/n) = ⁿ√(aᵐ)",
      "blocks": [
        {
          "label": "유리수 지수",
          "tone": "secondary"
        },
        {
          "label": "근호 변환",
          "tone": "primary"
        },
        {
          "label": "실수 확장",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
