module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-04",
  "content": {
    "estimatedMinutes": 17,
    "summary": "종 모양의 정규분포를 도입하고, 시행 횟수가 큰 이항분포가 정규분포로 근사되는 관계를 다룹니다.",
    "keyTakeaway": "\\(n\\)이 충분히 크면 \\(B(n,p)\\)는 \\(N(np,\\,npq)\\)로 근사되며, 표준화로 모든 정규분포를 하나의 표로 다룹니다.",
    "steps": [
      {
        "order": 1,
        "title": "종 모양의 분포",
        "description": "정규분포는 평균을 중심으로 좌우 대칭인 연속확률분포입니다."
      },
      {
        "order": 2,
        "title": "막대가 곡선에 안기다",
        "description": "시행 횟수를 키우면 이항분포의 막대 윤곽이 정규곡선에 점점 가까워집니다."
      },
      {
        "order": 3,
        "title": "표준화",
        "description": "\\(Z = (X-\\mu)/\\sigma\\)로 바꾸면 어떤 정규분포든 표준정규분포표 하나로 확률을 구할 수 있습니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 15
    },
    "playgroundKey": "normal-approximation",
    "practice": {
      "generatorKey": "normal-standardization",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "정규분포와 이항분포의 관계",
      "formula": "B(n,p) ≈ N(np, npq)",
      "blocks": [
        {
          "label": "이항분포 막대",
          "tone": "secondary"
        },
        {
          "label": "정규곡선 근사",
          "tone": "primary"
        },
        {
          "label": "표준화 Z",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
