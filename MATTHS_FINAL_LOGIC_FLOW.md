# MATTHS FINAL LOGIC FLOW

> 문서 세트 버전: v2.9 / Final Ranking v1.4  
> 기준일: 2026-08-03

기존 단일 문서는 Sub Division 새 규칙을 반영하면서 역할별 Markdown 파일로 분리했다.

이 파일이 `docs/logic` 문서 세트의 전체 인덱스와 정책 우선순위를 정의한다.

## 핵심 문서

1. [Matths 현행 시스템](./docs/logic/01_MATTHS_CURRENT_SYSTEM.md)
2. [GOAT Arena 공통 1대1 경기 규칙](./docs/logic/02_GOAT_ARENA_COMMON_MATCH_RULES.md)
3. [Sub Division Ranking · Learning Pass · Payback v2.9](./docs/logic/03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md)
4. [Main Division Ranking System](./docs/logic/04_MAIN_DIVISION_RANKING_SYSTEM.md)
5. [GOAT Arena 공통 기술 설계](./docs/logic/05_SHARED_TECHNICAL_DESIGN.md)
6. [구현 계획](./docs/logic/06_IMPLEMENTATION_PLAN.md)
7. [문서 권위와 소스 이동표](./docs/logic/07_SOURCE_MAPPING.md)
8. [Final Ranking System v1.4](./docs/logic/08_FINAL_RANKING_SYSTEM.md)
9. [GOAT Arena 손익 시뮬레이션](./docs/logic/09_GOAT_ARENA_PROFIT_LOSS_SIMULATION.md)
10. [룰 평가와 사용자 콘텐츠 전략](./docs/logic/10_RULE_EVALUATION_AND_CONTENT_STRATEGY.md)
11. [DB·캐시 저장 경계](./docs/logic/11_DATA_STORAGE_AND_CACHE_BOUNDARIES.md)
12. [Main Division 상점 정책](./docs/logic/12_SHOP.md)
13. [파일 저장·보존·백업 정책](./docs/logic/13_STORAGE.md)

## 최종 정책 경계

- 현행 Matths 기능은 `01`, 공통 1대1 불변식은 `02`, Sub Division의 학습권·Revenge·Main Division 진입·구간형 페이백은 `03`을 기준으로 한다.
- 같은 주제가 충돌하면 더 구체적인 최신 정책 문서(`03`, `04`, `08`, `12`, `13`)가 공통·현행 설명보다 우선한다.
- Main 진입은 Sub의 평가 결과이므로 Sub 문서에 포함한다.
- Main Division 진입 후의 내부 랭킹·경기·학습일수 정산은 `04`, Main 전용 상점은 `12`를 따른다.
- Final Ranking 공식과 활성 자격은 `08`이 최종 기준이다.
- 저장 위치와 캐시 가능 여부는 `11`을 따른다.
- 운영자·사용자 업로드 파일의 실제 저장 위치, 공개 범위, 보존과 백업은 `13`을 따른다.
- 상점 아이템은 정상 경기의 승패와 Arena 상태 교환을 변경할 수 없다. `방어 일정 보호권`은 문제 팩 열람 전 경기를 승패 없이 취소하는 `12`의 명시적 예외다.
- 명시되지 않은 수치·예외·보상은 구현하지 않고 해당 정책 문서의 새 버전으로 먼저 확정한다.
