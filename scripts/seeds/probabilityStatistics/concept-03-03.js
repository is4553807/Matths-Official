module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-03",
  "content": {
    "estimatedMinutes": 16,
    "summary": "성공 확률이 일정한 독립시행을 n번 반복할 때 성공 횟수가 따르는 분포와 그 평균·표준편차를 다룹니다.",
    "keyTakeaway": "\\(X \\sim B(n, p)\\)이면 \\(E(X) = np\\), \\(V(X) = npq\\)이며 분포의 봉우리는 평균 근처에 섭니다.",
    "steps": [
      {
        "order": 1,
        "title": "독립시행의 반복",
        "description": "매번 성공 확률이 같고 서로 영향을 주지 않는 시행을 n번 반복하는 상황입니다."
      },
      {
        "order": 2,
        "title": "성공 횟수의 분포",
        "description": "성공 횟수가 \\(k\\)일 확률은 \\({}_{n}\\mathrm{C}_{k}\\,p^{k}q^{n-k}\\)로 주어집니다."
      },
      {
        "order": 3,
        "title": "평균과 분산",
        "description": "공식 \\(E(X)=np\\), \\(V(X)=npq\\)를 이용하면 분포 전체를 요약할 수 있습니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 13
    },
    "playgroundKey": "binomial-distribution",
    "practice": {
      "generatorKey": "binomial-mean-sd",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "이항분포",
      "formula": "E(X)=np, V(X)=npq",
      "blocks": [
        {
          "label": "n번 반복",
          "tone": "secondary"
        },
        {
          "label": "성공 횟수 X",
          "tone": "primary"
        },
        {
          "label": "np와 npq",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
