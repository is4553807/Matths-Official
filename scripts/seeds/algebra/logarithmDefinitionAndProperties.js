module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "exponential-logarithmic-functions",
  "conceptId": "algebra-01-04",
  "content": {
    "estimatedMinutes": 14,
    "summary": "log_a b는 ‘a를 몇 번 곱해야 b가 되는가’를 나타내는 지수입니다.",
    "keyTakeaway": "aˣ=b ⇔ x=log_a b (a>0,a≠1,b>0); log(MN)=logM+logN, log(M/N)=logM−logN, log Mᵏ=k·logM.",
    "steps": [
      {
        "order": 1,
        "title": "정의를 이해합니다",
        "description": "로그는 지수의 역으로, aˣ=b 를 x=log_a b 로 씁니다."
      },
      {
        "order": 2,
        "title": "밑과 진수 조건을 확인합니다",
        "description": "밑은 1이 아닌 양수, 진수는 항상 양수여야 합니다."
      },
      {
        "order": 3,
        "title": "성질을 적용합니다",
        "description": "곱→합, 나눗셈→차, 지수→계수로 바뀝니다."
      },
      {
        "order": 4,
        "title": "밑변환을 사용합니다",
        "description": "log_a b = (log_c b)/(log_c a) 로 밑을 바꿉니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-01-04",
    "practice": {
      "generatorKey": "algebra-logarithm-definition-and-properties",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "로그의 뜻과 성질",
      "formula": "a^x = b ⇔ x = log_a b",
      "blocks": [
        {
          "label": "로그의 정의",
          "tone": "secondary"
        },
        {
          "label": "로그의 성질",
          "tone": "primary"
        },
        {
          "label": "밑변환",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
