# Matths iPad API v1

MongoDB 접속 문자열은 서버의 `config.env`에만 둡니다. iPad 앱은
MongoDB 드라이버를 사용하지 않고 `https://<server>/api/v1`만 호출합니다.

## 보안 원칙

- 운영 서버는 반드시 HTTPS를 사용합니다.
- `DB`, `SECRET`, `API_TOKEN_SECRET`, `EMAIL_API_KEY`를 앱에 넣지 않습니다.
- 로그인 응답의 `accessToken`은 iOS Keychain에 저장합니다.
- 인증 요청에는 `Authorization: Bearer <accessToken>`을 붙입니다.
- 비밀번호가 바뀌면 기존 접근 토큰은 자동으로 무효화됩니다.
- API 응답에는 MongoDB 접속정보와 비밀번호 해시가 포함되지 않습니다.

## 인증

### 회원가입

`POST /api/v1/auth/register`

```json
{
  "realName": "이학생",
  "name": "수학하는학생",
  "email": "student@example.com",
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

### 로그인

`POST /api/v1/auth/login`

```json
{
  "email": "student@example.com",
  "password": "Password123"
}
```

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

운영 환경에서는 `EMAIL_API_KEY`와 인증된
`admin@lsbproduction.com` 발신 도메인이 필요합니다.

## 학습 데이터

- `GET /api/v1/me`
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
  "realName": "이학생",
  "rankingDisplayMode": "nickname"
}
```

`rankingDisplayMode`는 `nickname` 또는 `realName`만 허용합니다.

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
