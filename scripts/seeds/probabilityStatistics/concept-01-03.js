module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "counting",
  "conceptId": "probability-statistics-01-03",
  "content": {
    "estimatedMinutes": 18,
    "summary": "거듭제곱 (a+b)ⁿ의 전개에서 각 항의 계수가 조합의 수로 결정되는 원리를 다룹니다.",
    "keyTakeaway": "일반항은 \\({}_{n}\\mathrm{C}_{r}\\,a^{n-r}b^{r}\\)이며, 계수는 \\(n\\)개의 괄호에서 \\(b\\)를 몇 번 뽑을지 고르는 경우의 수입니다.",
    "steps": [
      {
        "order": 1,
        "title": "괄호에서 하나씩 고르기",
        "description": "\\((a+b)^n\\)은 괄호 \\(n\\)개에서 각각 \\(a\\) 또는 \\(b\\)를 하나씩 골라 곱한 것들의 합입니다."
      },
      {
        "order": 2,
        "title": "같은 항끼리 모으기",
        "description": "\\(b\\)를 \\(r\\)번 고른 곱은 모두 \\(a^{n-r}b^{r}\\)이 되고, 고르는 방법이 \\({}_{n}\\mathrm{C}_{r}\\)가지입니다."
      },
      {
        "order": 3,
        "title": "파스칼의 삼각형",
        "description": "이항계수를 차례로 배열하면 위의 두 수의 합이 아래 수가 되는 파스칼의 삼각형이 만들어집니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 15
    },
    "playgroundKey": "pascal-triangle",
    "practice": {
      "generatorKey": "binomial-theorem-coefficient",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "이항정리",
      "formula": "(a+b)^n = Σ C(n,r)a^(n−r)b^r",
      "blocks": [
        {
          "label": "괄호 n개",
          "tone": "secondary"
        },
        {
          "label": "b를 r번 선택",
          "tone": "primary"
        },
        {
          "label": "계수 C(n,r)",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
