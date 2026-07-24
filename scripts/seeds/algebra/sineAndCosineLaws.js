module.exports = {
  "curriculumId": "kr-2022",
  "courseId": "algebra",
  "unitId": "trigonometric-functions",
  "conceptId": "algebra-02-03",
  "content": {
    "estimatedMinutes": 14,
    "summary": "삼각형의 변·각·외접원 사이의 관계로 변과 각을 구합니다.",
    "keyTakeaway": "사인법칙 a/sinA=2R, 코사인법칙 a²=b²+c²−2bc·cosA 를 사용합니다.",
    "steps": [
      {
        "order": 1,
        "title": "사인법칙",
        "description": "a/sinA=b/sinB=c/sinC=2R 로 변·각을 연결합니다."
      },
      {
        "order": 2,
        "title": "외접원 반지름",
        "description": "2R=a/sinA 로 외접원 반지름을 구합니다."
      },
      {
        "order": 3,
        "title": "코사인법칙",
        "description": "a²=b²+c²−2bc·cosA 로 한 변·한 각을 구합니다."
      },
      {
        "order": 4,
        "title": "삼각형의 넓이",
        "description": "S=½ab·sinC 로 넓이를 구합니다."
      }
    ],
    "motion": {
      "assetUrl": null,
      "posterUrl": null,
      "durationSeconds": 11
    },
    "playgroundKey": "algebra-02-03",
    "practice": {
      "generatorKey": "algebra-sine-and-cosine-laws",
      "requiredDistinctTypes": 5
    },
    "dashboardPreview": {
      "type": "graph",
      "title": "사인법칙과 코사인법칙",
      "formula": "\\(\\frac{a}{\\sin A}=2R,\\quad a^2=b^2+c^2-2bc\\cos A\\)",
      "blocks": [
        {
          "label": "사인법칙",
          "tone": "secondary"
        },
        {
          "label": "코사인법칙",
          "tone": "primary"
        },
        {
          "label": "삼각형 넓이",
          "tone": "accent"
        }
      ]
    },
    "isPublished": true
  }
};
