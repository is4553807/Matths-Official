module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "exponential-logarithmic-functions",
  "conceptId": "algebra-01-03",
  "content": {
    "estimatedMinutes": 10,
    "summary": "같은 밑끼리는 곱하면 지수를 더하고, 나누면 빼고, 거듭제곱하면 곱합니다.",
    "keyTakeaway": "aᵐaⁿ=a^(m+n), aᵐ/aⁿ=a^(m−n), (aᵐ)ⁿ=a^(mn), (ab)ⁿ=aⁿbⁿ 입니다.",
    "steps": [
      {
        "order": 1,
        "title": "곱셈법칙",
        "description": "같은 밑의 곱은 지수를 더합니다: aᵐ·aⁿ=a^(m+n)."
      },
      {
        "order": 2,
        "title": "나눗셈법칙",
        "description": "같은 밑의 나눗셈은 지수를 뺍니다: aᵐ/aⁿ=a^(m−n)."
      },
      {
        "order": 3,
        "title": "거듭제곱법칙",
        "description": "거듭제곱의 거듭제곱은 지수를 곱합니다: (aᵐ)ⁿ=a^(mn)."
      },
      {
        "order": 4,
        "title": "곱·몫의 거듭제곱",
        "description": "(ab)ⁿ=aⁿbⁿ, (a/b)ⁿ=aⁿ/bⁿ 로 분배합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-01-03",
    "practice": {
      "generatorKey": "algebra-exponent-laws",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "지수법칙",
      "formula": "aᵐ · aⁿ = a^(m+n)",
      "blocks": [
        {
          "label": "곱=지수합",
          "tone": "secondary"
        },
        {
          "label": "나눗셈=지수차",
          "tone": "primary"
        },
        {
          "label": "거듭제곱=지수곱",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
