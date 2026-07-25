module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-06",
  "content": {
    "estimatedMinutes": 17,
    "summary": "표본평균 자체를 확률변수로 보고, 그 분포의 평균과 표준편차가 모집단과 어떻게 연결되는지 다룹니다.",
    "keyTakeaway": "표본평균의 분포는 \\(E(\\bar{X}) = \\mu\\), \\(\\sigma(\\bar{X}) = \\sigma/\\sqrt{n}\\)이며, 표본이 클수록 모평균에 집중됩니다.",
    "steps": [
      {
        "order": 1,
        "title": "표본평균도 확률변수",
        "description": "표본을 뽑을 때마다 표본평균이 달라지므로, 표본평균 자체가 분포를 가집니다."
      },
      {
        "order": 2,
        "title": "중심은 그대로",
        "description": "표본평균 분포의 평균은 모평균과 같습니다: \\(E(\\bar{X}) = \\mu\\)."
      },
      {
        "order": 3,
        "title": "퍼짐은 √n로 감소",
        "description": "표준편차는 \\(\\sigma/\\sqrt{n}\\)로 줄어들어, 표본이 클수록 추정이 정밀해집니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 14
    },
    "playgroundKey": "sample-mean-distribution",
    "practice": {
      "generatorKey": "sample-mean-sd",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "표본통계량과 모수의 관계",
      "formula": "σ(X̄) = σ/√n",
      "blocks": [
        {
          "label": "표본 반복 추출",
          "tone": "secondary"
        },
        {
          "label": "표본평균의 분포",
          "tone": "primary"
        },
        {
          "label": "σ/√n",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
