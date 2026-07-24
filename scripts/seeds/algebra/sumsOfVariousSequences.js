module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "sequences",
  "conceptId": "algebra-03-05",
  "content": {
    "estimatedMinutes": 13,
    "summary": "부분분수 분해나 항의 소거(망원합)로 복잡한 수열의 합을 구합니다.",
    "keyTakeaway": "1/(k(k+1))=1/k−1/(k+1) 처럼 쪼개면 중간 항이 소거되어 합이 간단해집니다.",
    "steps": [
      {
        "order": 1,
        "title": "Σ 공식으로",
        "description": "가능하면 기본 합 공식으로 바로 계산합니다."
      },
      {
        "order": 2,
        "title": "부분분수 분해",
        "description": "분수 항을 두 항의 차로 분해합니다."
      },
      {
        "order": 3,
        "title": "망원합(소거)",
        "description": "이웃한 항이 소거되어 처음·끝만 남습니다."
      },
      {
        "order": 4,
        "title": "유형을 조합합니다",
        "description": "여러 성질을 함께 써서 합을 마무리합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-03-05",
    "practice": {
      "generatorKey": "algebra-sums-of-various-sequences",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "여러 가지 수열의 합",
      "formula": "1/(k(k+1)) = 1/k − 1/(k+1)",
      "blocks": [
        {
          "label": "부분분수",
          "tone": "secondary"
        },
        {
          "label": "망원합",
          "tone": "primary"
        },
        {
          "label": "합 계산",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
