# Matths iPad API v1

MongoDB 접속 문자열은 서버의 `config.env`에만 둡니다. iPad 앱은
MongoDB 드라이버를 사용하지 않고 `https://<server>/api/v1`만 호출합니다.

## 보안 원칙

- 운영 서버는 반드시 HTTPS를 사용합니다.
- `DB`, `SECRET`, `IDENTITY_MATCH_SECRET`, `API_TOKEN_SECRET`, `GMAIL_APP_PASSWORD`를 앱에 넣지 않습니다.
- 로그인 응답의 `accessToken`은 iOS Keychain에 저장합니다.
- 인증 요청에는 `Authorization: Bearer <accessToken>`을 붙입니다.
- 비밀번호가 바뀌면 기존 접근 토큰은 자동으로 무효화됩니다.
- API 응답에는 MongoDB 접속정보와 비밀번호 해시가 포함되지 않습니다.
- 운영 서버의 `IDENTITY_MATCH_SECRET`은 동일인 탐지 해시를 안정적으로 비교할 수 있도록 배포 후 임의로 변경하지 않습니다.

## 인증

### 회원가입

`POST /api/v1/auth/register`

```json
{
  "realName": "이학생",
  "name": "수학하는학생",
  "email": "student@example.com",
  "birthDate": "2009-03-14",
  "password": "Password123",
  "schoolGrade": 10,
  "schoolRegion": "서울특별시",
  "schoolCode": "학교코드",
  "termsAccepted": true
}
```

학교 목록은 `GET /api/v1/schools`에서 가져옵니다.
`realName`은 실명, `name`은 학습 화면과 익명 랭킹에서 사용하는
닉네임입니다. 랭킹 표시 기본값은 `nickname`입니다.
`birthDate`는 `YYYY-MM-DD` 형식이며 본인확인에 사용합니다. 재학생은
실명·생년월일·고등학교 코드가 모두 같은 활성 계정이 있을 때만 관리자
중복 검토 알림과 비교 계정 표시가 생성됩니다. `schoolGrade`가
`13`(N수생)이면 `schoolRegion`과 `schoolCode`를 생략할 수 있으며,
학교가 없는 계정은 이 자동 3요소 비교에서 제외됩니다.

### 로그인

`POST /api/v1/auth/login`

```json
{
  "identifier": "student@example.com 또는 수학하는학생",
  "password": "Password123"
}
```

`identifier`에는 이메일 또는 닉네임을 넣을 수 있습니다. 이전 앱과의
호환을 위해 `email` 필드도 당분간 허용합니다.

응답:

```json
{
  "tokenType": "Bearer",
  "accessToken": "...",
  "expiresIn": 2592000,
  "user": {}
}
```

### 비밀번호 재설정

1. `POST /api/v1/auth/password-reset/request` — `{ "email": "..." }`
2. `POST /api/v1/auth/password-reset/verify` — `{ "email": "...", "code": "123456" }`
3. `POST /api/v1/auth/password-reset/complete` — 검증 응답의 `resetId`,
   `userId`와 새 비밀번호를 전송

운영 환경에서는 서버에 `GMAIL_USER`와
`GMAIL_APP_PASSWORD`를 설정해야 합니다. iPad 앱에는 두 값을
포함하지 않습니다.

## 학습 데이터

- `GET /api/v1/me`
- `DELETE /api/v1/me`
- `PATCH /api/v1/me/ranking-identity`
- `GET /api/v1/curriculum`
- `GET /api/v1/learning`
- `PATCH /api/v1/learning/:courseId/:unitId/:conceptId/topics/:topicIndex`

진도 갱신 본문:

```json
{ "completed": true }
```

랭킹 표시 설정:

```json
{
  "rankingDisplayMode": "nickname"
}
```

`rankingDisplayMode`는 `nickname` 또는 `realName`만 허용합니다.
실명은 회원가입 때 등록한 값으로 고정되며 이 API에서 변경할 수
없습니다.

계정 탈퇴:

```json
{
  "password": "현재 비밀번호",
  "confirmation": "탈퇴",
  "acknowledgeAnonymousRetention": true
}
```

`DELETE /api/v1/me`는 실명·이메일·닉네임·정확한 학교와 로그인
정보를 제거합니다. 문제 풀이, 평가 결과와 소요 시간 등 학습 기록은
항상 익명 데이터로 보존하며, 탈퇴한 계정과 기존 토큰은 복구하거나
다시 사용할 수 없습니다.

## 40초 눈풀이

- `GET /api/v1/quick-practice/stats`
- `POST /api/v1/quick-practice/start` — `{ "pointValue": 2 }`
- `POST /api/v1/quick-practice/:instanceId/submit` — `{ "answer": "12" }`
- `POST /api/v1/quick-practice/:instanceId/expire`

마감 시각은 시작 응답의 `deadlineAt`입니다. 화면 타이머와 무관하게
서버가 40초 초과 여부를 최종 판정합니다.

## 문구 제안소

- `GET /api/v1/coach-suggestions`
- `POST /api/v1/coach-suggestions`

```json
{
  "mode": "spicy",
  "situation": "incorrect",
  "message": "지금 틀린 한 줄이 오늘 가장 중요한 공부다."
}
```

운영자 승인 API:

`PATCH /api/v1/coach-suggestions/:suggestionId`

```json
{ "action": "approve" }
```
