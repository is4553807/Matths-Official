# Matths 문제 연구 데이터

이 폴더에는 GOAT Arena와 모의고사 문제 생성·검증에 사용하는 정적 연구 자료가 있다.

- `arena2028MathAlignment.json`: 교육과정 정렬 기준
- `arenaOfficialMockTypeCatalog2016_2026.json`: 공식 모의고사 유형 카탈로그
- `arenaPrivateMockResearchCatalog.json`: 사설 모의고사 연구 카탈로그
- `arenaGeneratedAnswerKey.schema.json`: 생성 문제 정답 데이터 형식
- `arenaPdfSkeletonImplementation/`: PDF 문제 골격, 전사 검증, 생성기 계약과 시각 검증 자료

운영 지표는 별도 월별 집계 컬렉션을 만들지 않고 현재 원본 데이터에서 조회한다. 웹과 iPad 운영자 화면은 `services/adminCurrentMetricsService.js`를 공통으로 사용한다.
