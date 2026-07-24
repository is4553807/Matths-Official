module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-07",
  "content": {
    "estimatedMinutes": 12,
    "summary": "모든 자연수에 대한 명제를 도미노처럼 두 단계로 증명하는 방법입니다.",
    "keyTakeaway": "(1) n=1에서 성립, (2) n=k 성립을 가정하면 n=k+1에서도 성립 ⇒ 모든 자연수 n에서 성립.",
    "steps": [
      {
        "order": 1,
        "title": "기초 단계",
        "description": "n=1일 때 명제가 성립함을 확인합니다."
      },
      {
        "order": 2,
        "title": "귀납 가정",
        "description": "n=k일 때 성립한다고 가정합니다."
      },
      {
        "order": 3,
        "title": "다음 단계",
        "description": "가정을 이용해 n=k+1에서도 성립함을 보입니다."
      },
      {
        "order": 4,
        "title": "결론",
        "description": "두 단계가 성립하면 모든 자연수에서 참입니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-07",
    "practice": {
      "generatorKey": "algebra-mathematical-induction",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "수학적 귀납법",
      "formula": "P(1) ∧ (P(k)⇒P(k+1)) ⇒ ∀n P(n)",
      "blocks": [
        {
          "label": "기초 단계",
          "tone": "secondary"
        },
        {
          "label": "귀납 가정",
          "tone": "primary"
        },
        {
          "label": "다음 단계",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
