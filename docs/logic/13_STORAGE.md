# 13. Matths 파일 저장 정책

## 1. 목적

이 문서는 Matths에서 생성·업로드되는 파일의 권위 있는 저장 위치, 접근 방식, 보존 기간, 백업 및 삭제 원칙을 정의한다.

파일 원본을 MongoDB에 넣지 않는다. MongoDB에는 파일 식별자, 저장 공급자, 저장 목적, 원본 이름, MIME, 크기, SHA-256, 권한, 보존 기한과 백업 상태만 저장한다.

## 2. 저장소 분리 원칙

Matths는 운영자 원본과 사용자 업로드를 서로 다른 저장소에 보관한다.

| 파일 종류 | 저장 목적 코드 | 원본 저장 위치 | 공개 방식 |
|---|---|---|---|
| 운영자 아카이브 자료 | `ADMIN_ARCHIVE` | Cloudflare R2 비공개 객체 | 로그인·폴더 권한 확인 후 PDF는 개인 식별 사본, 비PDF는 5분 서명 URL |
| Matths 주간 공식 모의고사 문제지 | `ADMIN_WEEKLY_MOCK` | Cloudflare R2 비공개 객체 | 응시·상품·공개 시각 확인 후 PDF는 개인 식별 사본, 비PDF는 5분 서명 URL |
| 운영자 확인용 답지·공식 암기 자료 | `ADMIN_WEEKLY_MOCK` | Cloudflare R2 비공개 객체 | 운영자 또는 허용된 시험 화면에서 5분 서명 URL |
| Matths 교재 상점 썸네일·상세 이미지·상품 파일 | 상점 자산 | Cloudflare R2 비공개 객체 | 상품 공개·로그인·무료 또는 구매 권한 확인 후 PDF는 개인 식별 사본, 비PDF는 5분 서명 URL |
| 주간 공식 모의고사 채점 JSON | DB 입력용 임시 파일 | 답안·배점·해설을 검증해 MongoDB에 구조화한 뒤 임시 파일 삭제 | 원본 JSON 직접 제공 안 함 |
| GOAT Arena 1대1 풀이 증거 | `USER_ARENA_EVIDENCE` | Cloudinary `authenticated` 자산 | 운영자 권한 확인 후 5분 서명 URL |
| 게시판 사진·첨부파일 | `USER_COMMUNITY` | Cloudinary `authenticated` 자산 | 게시판 열람 권한 확인 후 서명 URL |
| 주간 공식 모의고사 사용자 소명자료 | `USER_PRIVATE_MOCK_INTEGRITY` | Cloudinary `authenticated` 자산 | 본인·운영자 권한 확인 후 서명 URL |
| 로고·CSS·배경·프론트엔드 영상 | 배포 정적 자산 | `public/` | 정적 파일로 공개 |

운영자 파일과 Matths 교재 상점 파일은 `FILE_STORAGE_PROVIDER` 값과 무관하게 R2를 사용한다. 사용자 파일은 Cloudinary가 설정되지 않았거나 업로드에 실패하면 로컬에 대체 저장하지 않고 오류를 반환한다. R2 업로드도 실패 시 로컬 파일을 권위 원본으로 남기지 않고 요청을 실패 처리한다.

사용자 업로드는 검증과 Cloudinary 전송을 위해 `storage/tmp/user-cloud/`에만 잠시 머문다. 성공 시 즉시 삭제하고, 프로세스 비정상 종료로 남은 임시 파일은 24시간 후 정리한다. 이 경로는 권위 원본이나 복구 사본이 아니다.

## 3. R2 운영자·상점 저장소

아카이브, 주간 공식 모의고사와 Matths 교재 상점 자산은 R2 비공개 버킷이 권위 원본이다. MongoDB에는 `r2ObjectKey`, `r2Sha256`, `r2ETag`, MIME, 크기와 원본 파일명만 저장한다. 객체 키나 버킷 URL은 사용자에게 직접 공개하지 않는다.

