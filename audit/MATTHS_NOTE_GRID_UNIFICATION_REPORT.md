# Matths 앱 기준 격자 통일

2026-10-12. 제공받은 `matths-note-grid.svg`, `matths-note-grid@2x.png`, `export-grid.cjs`의 규격을 웹과 풀이 이미지에 반영했다. 운영 배포·업로드·DB 변경은 하지 않았다.

| 항목 | 공통 규격 |
|---|---|
| 간격 | 24 논리 포인트 / 웹 CSS px |
| 선 두께 | 0.7 논리 포인트 |
| 종이 | `rgb(100%,99.6%,98.8%)` |
| 격자 선 | `rgb(85.5%,87.8%,92.5%)` |
| PNG 배율 | 2배: 간격 48px, 선 두께 1.4px |
| 대격자 | 없음, 모든 선이 같은 색·두께 |

공통 정의와 Canvas/SVG 렌더러는 `public/js/matths-note-grid.js`에 있다. CSS 대기 배경, 회원 경기, 게스트 도전장, 저장 PNG, 63문항 촬영 양식, 손글씨 후처리가 이 정의를 사용한다. 생성 모델에는 흰 배경의 손글씨만 요청하고 격자는 코드로 합성한다.

웹은 기존 1200×900 필기 좌표를 보존하면서 화면의 실제 콘텐츠 폭에 맞춰 격자를 그린다. 저장 PNG는 표시 영역의 논리 크기를 2배로 렌더링하여 화면과 저장본에서 필기와 격자의 상대 위치를 유지한다. ResizeObserver로 화면 회전·폭 변경에 대응한다. 회원/게스트의 기기 판정과 1440px 표시 조건도 일치시켰다. 흰 종이 위 풀이판 제목·상태 문구의 대비를 보정했다.

이미 서버에 수신된 완료 풀이 PNG는 재접속 때 기존 해시와 파일을 재사용한다. 격자 또는 화면 크기가 달라졌다는 이유로 확정된 풀이를 다시 캡처하지 않는다. 답·풀이 시간 확정 후 캡처/업로드하는 순서는 유지한다.

## 검증

- 제공한 네이티브 SVG와 생성 SVG가 동일하다. 2048×1536 PNG의 모든 픽셀이 제공 PNG와 동일하다.
- 자동 렌더 검사: 화면 폭 320, 390, 768, 1024, 1366px; 24 CSS px 간격, 필기 좌표 보존, 2배 저장 이미지, 실제 게스트 lock/capture/upload/advance 흐름.
- 회원 웹 명령 검사: 완료 잠금 후 캡처/업로드, 응답 유실 재시도, 수신 완료 PNG 복구 후 재캡처 방지.
- IAB 브라우저 검수: 회원/게스트 각각 390, 768, 1366px. 풀이판 표시와 가로 넘침 없음 확인. 터치 기기 판정은 미리보기 전용 iPad identity fixture로 재현했다. 실제 iOS Safari/Pencil 장치 시험을 대신하지 않는다.
- `npm run note-grid:verify`, `ui:verify`, `contrast:verify`, `launch-views:verify`, `arena-normal-baseline:verify` 통과.
- 63개 촬영 양식의 격자 영역은 제공 네이티브 PNG와 채널 차이 최대 1 이내이다.
- 정답 9장 + 의도 오답 Q06 1장의 빈 영역은 코드로 생성한 공통 격자와 픽셀 단위로 동일하다. 기존 푸른 AI 격자는 이전 미리보기의 일회성 변환에서 제거했다.

## 결과물

- `output/pdf/Matths_U1_App_Note_Grid_Samples.pdf`: 정답 9장 + Q06 의도 오답 1장, 10쪽.
- `output/handwriting/Matths_U1_App_Note_Grid_Samples.zip`: 합성 이미지, 흰 배경 원본, 격자 레이어, 문항/처리 정보.
- `audit/GOAT_ARENA_NORMAL_BASELINE_GRID_IMAGES.zip`: 갱신한 63장 촬영 양식.
- `output/note-grid/web-phone-member.png`, `web-ipad-member.png`, `web-phone-guest.png`, `web-ipad-guest.png`: 브라우저 검수 화면.

이전 샘플 원본과 수정 전 촬영 양식을 보존했다. 기준 풀이 승인·활성화 상태는 바꾸지 않았다. 이번 작업은 제공된 현재 앱 격자를 기준으로 웹 저장소와 이미지 도구를 수정했으며, 별도 Swift 앱 저장소는 수정하지 않았다.
