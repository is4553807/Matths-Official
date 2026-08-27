# Cloudtype 운영 배포·롤백 런북

이 문서는 `www.matths.kr`의 기존 Cloudtype 앱을 안전하게 재배포하는 절차다. 새 앱을 만들거나 새 DB를 연결하는 절차가 아니다.

## 배포 정본

- 저장소: `is4553807/Matths-Official`
- 브랜치: `main`
- 앱 이름: `matths`
- 공개 연락처: `dltkddbs4553@matths.kr`
- 운영 URL: `https://www.matths.kr`

과거 요청 커밋 `939c25af`는 최신 `main`의 조상이 아니므로 직접 배포하지 않는다. 항상 원격 `main`의 현재 tip을 검증한 뒤 배포한다.

## 한 번만 준비할 GitHub 설정

GitHub 저장소의 `production` Environment에 보호 규칙과 승인자를 지정한 뒤 다음을 등록한다.

Secret:

- `CLOUDTYPE_API_KEY`: 기존 Cloudtype 프로젝트의 배포 API key

Variables:

- `CLOUDTYPE_PROJECT`: Cloudtype의 project 이름
- `CLOUDTYPE_STAGE`: 운영 stage 이름
- `CLOUDTYPE_APP`: 기존 운영 app 이름. 현재 명세상 `matths`
- `CLOUDTYPE_SOURCE_BRANCH`: Cloudtype 콘솔에서 직접 확인한 연결 브랜치. 반드시 `main`

API key, OAuth token, Apple private key는 이 문서·이슈·PR·workflow input·터미널 출력에 붙이지 않는다.

## Cloudtype 콘솔에서 확인할 값

배포 전 기존 운영 앱에서 다음을 확인한다.

- owner/project, stage, app
- source repository=`is4553807/Matths-Official`
- source branch=`main`
- 현재 성공 release ID
- 직전 정상 rollback release ID
- health 상태와 마지막 성공 배포 시각

환경변수는 값 전체를 복사하지 말고 이름과 설정 여부만 확인한다.

- `APPLE_BUNDLE_ID=kr.matths.app`
- `APPLE_TEAM_ID=64U874RU4D`
- `APPLE_KEY_ID=9QKK29V5FQ`
- `APPLE_PRIVATE_KEY` configured (값 출력 금지)
- `APPLE_ALLOW_SANDBOX=true`
- `FINANCE_APPLE_FEE_RESERVE_BPS=3000`
- `PUBLIC_CONTACT_EMAIL=dltkddbs4553@matths.kr`
- 기존 Google/Kakao OAuth, DB, session, storage, SMTP secret 유지

## 배포

1. GitHub Actions에서 `Deploy Cloudtype production` workflow를 연다.
2. `Run workflow`의 브랜치는 `main`으로 둔다.
3. confirmation에 정확히 `DEPLOY_PRODUCTION`을 입력한다.
4. production Environment 승인자가 source SHA와 Cloudtype target을 확인하고 승인한다.
5. workflow가 다음 순서를 자동 실행한다.
   - 원격 `main` tip 일치 검사
   - Node.js 24에서 `npm ci --no-audit`
   - `npm run launch:verify`
   - 임시 단일 노드 MongoDB replica set의 `npm run launch-db:verify-memory`
   - Bearer header 방식 Cloudtype webhook 요청
   - 최대 10분 동안 `npm run production:verify` 반복
   - 성공한 source SHA와 workflow URL을 step summary에 기록

배포 webhook은 기존 앱 설정을 다시 배포한다. 따라서 `CLOUDTYPE_SOURCE_BRANCH=main` 변수만 등록하는 것으로 충분하지 않으며, 콘솔의 실제 연결 브랜치가 `main`인지 사람이 먼저 확인해야 한다.

## 로컬 운영 스모크

배포 전후 언제든 다음 명령으로 공개 계약을 확인한다.

```bash
npm run production:verify
```

최대 10분 동안 배포 반영을 기다리려면:

```bash
npm run production:verify -- --wait-seconds 600 --interval-seconds 15
```

검사 범위:

- health/readiness와 보안 헤더
- Google/Kakao/Apple provider 활성화 및 Apple revocable
- 웹 Google/Kakao 공식 OAuth redirect와 운영 callback
- Kakao 앱 PKCE 진입점
- social exchange와 Google legacy exchange
- Apple exchange nonce 경계
- storefront Bearer 경계와 App Store notification 경로
- `/privacy`, `/terms`의 단일 공개 연락처
- 구 주소 `dltnqls7297@matths.kr`와 공개용이 아닌 `admin@lsbproduction.com` 비노출

## 배포 증거

workflow가 통과하면 아래 표를 작업 기록에 채운다. release ID는 Cloudtype 콘솔에서 복사하되 secret이나 로그 본문은 복사하지 않는다.

| 항목 | 값 |
|---|---|
| source SHA |  |
| workflow run URL |  |
| Cloudtype owner/project |  |
| stage/app |  |
| release ID |  |
| rollback release ID |  |
| 환경변수 확인 시각 |  |
| health/smoke 통과 시각 |  |
| TestFlight 빌드 | `1.0 (2)` |
| 실기기 E2E 담당자/시각 |  |

## 실기기 E2E

자동 스모크가 통과해도 아래는 테스트 계정과 실제 기기에서 별도로 확인한다.

- TestFlight 1.0(1) Google 로그인
- TestFlight 1.0(2) Google/Kakao/Apple 로그인
- Kakao callback 후 앱 복귀와 기존 계정 재로그인
- Apple 신규·기존·이메일 가리기 계정
- 전용 Apple 테스트 계정 탈퇴와 token revocation
- App Store sandbox 구매, redeem, entitlement, restore, finish

실제 token, authorization code, PKCE verifier, private key는 증거에 남기지 않는다.

## 롤백

다음이면 즉시 직전 정상 rollback release ID로 되돌린다.

- 기존 Google/TestFlight 또는 웹 OAuth 회귀
- OAuth callback 5xx, 잘못된 도메인/scheme
- 사용자 중복 계정
- Apple 버튼은 보이지만 전체 로그인 실패
- commerce redeem 회귀
- 5xx 또는 재시작 급증
- secret 노출

Apple만 실패하면 우선 `APPLE_BUNDLE_ID`를 제거해 버튼을 숨긴 뒤 원인을 조사한다. 전체 회귀면 Cloudtype 콘솔에서 기록한 rollback release ID를 선택해 롤백하고 `npm run production:verify`를 다시 실행한다.

secret이 노출된 경우 단순 롤백으로 끝내지 않는다. 해당 키를 폐기·재발급하고 로그 접근 및 보존 범위를 별도 처리한다.
