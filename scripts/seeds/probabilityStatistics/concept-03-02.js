module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "statistics",
  "conceptId": "probability-statistics-03-02",
  "content": {
    "estimatedMinutes": 17,
    "summary": "확률을 가중치로 한 평균인 기댓값과, 그 주위의 퍼짐을 나타내는 분산·표준편차를 계산합니다.",
    "keyTakeaway": "\\(E(X) = \\sum x\\,P(X=x)\\)는 분포의 무게중심이고, \\(V(X) = E(X^2) - \\{E(X)\\}^2\\)로 퍼짐을 잽니다.",
    "steps": [
      {
        "order": 1,
        "title": "무게중심으로서의 기댓값",
        "description": "각 값에 확률만큼의 무게를 얹으면, 기댓값은 널빤지가 수평이 되는 받침점의 위치입니다."
      },
      {
        "order": 2,
        "title": "값 곱하기 확률의 합",
        "description": "\\(E(X)\\)는 값과 확률을 곱해 모두 더한 가중 평균으로 계산합니다."
      },
      {
        "order": 3,
        "title": "퍼짐의 크기",
        "description": "분산은 \\(E(X^2)\\)에서 \\(\\{E(X)\\}^2\\)을 뺀 값이고, 표준편차는 그 양의 제곱근입니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 14
    },
    "playgroundKey": "expected-value-balance",
    "practice": {
      "generatorKey": "expected-value",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "이산확률변수의 기댓값과 표준편차",
      "formula": "E(X) = Σ x·P(X=x)",
      "blocks": [
        {
          "label": "확률 = 무게",
          "tone": "secondary"
        },
        {
          "label": "무게중심 찾기",
          "tone": "primary"
        },
        {
          "label": "E(X)·V(X)",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