업로드 파일은 검증을 위해 다음 임시 경로에 잠시 저장할 수 있다.

```text
storage/archive/
storage/tmp/store-uploads/
```

R2 업로드와 DB 저장이 완료되면 임시 파일을 즉시 삭제한다. 이 경로는 재배포 뒤 유지될 필요가 없으며 복구 원본으로 취급하지 않는다.

다운로드는 Express 컨트롤러가 로그인, 관리자 여부, 무료 상품 또는 구매 권한, 폴더 접근 권한과 시험 공개 시각을 먼저 검사한다. 비PDF는 최대 5분 동안만 유효한 R2 서명 URL을 생성한다. PDF는 R2 원본을 서버 임시 경로로 읽은 뒤 요청 사용자 전용 식별 사본을 생성해 전송하고, 응답 완료 직후 임시 원본과 사본을 삭제한다. R2 권위 원본 자체에는 개인 식별 정보를 덧쓰지 않는다.

### 3.1 PDF 개인 식별 발급

아카이브, 주간 공식 모의고사와 Matths 교재 상점 PDF에는 다운로드 시점마다 다음 정보를 담은 발급 기록을 만든다.

- `user_id`: 다운로드 권한을 통과한 로그인 사용자 ID
- `exam_id`: 시험, 아카이브 자료 또는 상점 상품을 가리키는 식별값
- `downloaded_at`: 실제 사본 생성 시각
- 문서 발급 ID와 짧은 추적 코드

식별 정보는 세 계층으로 삽입한다.

1. 모든 페이지의 문제 영역을 가로지르는 낮은 농도의 `MATTHS + 추적 코드 + KST 발급 시각`
2. HMAC으로 위·변조를 확인할 수 있는 서명 토큰과 PDF 메타데이터
3. 페이지마다 다른 미세 문자, PDF 페이지 사전 값과 좌표 패턴

MongoDB `pdfWatermarkIssuances`에는 발급 사용자, 자료, 발급 시각, 추적 코드, 페이지 수와 처리 상태만 저장한다. 개인 식별 PDF 파일 자체는 영구 저장하지 않는다. 비밀 서명키는 `DOCUMENT_WATERMARK_SECRET`에 등록하며 브라우저, PDF 화면 문구, 로그와 Git에 원문을 노출하지 않는다.

운영자는 `/admin/pdf-forensics`에 유출 의심 PDF 또는 스크린샷을 올려 발급 원장에 연결된 사용자·시험·다운로드 시각을 확인할 수 있다. PDF 원본은 서명 토큰·메타데이터·페이지별 코드를 검증한다. PNG·JPG·WEBP·HEIC 이미지는 서버 내부 OCR이 반복 가시 추적 문구를 회전·명암 보정해 읽고, 인식된 코드와 발급 원장을 유사도 대조한다. 외부 OCR API로 원본을 전송하지 않는다.

이미지는 PDF 서명과 숨김 메타데이터가 사라진 2차 자료이므로 결과에 OCR 일치 신뢰도를 함께 표시한다. 신뢰도 후보만으로 사용자를 제재하지 않고 원본 해상도, 편집 흔적, 발급 시각과 다른 운영 증거를 함께 확인한다. 워터마크가 여러 번 보이는 넓은 원본 캡처가 가장 안정적이며, 심한 자르기·덧칠·저해상도·강한 압축은 자동 식별률을 낮춘다. 분석용 PDF·이미지 업로드와 OCR 전문은 DB에 영구 저장하지 않고 결과 생성 직후 삭제한다.

## 4. Cloudinary 사용자 저장소

Cloudinary 환경 변수는 다음 중 한 방식으로 등록한다.

```text
FILE_STORAGE_PROVIDER=cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

또는 다음 값을 각각 등록한다.

```text
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

모든 사용자 자산은 `authenticated` 전달 유형으로 업로드한다. API secret은 서버 환경 변수에만 저장하며 브라우저, EJS, 응답 JSON, 로그와 Git에 노출하지 않는다.

