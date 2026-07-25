module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "counting",
  "conceptId": "probability-statistics-01-01",
  "content": {
    "estimatedMinutes": 18,
    "summary": "중복순열은 같은 대상을 다시 고를 수 있는 나열이고, 같은 것이 있는 순열은 겹치는 배열을 나누어 세는 방법입니다.",
    "keyTakeaway": "선택지가 줄지 않으면 \\(n^r\\)이고, 같은 것이 섞여 있으면 전체 \\(n!\\)을 같은 것끼리의 배열 수로 나누어 겹침을 접습니다.",
    "steps": [
      {
        "order": 1,
        "title": "선택지가 줄지 않는 나열",
        "description": "중복을 허용하면 어느 자리를 채워도 선택지가 \\(n\\)가지 그대로이므로 경우의 수는 \\(n^r\\)가지가 됩니다."
      },
      {
        "order": 2,
        "title": "전부 다르다고 가정",
        "description": "같은 것이 섞인 나열은 먼저 모두 다른 대상으로 보고 \\(n!\\)가지로 셉니다."
      },
      {
        "order": 3,
        "title": "겹친 배열 접기",
        "description": "같은 것끼리 자리를 바꾼 배열은 한 가지이므로, 그 배열 수 \\(p!\\)로 나누어 중복을 없앱니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 14
    },
    "playgroundKey": "repeated-and-multiset-permutation",
    "practice": {
      "generatorKey": "multiset-permutation",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "중복순열과 같은 것이 있는 순열",
      "formula": "nΠr = n^r · n!/p!",
      "blocks": [
        {
          "label": "자리마다 n가지",
          "tone": "secondary"
        },
        {
          "label": "같은 것끼리 접기",
          "tone": "primary"
        },
        {
          "label": "서로 다른 배열 수",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
