module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "counting",
  "conceptId": "probability-statistics-01-02",
  "content": {
    "estimatedMinutes": 16,
    "summary": "종류별로 몇 개씩 고를지만 정하는 선택을, 동그라미와 칸막이의 나열 문제로 바꾸어 세는 방법입니다.",
    "keyTakeaway": "중복조합 \\({}_{n}\\mathrm{H}_{r}\\)는 ○ \\(r\\)개와 칸막이 \\(n-1\\)개를 나열하는 \\({}_{n+r-1}\\mathrm{C}_{r}\\)와 같습니다.",
    "steps": [
      {
        "order": 1,
        "title": "개수 배분으로 번역",
        "description": "순서 없이 중복만 허용되는 선택은 결국 종류별 개수를 배분하는 문제입니다."
      },
      {
        "order": 2,
        "title": "동그라미와 칸막이",
        "description": "고르는 개수를 ○ \\(r\\)개로, 종류의 경계를 칸막이 \\(n-1\\)개로 나타내면 자리 \\(n+r-1\\)개의 나열이 됩니다."
      },
      {
        "order": 3,
        "title": "조합으로 마무리",
        "description": "전체 자리 중 ○가 들어갈 자리를 고르면 되므로 \\({}_{n+r-1}\\mathrm{C}_{r}\\)로 계산합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 13
    },
    "playgroundKey": "stars-and-bars",
    "practice": {
      "generatorKey": "repeated-combination",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "중복조합",
      "formula": "nHr = C(n+r−1, r)",
      "blocks": [
        {
          "label": "○ r개",
          "tone": "secondary"
        },
        {
          "label": "칸막이 n−1개",
          "tone": "primary"
        },
        {
          "label": "자리 고르기",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