Cloudinary 폴더:

- `matths/arena-evidence`
- `matths/community`
- `matths/private-mock-integrity`

Cloudinary URL을 DB에 영구 저장하지 않는다. 접근 요청마다 Matths 권한을 확인하고 짧은 만료 시간을 가진 서명 URL을 새로 생성한다.

## 5. 파일 제한

| 업로드 종류 | 개수 | 파일당 제한 | 요청 전체 제한 | 허용 형식 |
|---|---:|---:|---:|---|
| GOAT Arena 풀이 증거 | 1–5개 | 10MB | 30MB | JPEG, PNG, WEBP, HEIC |
| 게시판 이미지 | 게시글당 최대 5개에 포함 | 10MB | 게시글 전체 50MB | JPEG, PNG, WEBP, HEIC |
| 게시판 일반 첨부 | 게시글당 최대 5개 | 25MB | 게시글 전체 50MB | PDF, 문서, 스프레드시트, 프레젠테이션, ZIP, 이미지 |
| 사용자 모의고사 소명자료 | 1–10개 | 10MB | 100MB | PDF, JPEG, PNG, WEBP, HEIC |
| 주간 공식 모의고사 파일 | 필드별 최대 10개 | 100MB | 요청 필드 제한 적용 | PDF, JSON |
| 운영자 공식 암기 자료 | 1개 | 100MB | 100MB | PDF |
| 운영자 아카이브 | 요청당 최대 20개 | 500MB | 파일별 제한 적용 | PDF, 문서, 스프레드시트, 프레젠테이션, ZIP, JSON, 이미지 |
| 운영자 유출 자료 분석 | 1개 | 150MB·이미지 최대 4천만 화소 | 150MB | PDF, PNG, JPEG, WEBP, HEIC |

확장자만 신뢰하지 않는다. 풀이 증거와 소명자료는 magic bytes를 확인하고, 저장된 MIME과 실제 파일 형식이 다르면 열람과 등록을 차단한다. 실행 파일과 스크립트 파일은 허용하지 않는다.

## 6. 파일명·무결성·중복

- 실제 저장 이름은 서버가 UUID 기반으로 생성한다.
- 사용자 원본 파일명은 표시용 메타데이터로만 보존한다.
- 경로 구성에는 항상 `path.basename`과 허용 디렉터리 검사를 사용한다.
- GOAT Arena 풀이 증거는 SHA-256을 저장해 상대와 같은 증거가 제출됐는지 검사한다.
- 운영자·상점 파일은 R2 업로드 전에 SHA-256을 계산하고 객체 메타데이터와 MongoDB에 기록한다.
- 같은 SHA-256 파일이 다시 올라와도 업로드 기록은 별도로 남긴다. 물리 중복 제거는 향후 백업 최적화 단계에서만 수행한다.

## 7. 보존과 삭제

### 7.1 GOAT Arena 풀이 증거

경기 증거 원본은 제출일로부터 90일 동안 보관한다. 90일이 지나도 다음 경우에는 삭제하지 않는다.

- 경기 무결성 상태가 `CLEAR`가 아님
- 경기 상태가 정산 완료 또는 취소·무효 상태가 아님
- 증거가 이상 징후 검토 대상으로 표시됨
- 운영자가 보존 사유를 기록함

삭제 조건을 만족하면 Cloudinary 원본을 삭제하되 경기, 점수, 파일명, MIME, 크기와 SHA-256 감사 메타데이터는 DB에 남긴다. 삭제된 원본은 다시 열람할 수 없다.

### 7.2 게시판 첨부

게시글이 유지되는 동안 보관한다. 게시글을 완전 삭제하거나 계정을 모든 데이터 삭제 방식으로 제거하면 Cloudinary 원본도 함께 삭제한다. 경고 횟수가 1 이상인 사용자는 신규 파일을 올릴 수 없다.

### 7.3 운영자 아카이브·주간 공식 모의고사

