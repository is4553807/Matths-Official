module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "probability-statistics",
  "unitId": "probability",
  "conceptId": "probability-statistics-02-06",
  "content": {
    "estimatedMinutes": 16,
    "summary": "연달아 일어나는 사건의 확률을, 앞 사건이 일어난 뒤의 조건부확률을 곱해 구하는 방법입니다.",
    "keyTakeaway": "\\(P(A\\cap B) = P(A)\\,P(B\\mid A)\\)이며, 비복원 추출에서는 둘째 확률의 분모와 분자가 함께 줄어듭니다.",
    "steps": [
      {
        "order": 1,
        "title": "가지를 따라 곱하기",
        "description": "확률 나무에서 한 경로의 확률은 지나는 가지의 확률을 차례로 곱한 것입니다."
      },
      {
        "order": 2,
        "title": "바뀐 세상의 확률",
        "description": "앞 사건이 일어난 뒤의 상황에서 다음 확률(조건부확률)을 계산합니다."
      },
      {
        "order": 3,
        "title": "비복원 추출",
        "description": "꺼낸 것을 되돌리지 않으면 전체 개수가 줄어 둘째 가지의 분모가 1 작아집니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 14
    },
    "playgroundKey": "probability-tree",
    "practice": {
      "generatorKey": "multiplication-rule",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "확률의 곱셈정리",
      "formula": "P(A∩B) = P(A)·P(B|A)",
      "blocks": [
        {
          "label": "첫 가지 P(A)",
          "tone": "secondary"
        },
        {
          "label": "둘째 가지 P(B|A)",
          "tone": "primary"
        },
        {
          "label": "경로의 곱",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
