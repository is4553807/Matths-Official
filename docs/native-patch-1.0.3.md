# iOS 1.0.3 서버 계약

기존 학생·교사 토큰, 웹 쿠키와 가입/결제 정책을 유지한다. 보호자 네이티브 세션은 이들과 분리한다. 새 계정은 이메일 활성화 전 세션을 발급하지 않는다.

## 새 공개 경로

- `GET /auth/portal-app/:provider?accountType=parent|academy&code_challenge=...`: Google/Kakao/Apple 인증 시작. 임의 리디렉션 주소를 받지 않는다.
- 공급자의 기존 콜백에서 검증한 신원만 암호화된 15분 증표로 바꾸고 `matths://portal-auth/callback?ticket=...`에 반환한다.
- `POST /api/v1/auth/portal/exchange`: `ticket`, `codeVerifier`. 상태는 `authenticated`, `registration_required`, `email_verification_required`.
- `POST /api/v1/auth/portal/register`: `registrationToken`, `codeVerifier`, 명시적 약관 동의와 계정별 필드. 클라이언트의 이메일·역할·소셜 신원으로 계정을 연결하지 않는다. 성공은 202 활성화 대기이며 자동 로그인하지 않는다.
- `POST /api/v1/auth/academy/register`: 일반 학원/교사 이메일 가입. 기관 승인 또는 원장 승인 정책을 정본 서비스에서 적용한다.
- `POST /api/v1/parent-native/login`, `/register`: 이메일 인증과 역할 검사를 통과한 보호자만 독립 세션을 받는다.

## 보호자 전용 세션

`/api/v1/parent-native`의 dashboard, mailbox, mailbox/:id, 단건/전체 읽음, invite, logout은 별도 12시간 토큰만 허용한다. 학생/교사 토큰은 거부한다. DB에는 토큰 해시를 저장하며 비밀번호 변경, 비활성화, 공급자 연결 해제, 만료 및 로그아웃을 재검사한다. 부모/자녀 연결과 알림 소유권은 서버 정본 조건을 사용한다.

## 교사·관리자

- `GET /api/v1/academy/teacher/attendance/export`: classId, startDate, endDate. 최대 366일, 기존 반 권한 검사, CSV 수식 이스케이프, 다운로드로 출결 변경 없음.
- `GET /api/v1/academy/teacher/classes/:classId/classwork/weeks/:weekId/student-preview`: 읽기 전용, 정답 키·학생 제출 이력 제외.
- `POST /api/v1/academy/teacher/staff-invite/accept`: 현재 교사 계정 이메일과 지정 초대 이메일 일치 및 원장 승인 대기.
- `GET /api/v1/admin/parents/:parentId/native-preview`: 관리자 권한만 허용. 읽음 및 가족 연결을 변경하지 않는다.
- 학원 읽기 전용 미리보기는 기존 관리자 학원 상세 GET만 사용한다.
- 비밀번호 재설정 API의 `accountType`은 기본 student를 유지하면서 academy/parent 복구를 지원한다. 인증 증표는 역할에 묶인다.

## 검증

```sh
npm run launch:verify
node audit/runMemoryMongoSuite.js audit/verifyNativePortalSocialDb.js audit/verifyNativeParentDb.js audit/verifyNativeSocialRegistrationDb.js audit/verifyAcademyAssignmentNativeDb.js audit/verifyEmailVerificationDb.js
node scripts/verifyPortalSocialLogin.js
node scripts/verifyApplePortalLogin.js
```

배포 후 `node scripts/verifyNativePatchDeployment.js`로 비로그인·빈 요청만 점검한다. 이 검사는 계정/결제를 만들지 않으며 실제 로그인·메일 도착을 대신하지 않는다.

## 설정과 배포 순서

구버전 iOS가 새 인증 대기 응답을 해석하지 못하는 경우를 위해, `X-Matths-Client-Version`은 보내지만 `emailVerificationUI: true`를 보내지 않는 클라이언트에는 403 `EMAIL_VERIFICATION_REQUIRED`와 메일 활성화 안내를 반환한다. 인증 정책을 우회하거나 로그인 토큰을 대신 발급하지 않는다. 새 앱은 네이티브 인증 대기 화면을 표시한다. 옛 Apple 직접 교환 API는 기존 계정 로그인만 유지하며, 새 계정은 업데이트 안내 후 새로운 가입 경로를 사용하도록 한다.

새 환경변수는 없다. 기존 OAuth 설정, Apple 웹 Services ID/콜백, SMTP, MongoDB, API_TOKEN_SECRET 또는 SECRET을 유지한다. 새 NativeParentSession/NativePortalTicket 컬렉션의 고유·TTL 인덱스는 사용 시 준비한다. DB 초기화나 사용자 데이터 삭제는 필요하지 않다.

서버 선배포 → 공개 점검 → 계정 유형별 실제 로그인/메일 확인 → 앱 심사 제출 순서다. 구버전 앱의 기존 경로를 제거하지 않는다. 앱 1.0.3 공개 후에는 새 API를 없애는 구버전 서버 롤백을 하지 말고 호환 경로를 유지한 수정본으로 복구한다.
