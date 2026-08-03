# 13. Matths 파일 저장 정책

## 1. 목적

이 문서는 Matths에서 생성·업로드되는 파일의 권위 있는 저장 위치, 접근 방식, 보존 기간, 백업 및 삭제 원칙을 정의한다.

파일 원본을 MongoDB에 넣지 않는다. MongoDB에는 파일 식별자, 저장 공급자, 저장 목적, 원본 이름, MIME, 크기, SHA-256, 권한, 보존 기한과 백업 상태만 저장한다.

## 2. 저장소 분리 원칙

Matths는 운영자 원본과 사용자 업로드를 서로 다른 저장소에 보관한다.

| 파일 종류 | 저장 목적 코드 | 원본 저장 위치 | 공개 방식 |
|---|---|---|---|
| 운영자 아카이브 자료 | `ADMIN_ARCHIVE` | 서버 영구 디스크 `storage/archive/` | 로그인·폴더 권한 확인 후 서버 전송 |
| Matths 주간 공식 모의고사 문제지 | `ADMIN_WEEKLY_MOCK` | 서버 영구 디스크 `storage/archive/` | 응시·상품·공개 시각 확인 후 서버 전송 |
| 운영자 확인용 답지·공식 암기 자료 | `ADMIN_WEEKLY_MOCK` | 서버 영구 디스크 `storage/archive/` | 운영자 또는 허용된 시험 화면에서 서버 전송 |
| 주간 공식 모의고사 채점 JSON | DB 입력용 임시 파일 | 답안·배점·해설을 검증해 MongoDB에 구조화한 뒤 임시 파일 삭제 | 원본 JSON 직접 제공 안 함 |
| GOAT Arena 1대1 풀이 증거 | `USER_ARENA_EVIDENCE` | Cloudinary `authenticated` 자산 | 운영자 권한 확인 후 5분 서명 URL |
| 게시판 사진·첨부파일 | `USER_COMMUNITY` | Cloudinary `authenticated` 자산 | 게시판 열람 권한 확인 후 서명 URL |
| 주간 공식 모의고사 사용자 소명자료 | `USER_PRIVATE_MOCK_INTEGRITY` | Cloudinary `authenticated` 자산 | 본인·운영자 권한 확인 후 서명 URL |
| 로고·CSS·배경·프론트엔드 영상 | 배포 정적 자산 | `public/` | 정적 파일로 공개 |

운영자 파일은 `FILE_STORAGE_PROVIDER` 값과 무관하게 로컬 영구 디스크를 사용한다. 사용자 파일은 Cloudinary가 설정되지 않았거나 업로드에 실패하면 로컬에 대체 저장하지 않고 오류를 반환한다.

사용자 업로드는 검증과 Cloudinary 전송을 위해 `storage/tmp/user-cloud/`에만 잠시 머문다. 성공 시 즉시 삭제하고, 프로세스 비정상 종료로 남은 임시 파일은 24시간 후 정리한다. 이 경로는 권위 원본이나 복구 사본이 아니다.

## 3. 운영자 로컬 저장소

기본 경로는 `storage/archive/`이며 `ARCHIVE_STORAGE_DIR`로 변경할 수 있다. 이 폴더는 `public/` 아래에 두지 않으며 정적 URL로 공개하지 않는다.

운영 환경에서는 재배포·재시작 뒤에도 유지되는 영구 디스크가 연결되어야 한다. 확인 후 다음 값을 설정한다.

```text
LOCAL_STORAGE_PERSISTENT=1
ARCHIVE_STORAGE_DIR=/persistent-volume/matths/archive
```

`NODE_ENV=production`에서 `LOCAL_STORAGE_PERSISTENT=1`이 없으면 운영자 신규 업로드를 거절한다.

다운로드는 Express 컨트롤러가 로그인, 관리자 여부, 상품, 폴더 접근 권한과 시험 공개 시각을 검사한 뒤 파일을 전송한다. 파일 시스템 절대 경로나 저장 파일명은 사용자에게 노출하지 않는다.

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

확장자만 신뢰하지 않는다. 풀이 증거와 소명자료는 magic bytes를 확인하고, 저장된 MIME과 실제 파일 형식이 다르면 열람과 등록을 차단한다. 실행 파일과 스크립트 파일은 허용하지 않는다.

## 6. 파일명·무결성·중복

- 실제 저장 이름은 서버가 UUID 기반으로 생성한다.
- 사용자 원본 파일명은 표시용 메타데이터로만 보존한다.
- 경로 구성에는 항상 `path.basename`과 허용 디렉터리 검사를 사용한다.
- GOAT Arena 풀이 증거는 SHA-256을 저장해 상대와 같은 증거가 제출됐는지 검사한다.
- 운영자 로컬 파일은 R2 백업 전에 SHA-256을 계산한다.
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

일반 아카이브 삭제는 파일과 DB 행을 즉시 지우지 않고 30일 휴지통으로 이동한다. 운영자는 휴지통에서 원래 폴더로 복구하거나 즉시 영구 삭제할 수 있다. 30일이 지나면 스케줄러가 로컬·Cloudinary 원본, R2 백업 객체와 DB 행을 영구 삭제한다. R2 백업이 존재하지만 R2 연결이 끊긴 경우에는 백업 사본이 남지 않도록 영구 삭제를 보류한다. 공개 대기 또는 응시 중인 주간 공식 모의고사 연결 파일은 휴지통으로 이동할 수 없다.