운영자가 삭제하기 전까지 보관한다. 공개 대기 또는 응시 중인 공식 모의고사와 연결된 파일은 삭제할 수 없다. 삭제 전 R2 백업 상태와 연결된 시험을 확인한다.

일반 아카이브 삭제는 R2 객체와 DB 행을 즉시 지우지 않고 30일 휴지통으로 이동한다. 운영자는 휴지통에서 원래 폴더로 복구하거나 즉시 영구 삭제할 수 있다. 30일이 지나면 스케줄러가 R2 원본과 DB 행을 영구 삭제한다. R2 연결이 끊긴 경우에는 원격 객체가 남지 않도록 영구 삭제를 보류한다. 공개 대기 또는 응시 중인 주간 공식 모의고사 연결 파일은 휴지통으로 이동할 수 없다.

기존 로컬 파일은 `npm run storage-r2:migrate -- --apply`로 R2에 올리고 MongoDB의 권위 저장 위치를 전환한다. 마이그레이션은 로컬 사본을 자동 삭제하지 않는다.

## 8. R2 연결과 기존 파일 이전

운영자·상점 신규 파일은 업로드 요청 안에서 R2 저장을 완료한 뒤에만 DB 등록을 확정한다. 실서비스 다운로드도 R2 원본을 사용한다.

### 8.1 최초 연결

1. `https://dash.cloudflare.com`에서 Cloudflare 계정을 만든다.
2. 대시보드의 **Storage & databases → R2 → Overview**에서 R2를 활성화한다.
3. 외부 공개를 끈 비공개 버킷 `matths-admin-backup`을 만든다.
4. **Manage R2 API Tokens**에서 `Object Read & Write` 권한을 선택하고 해당 버킷만 허용하는 API 토큰을 만든다.
5. 발급 화면의 Account ID, Access Key ID, Secret Access Key를 `config.env`에 입력한다. Secret Access Key는 발급 직후에만 표시되므로 안전한 비밀 관리 저장소에도 별도로 보관한다.

`config.env`에는 다음 항목이 미리 준비되어 있다.

```text
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=matths-admin-backup
```

값을 입력한 뒤 버킷 접근을 확인한다. 기본 명령은 안전하게 버킷 조회만 실행하며, 이 결과가 토큰 권한이 읽기 전용이라는 뜻은 아니다.

```bash
npm run storage-r2:verify
```

업로드와 즉시 삭제까지 점검하려면 일회성으로 `R2_VERIFY_WRITE=1`을 지정해 같은 명령을 실행한다. 점검용 객체는 성공 후 바로 삭제된다.

객체 키 형식:

```text
matths/{archive-or-store}/{owner-id}/{kind}/{year}/{month}/{uuid}.{extension}
```

R2 인증값이 없으면 서버 자체는 실행할 수 있지만 운영자 아카이브·주간 공식 모의고사·상점 신규 파일 업로드는 `503`으로 거절한다. 기존 로컬 파일 이전은 먼저 변경 없는 미리보기를 실행한다.

```bash
npm run storage-r2:migrate
npm run storage-r2:migrate -- --apply
```

## 9. 임시 디스크 보호

Cloudinary와 R2 업로드는 로컬 임시 파일을 거치지만 업로드 성공 직후 임시 파일을 삭제한다. 실패하거나 DB 저장이 취소되면 이미 생성한 원격 객체와 로컬 임시 파일을 정리한다. 임시 디스크는 파일 원본 보존이나 백업에 사용하지 않는다.

## 10. 계정 삭제

사용자가 모든 데이터 삭제를 선택하면 다음 원본을 함께 삭제한다.

- 게시판 Cloudinary 첨부
- GOAT Arena Cloudinary 풀이 증거
- 사용자 모의고사 Cloudinary 소명자료
- 사용자에게 귀속된 비공개 ArchiveItem

