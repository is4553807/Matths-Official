module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-05",
  "content": {
    "estimatedMinutes": 13,
    "summary": "전수조사가 어려운 상황에서 모집단과 표본의 관계, 그리고 공정한 임의추출의 중요성을 다룹니다.",
    "keyTakeaway": "표본이 모집단을 대표하려면 모든 대상이 같은 확률로 뽑히는 임의추출이어야 하며, 편향된 추출은 결론을 망칩니다.",
    "steps": [
      {
        "order": 1,
        "title": "모집단과 표본",
        "description": "알고 싶은 대상 전체가 모집단이고, 실제로 조사하는 일부가 표본입니다."
      },
      {
        "order": 2,
        "title": "임의추출",
        "description": "제비뽑기나 난수를 이용해 모든 대상이 같은 확률로 뽑히도록 추출합니다."
      },
      {
        "order": 3,
        "title": "편향의 위험",
        "description": "가까운 사람만 조사하거나 자원자만 모으면 표본이 한쪽으로 치우쳐 대표성을 잃습니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "random-sampling",
    "practice": {
      "generatorKey": "sampling-method",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "모집단과 표본추출",
      "formula": "모집단 → 표본 (임의추출)",
      "blocks": [
        {
          "label": "모집단 전체",
          "tone": "secondary"
        },
        {
          "label": "공정한 추첨",
          "tone": "primary"
        },
        {
          "label": "대표하는 표본",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