관리자는 Arena 감사 화면에서 R2 복원 점검을 실행할 수 있다. 서버는 백업 객체를 임시 경로로 내려받아 `backupSha256`과 다시 계산한 SHA-256을 비교하고 임시 파일을 즉시 지운다. 같은 작업에서 로컬 영구 볼륨에 원본이 없는 `BACKED_UP` 자료만 R2에서 내려받아 임시 파일 검증 뒤 원래 저장명으로 원자적으로 복구한다. 기존 로컬 원본은 덮어쓰지 않는다.

## 8. R2 증분 백업

운영자 로컬 파일은 등록 약 10초 뒤 Cloudflare R2 비공개 버킷으로 증분 백업을 시도하고, 누락·실패분을 포함한 전체 증분 백업을 매일 03:30 KST에 다시 실행한다. 실서비스 다운로드는 계속 로컬 원본을 사용하며 R2는 장애 복구용이다.

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

백업 객체 키 형식:

```text
matths-admin-files/{storage-purpose}/{archive-item-id}/{stored-name}
```

로컬 SHA-256과 R2 객체 메타데이터의 SHA-256이 같으면 다시 업로드하지 않는다. 결과는 `backupStatus`, `backupObjectKey`, `backupSha256`, `backedUpAt`, `backupError`에 기록한다.

R2 인증값이 없으면 백업 작업만 비활성화되고 Matths 서버는 계속 실행된다. 운영자 페이지에는 R2 미연결 상태를 표시한다. 수동 실행 명령은 다음과 같다.

```bash
npm run storage:backup
```

## 9. 디스크 용량 보호

운영자 화면에 영구 디스크 사용률을 표시한다.

- 70% 이상: 주의
- 85% 이상: 경고 및 용량 증설·백업 확인
- 95% 이상: 신규 운영자 파일 업로드 차단

사용자 Cloudinary 업로드는 로컬 임시 파일을 거치지만 업로드 성공 직후 임시 파일을 삭제한다. 실패하거나 DB 저장이 취소되면 Cloudinary 또는 로컬 임시 파일을 정리한다.

## 10. 계정 삭제

사용자가 모든 데이터 삭제를 선택하면 다음 원본을 함께 삭제한다.

- 게시판 Cloudinary 첨부
- GOAT Arena Cloudinary 풀이 증거
- 사용자 모의고사 Cloudinary 소명자료
- 사용자에게 귀속된 비공개 ArchiveItem

익명 통계 보존을 선택해도 원본 파일은 개인 식별 가능성이 있으므로 보존하지 않는다. 파일이 삭제된 뒤 통계용 점수·시간 데이터만 비식별 상태로 남길 수 있다.

## 11. 운영 장애 원칙

- Cloudinary 장애: 사용자 신규 파일 업로드를 실패 처리하고 로컬 영구 저장으로 대체하지 않는다.
- 로컬 디스크 장애: 운영자 신규 업로드를 차단하고 기존 파일 누락을 관리자 경고로 표시한다.
- R2 장애: 로컬 서비스는 유지하고 `backupStatus=FAILED`로 기록해 재처리한다.
- DB 저장 실패: 이미 올라간 Cloudinary 원본 또는 로컬 업로드 파일을 정리한다.
- 서명 URL 만료: 사용자가 다시 권한 검사를 통과하면 새 URL을 발급한다.

## 12. 코드 위치

| 책임 | 파일 |
|---|---|
| 용도별 저장 정책·Cloudinary 서명 | `services/fileStorageService.js` |
| 운영자 로컬 아카이브 | `services/archiveService.js` |
| 주간 공식 모의고사와 소명자료 | `services/privateMockExamService.js` |
| 게시판 첨부 | `services/communityAttachmentService.js` |
| GOAT Arena 풀이 증거와 90일 정리 | `services/arenaMatchEvidenceService.js` |
| 로컬 운영자 파일 R2 백업 | `services/localStorageBackupService.js` |
| 운영자 업로드 제한 | `middleware/archiveUpload.js` |
| 사용자 경기 증거 제한 | `middleware/arenaEvidenceUpload.js` |
| 게시판 업로드 제한 | `middleware/communityUpload.js` |

## 13. 배포 전 확인 목록

- `config.env` 또는 배포 서비스 secret에 Cloudinary 값을 등록했는가
- `storage/archive/`가 영구 디스크에 연결됐는가
- `storage/tmp/user-cloud/`가 외부 공개 경로가 아니며 24시간 정리 작업이 실행되는가
- `LOCAL_STORAGE_PERSISTENT=1`을 실제 영구 디스크 확인 후 설정했는가
- R2 비공개 버킷과 API 토큰을 등록했는가
- `npm run file-storage:verify-cloud`가 통과하는가
- `npm run storage-policy:verify`가 통과하는가
- R2 수동 백업과 복원 테스트를 완료했는가
- 디스크 70·85·95% 경고가 운영자 화면에 표시되는가
- API secret과 R2 secret이 Git과 로그에 포함되지 않았는가