익명 통계 보존을 선택해도 원본 파일은 개인 식별 가능성이 있으므로 보존하지 않는다. 파일이 삭제된 뒤 통계용 점수·시간 데이터만 비식별 상태로 남길 수 있다.

개인 식별 PDF 발급 기록은 익명 통계 보존 시 탈퇴 처리된 익명 사용자 ID와 연결해 보존한다. PDF 안에는 실명이나 이메일이 아니라 내부 사용자 ID가 들어가므로, 운영자는 탈퇴 전 개인정보를 복원하지 않고도 같은 익명 계정에서 발급된 문서인지 확인할 수 있다. 관리자가 **모든 데이터 삭제**를 선택하면 `pdfWatermarkIssuances`의 사용자 매핑도 삭제한다. 이 경우 이미 외부로 나간 PDF의 서명 진위와 발급 ID는 파일 자체에서 확인할 수 있지만 삭제된 계정으로 다시 연결할 수는 없다.

## 11. 운영 장애 원칙

- Cloudinary 장애: 사용자 신규 파일 업로드를 실패 처리하고 로컬 영구 저장으로 대체하지 않는다.
- 임시 디스크 장애: 신규 파일 업로드만 실패 처리하며 이미 R2·Cloudinary에 저장된 원본 제공은 유지한다.
- R2 장애: 운영자·상점 신규 업로드와 R2 파일 제공을 실패 처리하고 로컬 원본으로 대체하지 않는다.
- DB 저장 실패: 이미 올라간 Cloudinary 또는 R2 객체와 로컬 임시 파일을 정리한다.
- 서명 URL 만료: 사용자가 다시 권한 검사를 통과하면 새 URL을 발급한다.

## 12. 코드 위치

| 책임 | 파일 |
|---|---|
| R2 객체 업로드·삭제·서명 URL | `services/r2ObjectStorageService.js` |
| 용도별 저장 정책·Cloudinary/R2 서명 | `services/fileStorageService.js` |
| 운영자 R2 아카이브 | `services/archiveService.js` |
| Matths 교재 상점 R2 자산 | `services/storeService.js` |
| PDF 개인 사본 발급·서명 검증·스크린샷 OCR 유출 분석 | `services/pdfWatermarkService.js` |
| PDF 발급 원장 | `models/documentSecurityModel.js` |
| 운영자 PDF 분석 업로드 제한 | `middleware/pdfForensicsUpload.js` |
| 주간 공식 모의고사와 소명자료 | `services/privateMockExamService.js` |
| 게시판 첨부 | `services/communityAttachmentService.js` |
| GOAT Arena 풀이 증거와 90일 정리 | `services/arenaMatchEvidenceService.js` |
| 기존 로컬 파일 R2 이전 | `scripts/migrateLocalFilesToR2.js` |
| 운영자 업로드 제한 | `middleware/archiveUpload.js` |
| 사용자 경기 증거 제한 | `middleware/arenaEvidenceUpload.js` |
| 게시판 업로드 제한 | `middleware/communityUpload.js` |

## 13. 배포 전 확인 목록

- `config.env` 또는 배포 서비스 secret에 Cloudinary 값을 등록했는가
- `storage/tmp/user-cloud/`가 외부 공개 경로가 아니며 24시간 정리 작업이 실행되는가
- R2 비공개 버킷과 API 토큰을 등록했는가
- `npm run file-storage:verify-cloud`가 통과하는가
- `npm run storage-policy:verify`가 통과하는가
- R2 읽기·업로드·삭제 검증을 완료했는가
- 기존 로컬 아카이브·상점 파일의 R2 마이그레이션 결과가 누락 0건인가
- `DOCUMENT_WATERMARK_SECRET`을 배포 secret에 등록했는가
- 아카이브·주간 공식 모의고사·무료 상점 PDF를 내려받아 페이지별 워터마크, PDF 원본 추적, 해당 페이지 스크린샷 OCR 추적 결과를 확인했는가
- API secret과 R2 secret이 Git과 로그에 포함되지 않았는가
